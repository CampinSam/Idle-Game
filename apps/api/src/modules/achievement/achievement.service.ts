import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TelemetryService,
  TelemetrySubscriber,
  TelemetryEvent,
} from '../telemetry/telemetry.service';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  GameRulesService,
  RequirementContext,
} from '../game-rules/game-rules.service';
import { NotificationService } from '../notification/notification.service';
import { SelectionResolverService } from '../selection/selection-resolver.service';

// Same shallow-equality check QuestService uses to filter telemetry events
// by the objective's `dataFilter`. Kept local rather than shared so the two
// systems can diverge if achievements ever need richer matching.
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

function freshProgress(objectives: any[]): any[] {
  return objectives.map((obj: any, i: number) => ({
    objectiveIndex: i,
    current: 0,
    target: obj?.target ?? 1,
    completed: false,
  }));
}

/**
 * AchievementService is the lifetime / one-shot counterpart to QuestService.
 * Same telemetry-driven progress model, same reward resolution, but with
 * three key differences:
 *
 *  1. Never auto-resets. Once `claimed`, an achievement stays claimed.
 *  2. May grant a permanent ActiveEffect on claim (e.g. "+5% mission XP
 *     forever") via `permanentEffectSpec`. Permanent = `expiresAt: null`,
 *     which the rest of the engine already treats as "never expires"
 *     (`fetchActiveEffects` includes `{ expiresAt: null, expiresAtTick: null }`).
 *  3. Lazy instance creation: we don't pre-spawn rows for every achievement
 *     def at user-create time. Rows materialize on first matching telemetry
 *     event, keeping the table small and migrations cheap.
 */
@Injectable()
export class AchievementService implements TelemetrySubscriber, OnModuleInit {
  private readonly logger = new Logger(AchievementService.name);

  constructor(
    private prisma: PrismaService,
    private telemetryService: TelemetryService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private gameRules: GameRulesService,
    private notificationService: NotificationService,
    private selectionResolver: SelectionResolverService,
  ) {}

  onModuleInit() {
    this.telemetryService.registerSubscriber(this);
  }

