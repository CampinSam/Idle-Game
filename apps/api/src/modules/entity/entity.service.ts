import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectService } from '../effect/effect.service';
import { MAX_ENTITY_LEVEL, XP_PER_LEVEL, EffectCategory, EffectTargetType, applyModifier } from '@derp/shared';
import { applyWeightedLevelUp, type LevelUpResult } from './entity-generator.util';

function serializeEntity(entity: any) {
  const progression = (entity.progression as any) || {};
  if (progression && typeof progression.xp === 'bigint') {
    progression.xp = Number(progression.xp);
  }
  const display = (entity.display as any) || {};
  const state = (entity.state as any) || {};
  return {
    ...entity,
    progression,
    name: display.name || entity.speciesId || 'Entity',
    level: progression.level || 1,
    xp: Number(progression.xp || 0),
    status: state.status || 'idle',
    ...(display.imageUrl ? { imageUrl: display.imageUrl } : {}),
  };
}

@Injectable()
export class EntityService {
  constructor(
    private prisma: PrismaService,
    private effectService: EffectService,
  ) {}

  async getEntities(userId: string) {
    const entities = await (this.prisma as any).entity.findMany({
      where: { ownerUserId: userId },
      include: { equipment: true },
    });
    return entities.map(serializeEntity);
  }

  async getEntity(entityId: string, userId: string) {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    return serializeEntity(entity);
  }

  async createEntity(data: any) {
    const created = await (this.prisma as any).entity.create({ data, include: { equipment: true } });
    return serializeEntity(created);
  }

  async deleteEntity(entityId: string, userId: string) {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    return (this.prisma as any).entity.delete({ where: { id: entityId } });
  }

  async addEntityXp(entityId: string, userId: string, xp: number, tx?: any, opts?: { skipEffects?: boolean }) {
    const db = tx || this.prisma;
    const entity = await (db as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');

    const progression = (entity.progression as any) || {};
    let currentLevel = progression.level || 1;
    let currentXp = Number(progression.xp || 0);

    if (currentLevel >= MAX_ENTITY_LEVEL) return serializeEntity(entity);

    let effectiveXp = xp;
    if (!opts?.skipEffects) {
      try {
        const xpMod = await this.effectService.resolveForTarget(
          userId, EffectTargetType.PLAYER, userId, EffectCategory.XP_MULTIPLIER,
        );
        if (xpMod.flatAdd !== 0 || xpMod.percentAdd !== 0 || xpMod.multiplier !== 1) {
          effectiveXp = Math.floor(applyModifier(xp, xpMod));
        }
      } catch {}
    }

    let newXp = currentXp + effectiveXp;
    let newLevel = currentLevel;
    let currentStats = (entity.stats as any) || {};
    const levelHistory: any[] = Array.isArray(progression.levelHistory) ? [...progression.levelHistory] : [];

    while (newLevel < MAX_ENTITY_LEVEL && newXp >= XP_PER_LEVEL(newLevel)) {
      newXp -= XP_PER_LEVEL(newLevel);
      newLevel++;

      const result = await this.applyLevelUpStats(entityId, currentStats, newLevel, db);
      currentStats = result.stats;
      levelHistory.push({ level: newLevel, gains: result.gains });
    }

    const updatedProgression = { ...progression, level: newLevel, xp: newXp, levelHistory };
    const updated = await (db as any).entity.update({
      where: { id: entityId },
      data: { progression: updatedProgression },
      include: { equipment: true },
    });
    return serializeEntity(updated);
  }

  private async applyLevelUpStats(
    entityId: string,
    currentStats: Record<string, any>,
    _targetLevel: number,
    db?: any,
  ): Promise<LevelUpResult> {
    const client = db || this.prisma;
    const result = applyWeightedLevelUp(currentStats);
    await (client as any).entity.update({
      where: { id: entityId },
      data: { stats: result.stats },
    });
    return result;
  }

  async setEntityStatus(entityId: string, userId: string, status: string) {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');

    const currentState = (entity.state as any) || {};
    const currentStatus = currentState.status || 'idle';

    if (currentStatus !== 'idle' && status !== 'idle') {
      throw new BadRequestException(`Entity is currently ${currentStatus}`);
    }

    const newState = { ...currentState, status };
    const updated = await (this.prisma as any).entity.update({
      where: { id: entityId },
      data: { state: newState },
      include: { equipment: true },
    });
    return serializeEntity(updated);
  }
}
