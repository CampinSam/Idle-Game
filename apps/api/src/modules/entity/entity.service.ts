import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectService } from '../effect/effect.service';
import { NotificationService } from '../notification/notification.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { MAX_ENTITY_LEVEL, XP_PER_LEVEL, EffectCategory, EffectTargetType, applyModifier } from '@derp/shared';
import { applyWeightedLevelUp } from '@derp/math';

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

export interface AddEntityXpResult {
  entity: any;
  oldLevel: number;
  newLevel: number;
  xpGained: number;
  leveledUp: boolean;
  gainsPerLevel: Array<{ level: number; gains: Record<string, number> }>;
}

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);

  constructor(
    private prisma: PrismaService,
    private effectService: EffectService,
    private notificationService: NotificationService,
    private settlementService: LocationSettlementService,
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

  /**
   * The canonical entry point for granting entity XP.
   *
   * Every source of entity XP (mission rewards, consumables, crafting, gifts,
   * admin grants, anything new) MUST flow through this method. No code path
   * should mutate `progression.level` or `progression.xp` directly anymore.
   *
   * Behavior:
   *   - Applies the `xp_multiplier` effect modifier exactly once (skip with
   *     `opts.skipEffects` when the caller has already applied it).
   *   - Runs the level loop, applying `applyWeightedLevelUp` per level and
   *     appending one `{ level, gains }` entry to `progression.levelHistory`
   *     per level transition (multi-level jumps produce multiple entries).
   *   - Emits a single (per-call) `entity_level_up` notification when one or
   *     more levels were gained, grouped by entity so rapid back-to-back
   *     gains in the same settlement collapse into one toast.
   *   - Participates in the caller's transaction when `tx` is supplied.
   */
  async addEntityXp(
    entityId: string,
    userId: string,
    xp: number,
    tx?: any,
    opts?: { skipEffects?: boolean; skipNotification?: boolean },
  ): Promise<AddEntityXpResult> {
    const db = tx || this.prisma;
    const entity = await (db as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      include: { equipment: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');

    const progression = (entity.progression as any) || {};
    const oldLevel = progression.level || 1;
    const currentXp = Number(progression.xp || 0);
    const entityName = (entity.display as any)?.name || entity.speciesId || 'Entity';

    if (oldLevel >= MAX_ENTITY_LEVEL) {
      return {
        entity: serializeEntity(entity),
        oldLevel,
        newLevel: oldLevel,
        xpGained: 0,
        leveledUp: false,
        gainsPerLevel: [],
      };
    }

    let effectiveXp = xp;
    if (!opts?.skipEffects && xp > 0) {
      try {
        const xpMod = await this.effectService.resolveForTarget(
          userId, EffectTargetType.PLAYER, userId, EffectCategory.XP_MULTIPLIER, db,
        );
        if (xpMod.flatAdd !== 0 || xpMod.percentAdd !== 0 || xpMod.multiplier !== 1) {
          effectiveXp = Math.floor(applyModifier(xp, xpMod));
        }
      } catch {}
    }

    let newXp = currentXp + effectiveXp;
    let newLevel = oldLevel;
    let currentStats: Record<string, any> = (entity.stats as any) || {};
    const levelHistory: any[] = Array.isArray(progression.levelHistory) ? [...progression.levelHistory] : [];
    const gainsPerLevel: Array<{ level: number; gains: Record<string, number> }> = [];

    const compositRarity = typeof currentStats.compositRarity === 'number' ? currentStats.compositRarity : 1.0;

    while (newLevel < MAX_ENTITY_LEVEL && newXp >= XP_PER_LEVEL(newLevel)) {
      newXp -= XP_PER_LEVEL(newLevel);
      const levelBeforeIncrement = newLevel;
      newLevel++;
      const result = applyWeightedLevelUp(currentStats, compositRarity, levelBeforeIncrement);
      currentStats = result.stats;
      levelHistory.push({ level: newLevel, gains: result.gains, at: new Date().toISOString() });
      gainsPerLevel.push({ level: newLevel, gains: result.gains });
    }

    const updatedProgression = { ...progression, level: newLevel, xp: newXp, levelHistory };
    const updated = await (db as any).entity.update({
      where: { id: entityId },
      data: { progression: updatedProgression, stats: currentStats },
      include: { equipment: true },
    });

    const leveledUp = newLevel > oldLevel;

    // If this entity gained at least one level *and* is currently working at
    // an outpost, the outpost's stat-driven worker multipliers may have
    // shifted (FOC/SPD can change on level-up). Recalc location meta so
    // displayed and settled rates stay accurate without waiting for the
    // next assign/unassign event.
    if (leveledUp) {
      try {
        await this.settlementService.recalcLocationsForWorkerEntity(entityId, db);
      } catch (err) {
        this.logger.warn(
          `Failed to recalc worker locations for entity ${entityId} after level-up: ${err}`,
        );
      }
    }

    if (leveledUp && !opts?.skipNotification) {
      try {
        await this.notificationService.recordEntityLevelUp(
          {
            userId,
            entityId,
            entityName,
            fromLevel: oldLevel,
            toLevel: newLevel,
            gainsPerLevel,
          },
          tx,
        );
      } catch (err) {
        // Notification failures must never break XP grants.
        this.logger.warn(`Failed to record entity_level_up notification for ${entityId}: ${err}`);
      }
    }

    return {
      entity: serializeEntity(updated),
      oldLevel,
      newLevel,
      xpGained: effectiveXp,
      leveledUp,
      gainsPerLevel,
    };
  }

  /**
   * Idempotent backfill that walks every entity whose
   * `progression.level > 1` and whose `progression.levelHistory` has fewer
   * than `level - 1` entries (i.e. missed gains from before XP was
   * centralized), and runs `applyWeightedLevelUp` enough times to fill the
   * gap, writing the resulting stats and synthesized history back.
   *
   * - Uses the same helper as the runtime path.
   * - Will not double-apply on entities whose history is already complete.
   * - Does not fire level-up notifications.
   * - Logs a per-entity summary.
   */
  async backfillLevelHistory(): Promise<{ scanned: number; fixed: number }> {
    const all = await (this.prisma as any).entity.findMany();
    let fixed = 0;
    for (const e of all) {
      const prog = (e.progression as any) || {};
      const level = prog.level || 1;
      if (level <= 1) continue;
      const history = Array.isArray(prog.levelHistory) ? prog.levelHistory : [];
      const expected = level - 1;
      if (history.length >= expected) continue;

      const startLevel = history.length + 2; // levels 2..level are the legitimate entries
      let stats: Record<string, any> = (e.stats as any) || {};
      const compositRarity = typeof stats.compositRarity === 'number' ? stats.compositRarity : 1.0;
      const newHistory: Array<{ level: number; gains: Record<string, number> }> = [...history];
      for (let lvl = startLevel; lvl <= level; lvl++) {
        const result = applyWeightedLevelUp(stats, compositRarity, lvl - 1);
        stats = result.stats;
        newHistory.push({ level: lvl, gains: result.gains });
      }

      await (this.prisma as any).entity.update({
        where: { id: e.id },
        data: {
          stats,
          progression: { ...prog, levelHistory: newHistory },
        },
      });
      fixed++;
      this.logger.log(
        `Backfilled entity ${e.id.slice(0, 8)}: ${history.length} → ${newHistory.length} history entries (level ${level})`,
      );
    }
    if (all.length > 0) {
      this.logger.log(`Entity level-history backfill complete: scanned=${all.length}, fixed=${fixed}`);
    }
    return { scanned: all.length, fixed };
  }

  async getEntityEvents(entityId: string, userId: string): Promise<any[]> {
    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
      select: { id: true, progression: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');

    const events: any[] = [];

    // ── Mission events ──────────────────────────────────────────────────────
    const jobs = await (this.prisma as any).job.findMany({
      where: {
        userId,
        type: 'MissionJob',
        status: { in: ['completed', 'failed'] },
      },
      select: { id: true, defId: true, results: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    // Batch-fetch mission names to avoid N+1
    const defIds = [...new Set(jobs.map((j: any) => j.defId as string))];
    const defs = defIds.length > 0
      ? await (this.prisma as any).missionDef.findMany({
          where: { id: { in: defIds } },
          select: { id: true, name: true },
        })
      : [];
    const defNameById = new Map<string, string>(defs.map((d: any) => [d.id, d.name]));

    for (const job of jobs) {
      const results = job.results as any;
      if (!results) continue;
      const entityResult = (Array.isArray(results.entityResults) ? results.entityResults : [])
        .find((er: any) => er.id === entityId);
      if (!entityResult) continue;

      const missionName = defNameById.get(job.defId) ?? job.defId;

      events.push({
        type: 'mission',
        timestamp: (job.updatedAt as Date).toISOString(),
        missionName,
        success: results.success === true,
        xpGained: entityResult.xpGained || 0,
        injured: entityResult.injured || false,
      });

      if (entityResult.injured) {
        events.push({
          type: 'injury',
          timestamp: (job.updatedAt as Date).toISOString(),
          missionName,
        });
      }
    }

    // ── Level-up events from levelHistory ───────────────────────────────────
    const progression = (entity.progression as any) || {};
    const levelHistory: any[] = Array.isArray(progression.levelHistory) ? progression.levelHistory : [];
    for (const entry of levelHistory) {
      events.push({
        type: 'level_up',
        timestamp: entry.at ?? null,
        level: entry.level,
        gains: entry.gains || {},
      });
    }

    // Sort: timestamped events descending, null-timestamp events after (by level desc)
    events.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return (b.level || 0) - (a.level || 0);
    });

    return events.slice(0, 50);
  }

  async setEntityStatus(entityId: string, userId: string, status: string, tx?: any) {
    const db = tx || this.prisma;
    const entity = await (db as any).entity.findFirst({
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
    const updated = await (db as any).entity.update({
      where: { id: entityId },
      data: { state: newState },
      include: { equipment: true },
    });
    return serializeEntity(updated);
  }
}
