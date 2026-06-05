import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import {
  EffectCategory,
  EffectDurationModel,
  EffectStackingRule,
  EffectTargetType,
  EffectSourceType,
  EffectValueMode,
  EffectDefOverrides,
  EffectSelection,
  EffectTargetContext,
  ResolvedModifier,
} from '@derp/shared';
import { resolveEffects, ActiveEffectRow, matchesSelection } from './effect-resolver';
import { resolveRnd } from '../entity/rnd-resolver.util';

type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type DbClient = PrismaService | PrismaTx;

interface EffectDefRecord {
  id: string;
  name: string;
  category: string;
  durationModel: string;
  durationSec: number | null;
  durationTicks: number | null;
  valueMode: string;
  value: number | null;
  stats: Record<string, number> | null;
  trait: string | null;
  targetType: string;
  stackingRule: string;
  maxStacks: number | null;
  maxUses: number | null;
  sessionType: string | null;
  enabled: boolean;
}

interface ActiveEffectRecord {
  id: string;
  effectDefId: string;
  userId: string;
  targetType: string;
  targetId: string;
  sourceType: string;
  sourceId: string;
  category: string;
  valueMode: string;
  value: number;
  stats: Record<string, number> | null;
  trait: string | null;
  currentStacks: number;
  remainingUses: number | null;
  sessionType: string | null;
  sessionId: string | null;
  expiresAt: Date | null;
  expiresAtTick: number | null;
  createdAt: Date;
}

export interface ApplyEffectParams {
  effectDefId: string;
  userId: string;
  targetType: EffectTargetType;
  targetId: string;
  sourceType: EffectSourceType;
  sourceId: string;
  sessionId?: string;
  /** Optional overrides applied on top of the EffectDef fields at apply-time. */
  valueOverrides?: EffectDefOverrides;
}

