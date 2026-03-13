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
  ResolvedModifier,
} from '@derp/shared';
import { resolveEffects, ActiveEffectRow } from './effect-resolver';

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

  async applyEffect(params: ApplyEffectParams, tx?: PrismaTx): Promise<ActiveEffectRecord | { instant: true; def: EffectDefRecord }> {
    const db: DbClient = tx || this.prisma;
    const def = await this.getEffectDef(params.effectDefId);

    if (def.durationModel === EffectDurationModel.INSTANT) {
      return { instant: true, def };
    }

    const now = new Date();
    const existing: ActiveEffectRecord[] = await this.activeEffectModel(db).findMany({
      where: {
        userId: params.userId,
        effectDefId: def.id,
        targetType: params.targetType,
        targetId: params.targetId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    const stackingRule = def.stackingRule as EffectStackingRule;

    if (existing.length > 0) {
      const first = existing[0];
      switch (stackingRule) {
        case EffectStackingRule.NO_STACK:
          throw new BadRequestException(`Effect "${def.name}" is already active and cannot stack`);

        case EffectStackingRule.REPLACE:
          await this.activeEffectModel(db).deleteMany({
            where: { id: { in: existing.map((e) => e.id) } },
          });
          break;

        case EffectStackingRule.REFRESH: {
          const expiresAt = this.computeExpiry(def);
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { expiresAt, ...(def.maxUses ? { remainingUses: def.maxUses } : {}) },
          });
          return updated;
        }

        case EffectStackingRule.STACK_ADDITIVE:
        case EffectStackingRule.STACK_MULTIPLICATIVE: {
          const maxStacks = def.maxStacks ?? 99;
          if (first.currentStacks >= maxStacks) {
            throw new BadRequestException(`Effect "${def.name}" is at max stacks (${maxStacks})`);
          }
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { currentStacks: first.currentStacks + 1 },
          });
          return updated;
        }

        case EffectStackingRule.STACK_CAPPED: {
          const cap = def.maxStacks ?? 1;
          if (first.currentStacks >= cap) {
            throw new BadRequestException(`Effect "${def.name}" is at max stacks (${cap})`);
          }
          const updated: ActiveEffectRecord = await this.activeEffectModel(db).update({
            where: { id: first.id },
            data: { currentStacks: first.currentStacks + 1 },
          });
          return updated;
        }
      }
    }

    const expiresAt = this.computeExpiry(def);
    let expiresAtTick: number | null = null;
    if (def.durationModel === EffectDurationModel.TICK_BASED && def.durationTicks) {
      const currentTick = await this.tickService.getCurrentTick(new Date());
      expiresAtTick = currentTick + def.durationTicks;
    }

    const created: ActiveEffectRecord = await this.activeEffectModel(db).create({
      data: {
        effectDefId: def.id,
        userId: params.userId,
        targetType: params.targetType,
        targetId: params.targetId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        category: def.category,
        valueMode: def.valueMode,
        value: def.value ?? 0,
        stats: def.stats ?? undefined,
        trait: def.trait ?? null,
        currentStacks: 1,
        remainingUses: def.maxUses ?? null,
        sessionType: def.sessionType ?? (params.sessionId ? 'mission' : null),
        sessionId: params.sessionId ?? null,
        expiresAt,
        expiresAtTick,
      },
    });

    return created;
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

  async resolveForTarget(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    category: EffectCategory,
    tx?: PrismaTx,
  ): Promise<ResolvedModifier> {
    const effects = await this.getActiveEffects(userId, targetType, targetId, tx);

    const playerEffects = targetType !== EffectTargetType.PLAYER
      ? await this.getActiveEffects(userId, EffectTargetType.PLAYER, userId, tx)
      : [];

    const allEffects = [...effects, ...playerEffects];
    return resolveEffects(allEffects, category);
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

  private computeExpiry(def: EffectDefRecord): Date | null {
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
