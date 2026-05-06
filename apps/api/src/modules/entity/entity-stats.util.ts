/**
 * Entity serialization with computed equipment-aware stats.
 *
 * Per dev principle #1 (server authority), the server is the single source of
 * truth for derived values. The frontend renders `baseStats` and
 * `equippedStats` directly — it never re-applies equipment math on the client.
 *
 * Per dev principle #5 (no Entity.stats mutation), `entity.stats` is treated
 * as the immutable base. Equipment contributes through the EffectResolver
 * (see EffectService.getPassiveEffectsFromEquipment) at gameplay-resolution
 * time, and is mirrored here for UI display.
 */

import { EffectCategory, EffectDurationModel } from '@derp/shared';

export const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
export type StatKey = typeof STAT_KEYS[number];

export type StatMap = Record<StatKey, number>;

function emptyStats(): StatMap {
  return { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 };
}

/**
 * Returns true if the given gear's `equipData.stats` payload would change any
 * of the six core stat keys (i.e. has a non-zero numeric value for at least
 * one). Cosmetic gear with no stat contribution returns false.
 *
 * Used by EquipItem / UnequipItem handlers to block stat-changing equip
 * actions on busy entities (worker / mission / injured).
 */
export function gearWouldChangeStats(equipData: unknown): boolean {
  if (!equipData || typeof equipData !== 'object') return false;
  const stats = (equipData as { stats?: unknown }).stats;
  if (!stats || typeof stats !== 'object') return false;
  const s = stats as Record<string, unknown>;
  for (const key of STAT_KEYS) {
    const v = s[key];
    if (typeof v === 'number' && v !== 0) return true;
  }
  return false;
}

/**
 * Returns true if the given effect definition would change any of the six
 * core stat keys when applied. Two cases:
 *   - category is STAT_BOOST (handles both INSTANT and TIMED variants which
 *     write to entity.stats or layer through the resolver).
 *   - effect is INSTANT and writes to one of the six stat keys via its
 *     `stats` payload (covers stat-targeting instants in non-STAT_BOOST
 *     categories should they ever be authored).
 *
 * Used by UseConsumable handler to block stat-changing consumables on busy
 * entities.
 */
export function effectWouldChangeStats(def: {
  category: string;
  durationModel?: string | null;
  stats?: Record<string, number> | null;
}): boolean {
  if (def.category === EffectCategory.STAT_BOOST) return true;
  if (def.durationModel === EffectDurationModel.INSTANT) {
    const s = def.stats;
    if (s && typeof s === 'object') {
      for (const key of STAT_KEYS) {
        const v = (s as Record<string, unknown>)[key];
        if (typeof v === 'number' && v !== 0) return true;
      }
    }
  }
  return false;
}

export function normalizeStats(stats: unknown): StatMap {
  const s = (stats || {}) as Record<string, unknown>;
  const out = {} as StatMap;
  for (const k of STAT_KEYS) {
    const lower = k.toLowerCase();
    const raw = s[k] ?? s[lower];
    out[k] = typeof raw === 'number' ? raw : 0;
  }
  return out;
}

function addStats(into: StatMap, add: Record<string, unknown> | null | undefined): void {
  if (!add || typeof add !== 'object') return;
  for (const k of STAT_KEYS) {
    const v = (add as Record<string, unknown>)[k];
    if (typeof v === 'number') into[k] += v;
  }
}

/**
 * Async serializer that resolves equipped item instances and computes the
 * equipped-stat overlay. Used by every code path that ships an entity to
 * the client (bootstrap, deltas, command patches) so the UI sees the
 * canonical shape everywhere.
 */
export async function serializeEntityFull(tx: any, entity: any): Promise<any> {
  const progression = (entity.progression as any) || {};
  if (progression && typeof progression.xp === 'bigint') {
    progression.xp = Number(progression.xp);
  }
  const display = (entity.display as any) || {};
  const state = (entity.state as any) || {};

  const baseStats = normalizeStats(entity.stats);
  const equippedStats: StatMap = { ...baseStats };

  const equipmentRows: any[] = Array.isArray(entity.equipment) ? entity.equipment : [];
  if (equipmentRows.length > 0) {
    const itemIds = equipmentRows.map((eq) => eq.itemInstanceId).filter(Boolean);
    if (itemIds.length > 0) {
      const items = await tx.itemInstance.findMany({
        where: { id: { in: itemIds } },
        include: {
          definition: {
            select: { id: true, name: true, iconKey: true, rarity: true, equipData: true },
          },
        },
      });
      for (const inst of items) {
        const equipData = inst.definition?.equipData as any;
        addStats(equippedStats, equipData?.stats);
      }
    }
  }

  return {
    ...entity,
    progression,
    name: display.name || entity.speciesId || 'Entity',
    level: progression.level || 1,
    xp: Number(progression.xp || 0),
    status: state.status || 'idle',
    ...(display.imageUrl ? { imageUrl: display.imageUrl } : {}),
    baseStats,
    equippedStats,
  };
}

/**
 * Returns the equipment-aware stat map for a single entity. The entity must
 * have been loaded with `equipment: true`. Sums `equipData.stats` from each
 * equipped item instance on top of the entity's `stats` (base) — same math
 * `serializeEntityFull` runs, but without the wrapping serializer payload.
 */
export async function computeEquippedStats(tx: any, entity: any): Promise<StatMap> {
  const out = normalizeStats(entity?.stats);
  const equipmentRows: any[] = Array.isArray(entity?.equipment) ? entity.equipment : [];
  const itemIds = equipmentRows.map((eq) => eq.itemInstanceId).filter(Boolean);
  if (itemIds.length === 0) return out;

  const items = await tx.itemInstance.findMany({
    where: { id: { in: itemIds } },
    include: {
      definition: { select: { equipData: true } },
    },
  });
  for (const inst of items) {
    const equipData = inst.definition?.equipData as any;
    addStats(out, equipData?.stats);
  }
  return out;
}

/**
 * Loads the given entity ids and returns the elementwise sum of their
 * equipped stats. Used by location settlement to drive the stat-based
 * worker production / consumption multipliers.
 */
export async function sumEquippedStatsForEntities(tx: any, entityIds: string[]): Promise<StatMap> {
  const total = emptyStats();
  if (!entityIds || entityIds.length === 0) return total;

  const entities = await tx.entity.findMany({
    where: { id: { in: entityIds } },
    include: { equipment: true },
  });
  for (const entity of entities) {
    const stats = await computeEquippedStats(tx, entity);
    for (const k of STAT_KEYS) total[k] += stats[k];
  }
  return total;
}
