import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

type TxClient = any;

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
  private defCache: Map<string, any> | null = null;
  private defCacheTime = 0;
  private readonly CACHE_TTL = 60_000;

  constructor(private prisma: PrismaService) {}

  private get effectDef() {
    return (this.prisma as any).effectDef;
  }

  private get activeEffect() {
    return (this.prisma as any).activeEffect;
  }

  async getEffectDefs(): Promise<Map<string, any>> {
    const now = Date.now();
    if (this.defCache && now - this.defCacheTime < this.CACHE_TTL) {
      return this.defCache;
    }
    const defs = await this.effectDef.findMany({ where: { enabled: true } });
    const map = new Map<string, any>();
    for (const d of defs) map.set(d.id, d);
    this.defCache = map;
    this.defCacheTime = now;
    return map;
  }

  invalidateDefCache() {
    this.defCache = null;
  }

  async getEffectDef(defId: string): Promise<any> {
    const defs = await this.getEffectDefs();
    const def = defs.get(defId);
    if (!def) throw new NotFoundException(`Effect definition "${defId}" not found`);
    return def;
  }

  async applyEffect(params: ApplyEffectParams, tx?: TxClient): Promise<any> {
    const db = tx || this.prisma;
    const def = await this.getEffectDef(params.effectDefId);

    if (def.durationModel === EffectDurationModel.INSTANT) {
      return { instant: true, def };
    }

    const now = new Date();
    const existing = await (db as any).activeEffect.findMany({
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
          await (db as any).activeEffect.deleteMany({
            where: { id: { in: existing.map((e: any) => e.id) } },
          });
          break;

        case EffectStackingRule.REFRESH: {
          const expiresAt = this.computeExpiry(def);
          const updated = await (db as any).activeEffect.update({
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
          const updated = await (db as any).activeEffect.update({
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
          const updated = await (db as any).activeEffect.update({
            where: { id: first.id },
            data: { currentStacks: first.currentStacks + 1 },
          });
          return updated;
        }
      }
    }

    const expiresAt = this.computeExpiry(def);
    const expiresAtTick = def.durationModel === EffectDurationModel.TICK_BASED && def.durationTicks
      ? def.durationTicks
      : null;

    const created = await (db as any).activeEffect.create({
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

  async removeEffect(activeEffectId: string, tx?: TxClient): Promise<void> {
    const db = tx || this.prisma;
    await (db as any).activeEffect.delete({ where: { id: activeEffectId } }).catch(() => {});
  }

  async removeEffectsBySource(userId: string, sourceType: string, sourceId: string, tx?: TxClient): Promise<number> {
    const db = tx || this.prisma;
    const result = await (db as any).activeEffect.deleteMany({
      where: { userId, sourceType, sourceId },
    });
    return result.count;
  }

  async removeEffectsBySession(sessionType: string, sessionId: string, tx?: TxClient): Promise<number> {
    const db = tx || this.prisma;
    const result = await (db as any).activeEffect.deleteMany({
      where: { sessionType, sessionId },
    });
    return result.count;
  }

  async decrementUse(activeEffectId: string, tx?: TxClient): Promise<any | null> {
    const db = tx || this.prisma;
    const effect = await (db as any).activeEffect.findUnique({ where: { id: activeEffectId } });
    if (!effect || effect.remainingUses === null) return effect;

    if (effect.remainingUses <= 1) {
      await (db as any).activeEffect.delete({ where: { id: activeEffectId } });
      return null;
    }

    return (db as any).activeEffect.update({
      where: { id: activeEffectId },
      data: { remainingUses: effect.remainingUses - 1 },
    });
  }

  async getActiveEffects(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    tx?: TxClient,
  ): Promise<any[]> {
    const db = tx || this.prisma;
    const now = new Date();
    const effects = await (db as any).activeEffect.findMany({
      where: {
        userId,
        targetType,
        targetId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return effects;
  }

  async getActiveEffectsForUser(userId: string, tx?: TxClient): Promise<any[]> {
    const db = tx || this.prisma;
    const now = new Date();
    const effects = await (db as any).activeEffect.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return effects;
  }

  async getActiveEffectsByCategory(
    userId: string,
    targetType: EffectTargetType,
    targetId: string,
    category: EffectCategory,
    tx?: TxClient,
  ): Promise<any[]> {
    const db = tx || this.prisma;
    const now = new Date();
    return (db as any).activeEffect.findMany({
      where: {
        userId,
        targetType,
        targetId,
        category,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
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
    tx?: TxClient,
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
    const result = await this.activeEffect.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired effects`);
    }
    return result.count;
  }

  private computeExpiry(def: any): Date | null {
    if (def.durationModel === EffectDurationModel.TIMED && def.durationSec) {
      return new Date(Date.now() + def.durationSec * 1000);
    }
    if (def.durationModel === EffectDurationModel.PERMANENT ||
        def.durationModel === EffectDurationModel.UNTIL_REMOVED ||
        def.durationModel === EffectDurationModel.SESSION ||
        def.durationModel === EffectDurationModel.COUNT_BASED ||
        def.durationModel === EffectDurationModel.TICK_BASED) {
      return null;
    }
    return null;
  }

  serializeActiveEffect(effect: any) {
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
      expiresAt: effect.expiresAt?.toISOString?.() ?? effect.expiresAt ?? null,
      expiresAtTick: effect.expiresAtTick,
      createdAt: effect.createdAt?.toISOString?.() ?? effect.createdAt,
    };
  }
}
