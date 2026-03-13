import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_ENTITY_LEVEL, XP_PER_LEVEL } from '@derp/shared';
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
  constructor(private prisma: PrismaService) {}

  async getEntities(userId: string) {
    const entities = await (this.prisma as any).entity.findMany({
      where: { ownerUserId: userId },
      include: { equipment: true },
      orderBy: { createdAt: 'desc' },
    });

    const missionEntities = entities.filter(
      (e: any) => (e.state as any)?.status === 'mission',
    );
    if (missionEntities.length > 0) {
      const activeMissionJobs = await (this.prisma as any).job.findMany({
        where: { userId, type: 'MissionJob', status: { in: ['active', 'pending'] } },
        select: { team: true },
      });
      const activeEntityIds = new Set(
        activeMissionJobs.flatMap((m: any) => (m.team as string[]) || []),
      );
      const orphanedEntities = missionEntities.filter(
        (e: any) => !activeEntityIds.has(e.id),
      );
      if (orphanedEntities.length > 0) {
        for (const e of orphanedEntities) {
          const currentState = (e.state as any) || {};
          const newState = { ...currentState, status: 'idle' };
          await (this.prisma as any).entity.update({
            where: { id: e.id },
            data: { state: newState },
          });
          (e.state as any).status = 'idle';
        }
      }
    }

    return entities.map(serializeEntity);
  }

  async getEntity(userId: string, entityId: string) {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    return serializeEntity(entity);
  }

  async addEntityXp(entityId: string, userId: string, xp: number) {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');

    const progression = (entity.progression as any) || {};
    let currentLevel = progression.level || 1;
    let currentXp = Number(progression.xp || 0);

    if (currentLevel >= MAX_ENTITY_LEVEL) return serializeEntity(entity);

    let newXp = currentXp + xp;
    let newLevel = currentLevel;
    let currentStats = (entity.stats as any) || {};
    const levelHistory: any[] = Array.isArray(progression.levelHistory) ? [...progression.levelHistory] : [];

    while (newLevel < MAX_ENTITY_LEVEL && newXp >= XP_PER_LEVEL(newLevel)) {
      newXp -= XP_PER_LEVEL(newLevel);
      newLevel++;

      const result = await this.applyLevelUpStats(entityId, currentStats, newLevel);
      currentStats = result.stats;
      levelHistory.push({ level: newLevel, gains: result.gains });
    }

    const updatedProgression = { ...progression, level: newLevel, xp: newXp, levelHistory };
    const updated = await (this.prisma as any).entity.update({
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
  ): Promise<LevelUpResult> {
    const result = applyWeightedLevelUp(currentStats);
    await (this.prisma as any).entity.update({
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
