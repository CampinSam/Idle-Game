import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { TelemetryService, TelemetrySubscriber, TelemetryEvent } from '../telemetry/telemetry.service';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';
import { GameRulesService, RequirementContext } from '../game-rules/game-rules.service';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import { getWindowStart } from '../../common/util/cadence';

// A QuestDef.cadence value of 'daily' or 'weekly' means the quest auto-resets
// at the start of the next UTC day (or UTC Monday). 'oneoff' is the legacy
// behavior — claimed once unless `repeatable` is true.
function isCadenceQuest(def: any): boolean {
  return def?.cadence === 'daily' || def?.cadence === 'weekly';
}

function freshProgress(objectives: any[]): any[] {
  return objectives.map((obj: any, i: number) => ({
    objectiveIndex: i,
    current: 0,
    target: obj?.target ?? 1,
    completed: false,
  }));
}

function shallowMatch(filter: Record<string, unknown>, data: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (data[k] !== v) return false;
  }
  return true;
}

function makeRng() {
  return {
    chance: (p: number) => Math.random() < p,
    nextInt: (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min,
  };
}

// Normalizes the editor's two top-level shapes into a flat array of outcome
// entries. The OutcomeListEditor saves either `[ ...entries ]` directly or
// `{ rewards: [ ...entries ] }`; everything else (a single entry object) is
// wrapped as a one-item array so the canonical resolver can iterate uniformly.
function normalizeRewardSpec(spec: unknown): any[] {
  if (Array.isArray(spec)) return spec;
  if (spec && typeof spec === 'object') {
    const obj = spec as Record<string, unknown>;
    if (Array.isArray(obj.rewards)) return obj.rewards as any[];
    if (Object.keys(obj).length === 0) return [];
    return [obj];
  }
  return [];
}

@Injectable()
export class QuestService implements TelemetrySubscriber, OnModuleInit {
  private readonly logger = new Logger(QuestService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private telemetryService: TelemetryService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private gameRules: GameRulesService,
    private selectionResolver: SelectionResolverService,
  ) {}

  onModuleInit() {
    this.telemetryService.registerSubscriber(this);
  }

  async processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void> {
    const db = tx || this.prisma;

    // Lazy cadence reset: before counting this event, roll over any daily/
    // weekly quests whose previous window has elapsed. We do this on every
    // event rather than via cron because (a) there is no scheduler in the
    // codebase yet, (b) it's cheap (a single indexed query + at-most-N
    // updates), and (c) it guarantees a player who logs in after a multi-day
    // absence sees fresh quests immediately.
    await this.resetExpiredCadenceQuests(userId, db);

    const instances = await (db as any).questInstance.findMany({
      where: { userId, status: 'active' },
      include: { questDef: true },
    });

    for (const instance of instances) {
      const def = instance.questDef;
      if (!def || !def.enabled) continue;

      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const progress: any[] = Array.isArray(instance.progress)
        ? [...instance.progress]
        : objectives.map((_, i) => ({ objectiveIndex: i, current: 0, target: objectives[i]?.target ?? 1, completed: false }));

      while (progress.length < objectives.length) {
        const i = progress.length;
        progress.push({ objectiveIndex: i, current: 0, target: objectives[i]?.target ?? 1, completed: false });
      }

      let changed = false;
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        if (!obj || progress[i]?.completed) continue;

        if (obj.eventType !== event.eventType) continue;
        if (obj.key != null && obj.key !== event.key) continue;
        if (obj.dataFilter && !shallowMatch(obj.dataFilter, event.data)) continue;

        // Rich selection rule check — optional contextual filter on top of the
        // basic event-type/key/dataFilter match.
        if (obj.selectionRule) {
          if (event.selectionContext) {
            const passes = this.selectionResolver.evaluateAll(obj.selectionRule, event.selectionContext);
            if (!passes) continue;
          } else {
            // selectionRule set but no context provided: log a warning and
            // treat as a pass so misconfigured emitters don't silently freeze progress.
            this.logger.warn(
              `Quest objective has selectionRule but event "${event.eventType}" carries no selectionContext — treating as pass (questDefId=${def.id})`,
            );
          }
        }

        const prog = progress[i];
        const before = prog.current;
        prog.current = Math.min(prog.current + event.amount, prog.target ?? 1);
        if (prog.current >= prog.target) prog.completed = true;
        if (prog.current !== before) changed = true;
      }

      if (!changed) continue;

      const allDone = progress.every((p) => p.completed);
      const updateData: any = { progress };
      if (allDone) {
        updateData.status = 'completed';
        updateData.completedAt = new Date();
      }

      await (db as any).questInstance.update({
        where: { id: instance.id },
        data: updateData,
      });

      if (allDone) {
        try {
          await this.notificationService.createNotification({
            userId,
            type: 'quest_complete',
            category: 'quest',
            priority: 'high',
            title: 'Quest Complete!',
            body: def.name,
            meta: { type: 'quest', questInstanceId: instance.id, questDefId: def.id },
            sourceType: 'quest',
            sourceId: instance.id,
          }, tx);
        } catch (err) {
          this.logger.warn(`Failed to send quest complete notification: ${err}`);
        }
      }
    }
  }

  async getOrInitInstance(userId: string, questDefId: string, tx?: any): Promise<any> {
    const db = tx || this.prisma;

    const existing = await (db as any).questInstance.findUnique({
      where: { userId_questDefId: { userId, questDefId } },
      include: { questDef: true },
    });

    if (existing) {
      if (existing.status === 'claimed' && !existing.questDef?.repeatable) return null;
      return existing;
    }

    const def = await (db as any).questDef.findUnique({ where: { id: questDefId } });
    if (!def || !def.enabled) return null;

    const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];

    // Stamp the cadence window start on creation so the very first claim
    // already has the correct boundary recorded. One-off quests stay null.
    const windowStartedAt = isCadenceQuest(def)
      ? getWindowStart(def.cadence, new Date())
      : null;

    return (db as any).questInstance.create({
      data: { userId, questDefId, progress: freshProgress(objectives), windowStartedAt },
      include: { questDef: true },
    });
  }

  /**
   * Roll over any daily/weekly quest instances whose recorded window is
   * older than the current window. Idempotent — instances already in the
   * current window are skipped by the WHERE clause.
   *
   * Called lazily from `processEvent` and `listInstances` so the system
   * needs no cron. The cost is bounded: each user has at most a few dozen
   * active quest instances, and the WHERE filters down to expired ones
   * before any update fires.
   */
  async resetExpiredCadenceQuests(userId: string, tx?: any): Promise<number> {
    const db = tx || this.prisma;
    const now = new Date();

    // Pull only the cadence quests the user has touched. We need the def
    // alongside to compute the window boundary per-cadence.
    const instances = await (db as any).questInstance.findMany({
      where: {
        userId,
        questDef: { cadence: { in: ['daily', 'weekly'] } },
      },
      include: { questDef: true },
    });

    let reset = 0;
    for (const inst of instances) {
      const def = inst.questDef;
      if (!def || !isCadenceQuest(def)) continue;

      const currentWindow = getWindowStart(def.cadence, now);
      const lastWindow = inst.windowStartedAt
        ? getWindowStart(def.cadence, inst.windowStartedAt)
        : null;

      // Same window — nothing to do. We compare both anchored to their
      // window starts so off-by-millisecond writes can't trigger spurious
      // resets.
      if (lastWindow && lastWindow.getTime() >= currentWindow.getTime()) continue;

      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      await (db as any).questInstance.update({
        where: { id: inst.id },
        data: {
          progress: freshProgress(objectives),
          status: 'active',
          windowStartedAt: currentWindow,
          completedAt: null,
          claimedAt: null,
        },
      });
      reset += 1;
    }

    return reset;
  }

  async claimReward(userId: string, questInstanceId: string, tx?: any): Promise<{ grants: any[]; markedReadNotif: any }> {
    const db = tx || this.prisma;

    const instance = await (db as any).questInstance.findUnique({
      where: { id: questInstanceId },
      include: { questDef: true },
    });

    if (!instance) throw new NotFoundException('Quest instance not found');
    if (instance.userId !== userId) throw new ForbiddenException('This quest does not belong to you');
    if (instance.status !== 'completed') throw new BadRequestException(`Quest cannot be claimed (status: ${instance.status})`);

    const def = instance.questDef;
    const items = normalizeRewardSpec(def.rewardSpec);

    // Route reward resolution through the canonical resolver so quest claims
    // share field names, bundle semantics, requirement gating, and bundle_ref
    // expansion with every other reward path (mission, crafting, lootbox, gift
    // bundle_ref). All entries use canonical { type, key, min, max } shape.
    const user = await (db as any).user.findUnique({ where: { id: userId } });
    const reqContext: RequirementContext = user
      ? this.gameRules.buildRequirementContext(user as any)
      : { user: {}, userFlags: {} };
    const { resolved } = await this.gameRules.resolveOutcomesAsync(items, reqContext, makeRng());

    const grants: any[] = [];
    for (const r of resolved) {
      const entry = r.entry;
      const amount = r.amount ?? 0;
      if (!entry?.type || !entry.key || amount <= 0) continue;

      if (entry.type === 'currency') {
        await this.currencyService.creditTx(db, {
          userId, currencyId: entry.key, amount,
          reason: `Quest reward: ${def.name}`,
          sourceType: 'quest', sourceId: instance.id,
        });
        grants.push({ type: 'currency', key: entry.key, amount });
      } else if (entry.type === 'item') {
        await this.inventoryService.addItemTx(db, {
          userId, itemId: entry.key, quantity: amount,
          reason: `Quest reward: ${def.name}`,
          sourceType: 'quest', sourceId: instance.id,
        });
        grants.push({ type: 'item', key: entry.key, amount });
      }
    }

    // Daily/weekly cadence quests are implicitly repeatable — claiming
    // resets them inside the SAME window so the user sees them as `active`
    // immediately, but `windowStartedAt` stays at the current window so
    // they can't farm the reward again until the window rolls over. The
    // next call to `resetExpiredCadenceQuests` will pick up the rollover.
    const cadence = isCadenceQuest(def);
    if (def.repeatable || cadence) {
      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const now = new Date();
      const updateData: any = {
        status: 'active',
        claimedAt: now,
        completedAt: null,
        progress: freshProgress(objectives),
      };
      if (cadence) {
        // For cadence quests, set the window to NOW so the player can't
        // claim again until the next UTC midnight / Monday. We record the
        // window start (not now) so subsequent rollover comparisons work.
        updateData.windowStartedAt = getWindowStart(def.cadence, now);
        // For cadence quests we also want claimedAt to mark this cycle as
        // already-rewarded — a simple way to gate the UI is `status:
        // 'claimed_this_cycle'` but we keep `active` for backward compat
        // with the existing quest tabs. The frontend can compare
        // `claimedAt` vs `windowStartedAt` to render a "Come back tomorrow"
        // state without breaking the active-list filter.
        updateData.status = 'claimed';
      }
      await (db as any).questInstance.update({
        where: { id: questInstanceId },
        data: updateData,
      });
    } else {
      await (db as any).questInstance.update({
        where: { id: questInstanceId },
        data: { status: 'claimed', claimedAt: new Date() },
      });
    }

    const notifModel = (tx as any)?.notification ?? (this.prisma as any).notification;
    const existingNotif = await notifModel.findFirst({
      where: { userId, sourceType: 'quest', sourceId: questInstanceId, readAt: null },
    });
    let markedReadNotif: any = null;
    if (existingNotif) {
      markedReadNotif = await notifModel.update({
        where: { id: existingNotif.id },
        data: { readAt: new Date() },
      });
    }

    return { grants, markedReadNotif };
  }

  async listInstances(userId: string): Promise<any[]> {
    // Lazy rollover before returning, so a returning player sees fresh
    // dailies/weeklies on the very first read after midnight without
    // needing to fire a telemetry event first.
    try {
      await this.resetExpiredCadenceQuests(userId);
    } catch (err) {
      this.logger.warn(`Cadence quest reset failed for ${userId}: ${err}`);
    }

    return (this.prisma as any).questInstance.findMany({
      where: { userId },
      include: { questDef: true },
      orderBy: { startedAt: 'desc' },
    });
  }
}