  async processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void> {
    const db = tx || this.prisma;

    // We need to consider both already-tracked instances AND defs the user
    // has never touched (so a brand-new achievement triggers on the first
    // qualifying event). Pull the universe of enabled defs whose objectives
    // could match this event's type, then load any existing instances for
    // those defs in a single query.
    const candidateDefs = await (db as any).achievementDef.findMany({
      where: { enabled: true },
    });

    const matching: Array<{ def: any; objectiveIdxs: number[] }> = [];
    for (const def of candidateDefs) {
      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const idxs: number[] = [];
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        if (!obj || obj.eventType !== event.eventType) continue;
        if (obj.key != null && obj.key !== event.key) continue;
        if (obj.dataFilter && !shallowMatch(obj.dataFilter, event.data || {})) continue;

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
              `Achievement objective has selectionRule but event "${event.eventType}" carries no selectionContext — treating as pass (achievementDefId=${def.id})`,
            );
          }
        }

        idxs.push(i);
      }
      if (idxs.length > 0) matching.push({ def, objectiveIdxs: idxs });
    }

    if (matching.length === 0) return;

    const defIds = matching.map((m) => m.def.id);
    const existingInstances = await (db as any).achievementInstance.findMany({
      where: { userId, achievementDefId: { in: defIds } },
    });
    const byDefId = new Map<string, any>(
      existingInstances.map((inst: any) => [inst.achievementDefId, inst]),
    );

    for (const { def, objectiveIdxs } of matching) {
      let instance = byDefId.get(def.id);

      // Lazy-create on first hit.
      if (!instance) {
        const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
        instance = await (db as any).achievementInstance.create({
          data: {
            userId,
            achievementDefId: def.id,
            progress: freshProgress(objectives),
          },
        });
      } else if (instance.status !== 'active') {
        // Already completed/claimed — never re-arm.
        continue;
      }

      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const progress: any[] = Array.isArray(instance.progress)
        ? [...instance.progress]
        : freshProgress(objectives);

      while (progress.length < objectives.length) {
        const i = progress.length;
        progress.push({
          objectiveIndex: i,
          current: 0,
          target: objectives[i]?.target ?? 1,
          completed: false,
        });
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

      await (db as any).achievementInstance.update({
        where: { id: instance.id },
        data: updateData,
      });

      if (allDone) {
        try {
          await this.notificationService.createNotification(
            {
              userId,
              type: 'achievement_complete',
              category: 'achievement',
              priority: 'high',
              title: 'Achievement Unlocked!',
              body: def.name,
              meta: {
                type: 'achievement',
                achievementInstanceId: instance.id,
                achievementDefId: def.id,
              },
              sourceType: 'achievement',
              sourceId: instance.id,
            },
            tx,
          );
        } catch (err) {
          this.logger.warn(`Failed to send achievement complete notification: ${err}`);
        }
      }
    }
  }

  async listInstances(userId: string): Promise<any[]> {
    return (this.prisma as any).achievementInstance.findMany({
      where: { userId },
      include: { achievementDef: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async claimReward(
    userId: string,
    achievementInstanceId: string,
    tx?: any,
  ): Promise<{ grants: any[]; permanentEffectId: string | null; markedReadNotif: any }> {
    const db = tx || this.prisma;

    const instance = await (db as any).achievementInstance.findUnique({
      where: { id: achievementInstanceId },
      include: { achievementDef: true },
    });

    if (!instance) throw new NotFoundException('Achievement instance not found');
    if (instance.userId !== userId) {
      throw new ForbiddenException('This achievement does not belong to you');
    }
    if (instance.status !== 'completed') {
      throw new BadRequestException(
        `Achievement cannot be claimed (status: ${instance.status})`,
      );
    }

    const def = instance.achievementDef;
    const items = normalizeRewardSpec(def.rewardSpec);

    const user = await (db as any).user.findUnique({ where: { id: userId } });
    const reqContext: RequirementContext = user
      ? this.gameRules.buildRequirementContext(user as any)
      : { user: {}, userFlags: {} };

    const { resolved } = await this.gameRules.resolveOutcomesAsync(
      items,
      reqContext,
      makeRng(),
    );

    const grants: any[] = [];
    for (const r of resolved) {
      const entry = r.entry;
      const amount = r.amount ?? 0;
      if (!entry?.type || !entry.key || amount <= 0) continue;

      if (entry.type === 'currency') {
        await this.currencyService.creditTx(db, {
          userId,
          currencyId: entry.key,
          amount,
          reason: `Achievement reward: ${def.name}`,
          sourceType: 'achievement',
          sourceId: instance.id,
        });
        grants.push({ type: 'currency', key: entry.key, amount });
      } else if (entry.type === 'item') {
        await this.inventoryService.addItemTx(db, {
          userId,
          itemId: entry.key,
          quantity: amount,
          reason: `Achievement reward: ${def.name}`,
          sourceType: 'achievement',
          sourceId: instance.id,
        });
        grants.push({ type: 'item', key: entry.key, amount });
      }
    }

    // Optional permanent ActiveEffect. We pull defaults from the EffectDef
    // and let `permanentEffectSpec` override scalar fields. `expiresAt:
    // null` + `expiresAtTick: null` is the canonical shape the rest of the
    // engine recognizes as "never expires" (see `fetchActiveEffects`).
    let permanentEffectId: string | null = null;
    const spec = def.permanentEffectSpec as any;
    if (spec?.effectDefId) {
      const effectDef = await (db as any).effectDef.findUnique({
        where: { id: spec.effectDefId },
      });
      if (!effectDef) {
        this.logger.warn(
          `Achievement ${def.id} references unknown effectDefId ${spec.effectDefId} — skipping permanent effect`,
        );
      } else {
        const created = await (db as any).activeEffect.create({
          data: {
            effectDefId: effectDef.id,
            userId,
            targetType: spec.targetType ?? effectDef.targetType ?? 'player',
            targetId: spec.targetId ?? userId,
            sourceType: 'achievement',
            sourceId: instance.id,
            category: effectDef.category,
            valueMode: effectDef.valueMode,
            value: spec.value ?? effectDef.value ?? 0,
            stats: spec.stats ?? effectDef.stats ?? null,
            trait: effectDef.trait ?? null,
            currentStacks: 1,
            // Explicit nulls — this is what makes the effect permanent.
            expiresAt: null,
            expiresAtTick: null,
          },
        });
        permanentEffectId = created.id;
      }
    }

    await (db as any).achievementInstance.update({
      where: { id: achievementInstanceId },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    const notifModel = (tx as any)?.notification ?? (this.prisma as any).notification;
    const existingNotif = await notifModel.findFirst({
      where: { userId, sourceType: 'achievement', sourceId: achievementInstanceId, readAt: null },
    });
    let markedReadNotif: any = null;
    if (existingNotif) {
      markedReadNotif = await notifModel.update({
        where: { id: existingNotif.id },
        data: { readAt: new Date() },
      });
    }

    return { grants, permanentEffectId, markedReadNotif };
  }
}
