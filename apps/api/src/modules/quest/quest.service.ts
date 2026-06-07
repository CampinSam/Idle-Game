import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { TelemetryService, TelemetrySubscriber, TelemetryEvent } from '../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../telemetry/telemetry-context-builder.service';
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

// Achievement-category quests are lifetime one-shots that never auto-reset.
// They follow the same processing pipeline but are filtered/displayed separately.
function isAchievement(def: any): boolean {
  return def?.category === 'achievement';
}

function freshProgress(objectives: any[]): any[] {
  return objectives.map((obj: any, i: number) => ({
    objectiveIndex: i,
    current: 0,
    target: obj?.target ?? 1,
    completed: false,
  }));
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
    private telemetryContextBuilder: TelemetryContextBuilderService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private gameRules: GameRulesService,
    private selectionResolver: SelectionResolverService,
  ) {}

  onModuleInit() {
    this.telemetryService.registerSubscriber(this);
  }

  /**
   * Process a telemetry event against ALL enabled quest defs whose objectives
   * could match the event type. Instances are created lazily on first match —
   * no pre-spawning anywhere in the system.
   *
   * This unified path handles all categories: daily/weekly cadence quests,
   * oneoff story quests, and achievement-category quests (lifetime one-shots).
   */
  async processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void> {
    const db = tx || this.prisma;

    // Lazy cadence reset before processing — roll over any daily/weekly quests
    // whose previous window has elapsed. Cheap (indexed query + few updates),
    // guarantees fresh windows on a player's first event after midnight.
    await this.resetExpiredCadenceQuests(userId, db);

    // Load all enabled defs. We evaluate each objective's unified selector against
    // a combined SelectionContext that includes the live telemetry event.
    const allEnabledDefs = await (db as any).questDef.findMany({
      where: { enabled: true },
    });

    // Build the combined context: base player/world context from the event (if
    // present) extended with the event payload so `event` scope rules work.
    const baseContext = event.selectionContext ?? {
      player: { keeperLevel: 0, flags: {} as Record<string, unknown> },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [],
    };
    const contextWithEvent = {
      ...baseContext,
      event: {
        type: event.eventType,
        key: event.key ?? undefined,
        amount: event.amount,
        data: event.data ?? {},
      },
    };

    const matchingDefs: Array<{ def: any; objectiveIdxs: number[] }> = [];
    for (const def of allEnabledDefs) {
      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const idxs: number[] = [];
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        // Fast-path: if the objective declares an eventType it must match the
        // incoming event exactly. Without this guard every objective without a
        // selector would match every telemetry event (evaluateAll returns true
        // for null), causing unrelated quests to complete on e.g. login.
        if (obj?.eventType && obj.eventType !== event.eventType) continue;
        // evaluateAll returns true when selector is null/undefined, preserving
        // the "count every matching event" behavior for objectives without a selector.
        const passes = this.selectionResolver.evaluateAll(obj?.selector ?? null, contextWithEvent);
        if (passes) idxs.push(i);
      }
      if (idxs.length > 0) matchingDefs.push({ def, objectiveIdxs: idxs });
    }

    if (matchingDefs.length === 0) return;

    // Batch-load existing instances for all matching defs.
    const defIds = matchingDefs.map((m) => m.def.id);
    const existingInstances = await (db as any).questInstance.findMany({
      where: { userId, questDefId: { in: defIds } },
    });
    const byDefId = new Map<string, any>(
      existingInstances.map((inst: any) => [inst.questDefId, inst]),
    );

    for (const { def, objectiveIdxs } of matchingDefs) {
      let instance = byDefId.get(def.id);

      if (!instance) {
        // Lazy-create on first matching event.
        const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
        const windowStartedAt = isCadenceQuest(def)
          ? getWindowStart(def.cadence, new Date())
          : null;
        instance = await (db as any).questInstance.create({
          data: {
            userId,
            questDefId: def.id,
            progress: freshProgress(objectives),
            windowStartedAt,
          },
        });
      } else if (instance.status !== 'active') {
        // Achievement-category and non-repeatable oneoffs that are already
        // completed or claimed should never be re-armed.
        if (isAchievement(def) || (!isCadenceQuest(def) && !def.repeatable)) {
          continue;
        }
        // Cadence/repeatable quests in 'claimed' status remain eligible
        // (resetExpiredCadenceQuests above handles window rollover).
        if (instance.status === 'claimed' && (isCadenceQuest(def) || def.repeatable)) {
          continue;
        }
        continue;
      }

      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const progress: any[] = Array.isArray(instance.progress)
        ? [...instance.progress]
        : freshProgress(objectives);

      while (progress.length < objectives.length) {
        const i = progress.length;
        progress.push({ objectiveIndex: i, current: 0, target: objectives[i]?.target ?? 1, completed: false });
      }

      let changed = false;
      for (const i of objectiveIdxs) {
        const prog = progress[i];
        if (!prog || prog.completed) continue;
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
        const notifType = isAchievement(def) ? 'achievement_complete' : 'quest_complete';
        const notifTitle = isAchievement(def) ? 'Achievement Unlocked!' : 'Quest Complete!';
        try {
          await this.notificationService.createNotification({
            userId,
            type: notifType,
            category: isAchievement(def) ? 'achievement' : 'quest',
            priority: 'high',
            title: notifTitle,
            body: def.name,
            meta: { type: isAchievement(def) ? 'achievement' : 'quest', questInstanceId: instance.id, questDefId: def.id },
            sourceType: 'quest',
            sourceId: instance.id,
          }, tx);
        } catch (err) {
          this.logger.warn(`Failed to send quest/achievement complete notification: ${err}`);
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
   */
  async resetExpiredCadenceQuests(userId: string, tx?: any): Promise<number> {
    const db = tx || this.prisma;
    const now = new Date();

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

  async claimReward(userId: string, questInstanceId: string, tx?: any): Promise<{ grants: any[]; permanentEffectId: string | null; readNotifications: any[] }> {
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

    // Apply permanentEffectSpec if present (used by achievement-category defs
    // to grant lifetime bonuses on claim). Permanent = expiresAt/expiresAtTick null.
    let permanentEffectId: string | null = null;
    const spec = def.permanentEffectSpec as any;
    if (spec?.effectDefId) {
      const effectDef = await (db as any).effectDef.findUnique({ where: { id: spec.effectDefId } });
      if (!effectDef) {
        this.logger.warn(
          `Quest ${def.id} references unknown effectDefId ${spec.effectDefId} — skipping permanent effect`,
        );
      } else {
        const created = await (db as any).activeEffect.create({
          data: {
            effectDefId: effectDef.id,
            userId,
            targetType: spec.targetType ?? effectDef.targetType ?? 'player',
            targetId: spec.targetId ?? userId,
            sourceType: 'quest',
            sourceId: instance.id,
            category: effectDef.category,
            valueMode: effectDef.valueMode,
            value: spec.value ?? effectDef.value ?? 0,
            stats: spec.stats ?? effectDef.stats ?? null,
            trait: effectDef.trait ?? null,
            currentStacks: 1,
            expiresAt: null,
            expiresAtTick: null,
          },
        });
        permanentEffectId = created.id;
      }
    }

    // Daily/weekly cadence quests are implicitly repeatable — claiming resets
    // them inside the SAME window. Achievement-category defs are never repeatable.
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
        updateData.windowStartedAt = getWindowStart(def.cadence, now);
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

    const readNotifications = await this.notificationService.markReadBySource(userId, 'quest', questInstanceId, tx);

    try {
      const eventType = isAchievement(def) ? 'achievement_claimed' : 'quest_claimed';
      let selectionContext;
      try {
        selectionContext = await this.telemetryContextBuilder.buildContext(userId);
      } catch (ctxErr) {
        this.logger.warn(`Failed to build selection context for quest/achievement telemetry: ${ctxErr}`);
      }
      await this.telemetryService.record(
        userId,
        eventType,
        def.id,
        1,
        {},
        tx,
        selectionContext,
      );
    } catch (err) {
      this.logger.warn(`Failed to record quest/achievement claim telemetry: ${err}`);
    }

    return { grants, permanentEffectId, readNotifications };
  }

  /**
   * Returns a merged view of quest defs + instances for the given user.
   * Enabled defs that have no instance appear as "not_started" stubs.
   * Instances whose def is disabled are excluded (lazy cleanup).
   *
   * Optionally filter by category. Pass null to get all categories.
   */
  async listMerged(userId: string, category?: string | null): Promise<any[]> {
    // Lazy cadence rollover so returning players see fresh dailies/weeklies.
    try {
      await this.resetExpiredCadenceQuests(userId);
    } catch (err) {
      this.logger.warn(`Cadence quest reset failed for ${userId}: ${err}`);
    }

    const where: any = { enabled: true };
    if (category !== undefined && category !== null) where.category = category;

    const [defs, instances] = await Promise.all([
      (this.prisma as any).questDef.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      (this.prisma as any).questInstance.findMany({
        where: { userId },
        include: { questDef: true },
      }),
    ]);

    const instanceByDefId = new Map<string, any>();
    for (const inst of instances) {
      // Exclude stale instances whose def is now disabled or deleted.
      if (!inst.questDef || !inst.questDef.enabled) continue;
      instanceByDefId.set(inst.questDefId, inst);
    }

    const results: any[] = [];
    for (const def of defs) {
      const inst = instanceByDefId.get(def.id);
      if (inst) {
        results.push(inst);
      } else {
        // Stub for not-yet-started quest/achievement.
        results.push({
          id: def.id,
          userId,
          questDefId: def.id,
          questDef: def,
          progress: freshProgress(Array.isArray(def.objectives) ? def.objectives : []),
          status: 'not_started',
          windowStartedAt: null,
          startedAt: null,
          completedAt: null,
          claimedAt: null,
          _stub: true,
        });
      }
    }

    return results;
  }

  async listInstances(userId: string): Promise<any[]> {
    return this.listMerged(userId);
  }
}