@Injectable()
export class EffectService {
  private readonly logger = new Logger(EffectService.name);
  private defCache: Map<string, EffectDefRecord> | null = null;
  private defCacheTime = 0;
  private readonly CACHE_TTL = 60_000;

  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
  ) {}

  private effectDefModel(db: DbClient) {
    return (db as any).effectDef;
  }

  private activeEffectModel(db: DbClient) {
    return (db as any).activeEffect;
  }

  async getEffectDefs(): Promise<Map<string, EffectDefRecord>> {
    const now = Date.now();
    if (this.defCache && now - this.defCacheTime < this.CACHE_TTL) {
      return this.defCache;
    }
    const defs: EffectDefRecord[] = await this.effectDefModel(this.prisma).findMany({ where: { enabled: true } });
    const map = new Map<string, EffectDefRecord>();
    for (const d of defs) map.set(d.id, d);
    this.defCache = map;
    this.defCacheTime = now;
    return map;
  }

  invalidateDefCache() {
    this.defCache = null;
  }

  async getEffectDef(defId: string): Promise<EffectDefRecord> {
    const defs = await this.getEffectDefs();
    const def = defs.get(defId);
    if (!def) throw new NotFoundException(`Effect definition "${defId}" not found`);
    return def;
  }

  async applyEffect(params: ApplyEffectParams, tx?: PrismaTx): Promise<{ active: ActiveEffectRecord; removedIds: string[] } | { instant: true; def: EffectDefRecord }> {
    const db: DbClient = tx || this.prisma;
    const baseDef = await this.getEffectDef(params.effectDefId);

    // Merge overrides onto def fields before any logic runs, so the merged
    // values are used consistently for expiry, stacking, and stat resolution.
    const def: EffectDefRecord = params.valueOverrides
      ? ({ ...baseDef, ...params.valueOverrides } as EffectDefRecord)
      : baseDef;

    if (def.durationModel === EffectDurationModel.INSTANT) {
      return { instant: true, def };
    }

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const existing: ActiveEffectRecord[] = await this.activeEffectModel(db).findMany({
      where: {
        userId: params.userId,
        effectDefId: baseDef.id,
        targetType: params.targetType,
        targetId: params.targetId,
        OR: [
          { expiresAt: null, expiresAtTick: null },
          { expiresAt: { gt: now } },
          { expiresAtTick: { gt: currentTick } },
        ],
      },
    });

    const stackingRule = def.stackingRule as EffectStackingRule;
    const removedIds: string[] = [];

    if (existing.length > 0) {
      const first = existing[0];
      switch (stackingRule) {
        case EffectStackingRule.NO_STACK:
          throw new BadRequestException(`Effect "${baseDef.name}" is already active and cannot stack`);

        case EffectStackingRule.REPLACE:
          removedIds.push(...existing.map((e) => e.id));
          await this.activeEffectModel(db).deleteMany({
            where: { id: { in: removedIds } },
          });
          break;

        case EffectStackingRule.REFRESH: {
          const expiresAt = this.computeExpiry(def);
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { expiresAt, ...(def.maxUses ? { remainingUses: def.maxUses } : {}) },
          });
          return { active: updated, removedIds };
        }

        case EffectStackingRule.STACK_ADDITIVE:
        case EffectStackingRule.STACK_MULTIPLICATIVE: {
          const maxStacks = def.maxStacks ?? 99;
          if (first.currentStacks >= maxStacks) {
            throw new BadRequestException(`Effect "${baseDef.name}" is at max stacks (${maxStacks})`);
          }
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { currentStacks: first.currentStacks + 1 },
          });
          return { active: updated, removedIds };
        }

        case EffectStackingRule.STACK_CAPPED: {
          const cap = def.maxStacks ?? 1;
          if (first.currentStacks >= cap) {
            throw new BadRequestException(`Effect "${baseDef.name}" is at max stacks (${cap})`);
          }
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { currentStacks: first.currentStacks + 1 },
          });
          return { active: updated, removedIds };
        }
      }
    }

    const expiresAt = this.computeExpiry(def);
    let expiresAtTick: number | null = null;
    if (def.durationModel === EffectDurationModel.TICK_BASED && def.durationTicks) {
      const currentTick = await this.tickService.getCurrentTick(new Date());
      expiresAtTick = currentTick + def.durationTicks;
    }

    // Resolve RND in the merged stat map before persisting so randomness is
    // locked in at creation time rather than re-rolled on every resolution tick.
    const resolvedStats = def.stats ? resolveRnd(def.stats as Record<string, number>) : undefined;

    const created: ActiveEffectRecord = await this.activeEffectModel(db).create({
      data: {
        effectDefId: baseDef.id,
        userId: params.userId,
        targetType: params.targetType,
        targetId: params.targetId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        category: baseDef.category,
        valueMode: baseDef.valueMode,
        value: def.value ?? 0,
        stats: resolvedStats ?? undefined,
        trait: baseDef.trait ?? null,
        currentStacks: 1,
        remainingUses: def.maxUses ?? null,
        sessionType: baseDef.sessionType ?? (params.sessionId ? 'mission' : null),
        sessionId: params.sessionId ?? null,
        expiresAt,
        expiresAtTick,
      },
    });

    return { active: created, removedIds };
  }

  async removeEffect(activeEffectId: string, tx?: PrismaTx): Promise<void> {
    const db: DbClient = tx || this.prisma;
    await this.activeEffectModel(db).delete({ where: { id: activeEffectId } }).catch(() => {});
  }

  async removeEffectsBySource(userId: string, sourceType: string, sourceId: string, tx?: PrismaTx): Promise<number> {
    const db: DbClient = tx || this.prisma;
    const result = await this.activeEffectModel(db).deleteMany({
      where: { userId, sourceType, sourceId },
    });
    return result.count;
  }

  async removeEffectsBySession(sessionType: string, sessionId: string, tx?: PrismaTx): Promise<number> {
    const db: DbClient = tx || this.prisma;
    const result = await this.activeEffectModel(db).deleteMany({
      where: { sessionType, sessionId },
    });
    return result.count;
  }

  async decrementUse(activeEffectId: string, tx?: PrismaTx): Promise<ActiveEffectRecord | null> {
    const db: DbClient = tx || this.prisma;
    const effect: ActiveEffectRecord | null = await this.activeEffectModel(db).findUnique({ where: { id: activeEffectId } });
    if (!effect || effect.remainingUses === null) return effect;

    if (effect.remainingUses <= 1) {
      await this.activeEffectModel(db).delete({ where: { id: activeEffectId } });
      return null;
    }

    return this.activeEffectModel(db).update({
      where: { id: activeEffectId },
      data: { remainingUses: effect.remainingUses - 1 },
    });
  }

  async getActiveEffects(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    tx?: PrismaTx,
  ): Promise<ActiveEffectRecord[]> {
    const db: DbClient = tx || this.prisma;
    const now = new Date();
    return this.activeEffectModel(db).findMany({
      where: {
        userId,
        targetType,
        targetId,
        OR: [
          { expiresAt: null, expiresAtTick: null },
          { expiresAt: { gt: now } },
          { expiresAtTick: { gt: await this.tickService.getCurrentTick(now) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getActiveEffectsForUser(userId: string, tx?: PrismaTx): Promise<ActiveEffectRecord[]> {
    const db: DbClient = tx || this.prisma;
    const now = new Date();
    return this.activeEffectModel(db).findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null, expiresAtTick: null },
          { expiresAt: { gt: now } },
          { expiresAtTick: { gt: await this.tickService.getCurrentTick(now) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getActiveEffectsByCategory(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    category: EffectCategory,
    tx?: PrismaTx,
  ): Promise<ActiveEffectRecord[]> {
    const db: DbClient = tx || this.prisma;
    const now = new Date();
    return this.activeEffectModel(db).findMany({
      where: {
        userId,
        targetType,
        targetId,
        category,
        OR: [
          { expiresAt: null, expiresAtTick: null },
          { expiresAt: { gt: now } },
          { expiresAtTick: { gt: await this.tickService.getCurrentTick(now) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  resolve(effects: ActiveEffectRow[], category: EffectCategory, cap?: number): ResolvedModifier {
    return resolveEffects(effects, category, cap);
  }

  /**
   * Resolves the net modifier for a given category targeting a specific entity/player/location.
   *
   * Global power rows are filtered through matchesSelection() using the provided userId and
   * optional targetContext. When targetContext is absent, filter predicates are skipped
   * (safe default — the effect applies).
   */
  async resolveForTarget(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    category: EffectCategory,
    tx?: PrismaTx,
    targetContext?: EffectTargetContext,
  ): Promise<ResolvedModifier> {
    const effects = await this.getActiveEffects(userId, targetType, targetId, tx);

    const playerEffects = targetType !== EffectTargetType.PLAYER
      ? await this.getActiveEffects(userId, EffectTargetType.PLAYER, userId, tx)
      : [];

    const passiveRows = await this.getPassiveEffectsFromEquipment(userId, targetType, targetId, tx);
    // Merge targetId into context so matchesSelection() can enforce filter.entityId /
    // filter.locationId identity constraints from PowerRef-scoped selections.
    const contextWithId: EffectTargetContext = targetContext
      ? { ...targetContext, targetId }
      : { targetId };
    const globalRows = await this.resolveGlobalPowerRows(category, userId, targetType, contextWithId);
    // Note: resolveGlobalPowerRows calls getGlobalPowerRows(userId, targetType) internally,
    // so scope + agg:'self' filtering is applied at the base layer.

    const allEffects = [...effects, ...playerEffects, ...passiveRows, ...globalRows];
    return resolveEffects(allEffects, category);
  }

  /**
   * Returns all active global power records as effect rows (all categories).
   * Used by mission completion and other consumers that resolve multiple
   * categories from a pre-fetched effect list.
   *
   * Pass `userId` to enable agg:'self' filtering for that player.
   * Pass `targetType` to enforce scope filtering (player/entity/location/global).
   * Filter predicates require targetContext at resolution time — callers
   * without context get the safe-default (all applicable rows included).
   */
  async getGlobalPowerRows(userId?: string, targetType?: EffectTargetType): Promise<ActiveEffectRow[]> {
    const activePowers = await this.prisma.globalActivePower.findMany({
      where: { status: 'active' },
      include: { effectDef: true },
    });
    const rows: ActiveEffectRow[] = [];

    for (const power of activePowers as any[]) {
      // tick_speed_boost powers have no effectDefId and are handled via the
      // BoostEvent / TickRateInterval system — skip them for effect resolution.
      if (!power.effectDefId || !power.effectDef) continue;

      const def = power.effectDef;
      const overrides = (power.effectOverrides ?? {}) as any;
      const selection = (power.selection ?? null) as EffectSelection | null;

      // Apply agg:'self' and scope checks when userId/targetType are provided.
      // Filter predicates that require targetContext are left for the caller's
      // resolution step (or are skipped via the safe-default).
      if (selection) {
        const uid = userId ?? '';
        if (!matchesSelection(selection, uid, power.triggeredByUserId ?? null, undefined, targetType)) {
          continue;
        }
      }

      rows.push({
        effectDefId: `global_power:${power.id}`,
        category: def.category,
        valueMode: def.valueMode,
        value: overrides.value ?? def.value ?? 0,
        stats: overrides.stats ?? def.stats ?? null,
        trait: def.trait ?? null,
        currentStacks: 1,
        selection,
        triggeredByUserId: power.triggeredByUserId ?? null,
      });
    }

    return rows;
  }

  private async resolveGlobalPowerRows(
    category: EffectCategory,
    userId: string,
    targetType?: EffectTargetType,
    targetContext?: EffectTargetContext,
  ): Promise<ActiveEffectRow[]> {
    // getGlobalPowerRows applies scope + agg:'self' checks using userId + targetType.
    // We then re-run matchesSelection here to apply targetContext filter predicates
    // (archetype, rarity, traits, level). The scope/agg re-check is a no-op for rows
    // that already passed, so there is no double-filtering issue.
    const all = await this.getGlobalPowerRows(userId, targetType);
    return all.filter((r) => {
      if (r.category !== category) return false;
      return matchesSelection(r.selection ?? null, userId, r.triggeredByUserId ?? null, targetContext, targetType);
    });
  }

  async getPassiveEffectsFromEquipment(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    tx?: PrismaTx,
  ): Promise<ActiveEffectRow[]> {
    const db: DbClient = tx || this.prisma;
    if (targetType !== EffectTargetType.ENTITY) return [];

    const equipSlots = await (db as any).entityEquipment.findMany({
      where: { entityId: targetId, entity: { ownerUserId: userId } },
      select: { itemInstanceId: true },
    });
    if (equipSlots.length === 0) return [];

    const itemInstances = await (db as any).itemInstance.findMany({
      where: { id: { in: equipSlots.map((e: { itemInstanceId: string }) => e.itemInstanceId) } },
      include: { definition: { select: { id: true, passiveEffects: true, equipData: true } } },
    });

    const rows: ActiveEffectRow[] = [];
    for (const inst of itemInstances) {
      // 1. Explicit passive effects (rare/named bonuses).
      const passiveEffects = inst.definition?.passiveEffects;
      if (Array.isArray(passiveEffects)) {
        for (const pe of passiveEffects) {
          if (!pe.category || !pe.valueMode) continue;
          rows.push({
            effectDefId: `passive:${inst.definition.id}:${pe.category}`,
            category: pe.category,
            valueMode: pe.valueMode,
            value: pe.value ?? 0,
            stats: pe.stats ?? null,
            trait: pe.trait ?? null,
            currentStacks: 1,
          });
        }
      }

      // 2. Synthesize a STAT_BOOST/FLAT_ADD row from the gear's equipData.stats
      //    so the resolver folds equipped stats into mission power, success
      //    chance, etc. without anyone having to author a passiveEffects entry
      //    for the common case. equipData.stats is the canonical "this item
      //    grants +N to STAT" payload and was already documented in the
      //    Iron Sword / Ring of Focus seeds.
      const equipData = inst.definition?.equipData as any;
      const stats = equipData && typeof equipData === 'object' ? equipData.stats : null;
      if (stats && typeof stats === 'object' && Object.keys(stats).length > 0) {
        rows.push({
          effectDefId: `equip:${inst.definition.id}:stat_boost`,
          category: EffectCategory.STAT_BOOST,
          valueMode: EffectValueMode.FLAT_ADD,
          value: 0,
          stats,
          trait: null,
          currentStacks: 1,
        });
      }
    }
    return rows;
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const result = await this.activeEffectModel(this.prisma).deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { expiresAtTick: { lte: currentTick } },
        ],
      },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired effects`);
    }
    return result.count;
  }

  private computeExpiry(def: Pick<EffectDefRecord, 'durationModel' | 'durationSec'>): Date | null {
    if (def.durationModel === EffectDurationModel.TIMED && def.durationSec) {
      return new Date(Date.now() + def.durationSec * 1000);
    }
    return null;
  }

  serializeActiveEffect(effect: ActiveEffectRecord) {
    return {
      id: effect.id,
      effectDefId: effect.effectDefId,
      targetType: effect.targetType,
      targetId: effect.targetId,
      sourceType: effect.sourceType,
      sourceId: effect.sourceId,
      category: effect.category,
      valueMode: effect.valueMode,
      value: effect.value,
      stats: effect.stats,
      trait: effect.trait,
      currentStacks: effect.currentStacks,
      remainingUses: effect.remainingUses,
      sessionType: effect.sessionType,
      sessionId: effect.sessionId,
      expiresAt: effect.expiresAt?.toISOString?.() ?? null,
      expiresAtTick: effect.expiresAtTick,
      createdAt: effect.createdAt?.toISOString?.() ?? effect.createdAt,
    };
  }
}
