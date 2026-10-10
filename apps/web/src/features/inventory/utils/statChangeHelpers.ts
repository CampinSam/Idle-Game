/**
 * UX-side mirrors of the server's `gearWouldChangeStats` /
 * `effectWouldChangeStats` helpers (see
 * apps/api/src/modules/entity/entity-stats.util.ts). The server remains
 * authoritative — these helpers exist only so the UI can pre-emptively grey
 * out actions the server is going to reject (busy entity + stat-changing
 * gear/consumable), instead of letting the player tap and bottom out on a
 * toast. Keep these in sync with the server helpers.
 */

import { EffectCategory, EffectDurationModel } from '@derp/shared';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

/** Statuses the server treats as "busy" — equip/use of stat-changing items is rejected. */
const BUSY_STATUSES = new Set(['working', 'mission', 'injured']);

export const BUSY_EQUIP_TOOLTIP =
  'Finish or cancel the current job to change equipment.';
export const BUSY_CONSUMABLE_TOOLTIP =
  'Finish or cancel the current job to use stat-changing items.';
export const BUSY_PICKER_TOOLTIP =
  'Currently busy';

export function getEntityStatus(entity: any): string {
  return ((entity?.status ?? entity?.state?.status) ?? 'idle')
    .toString()
    .toLowerCase();
}

export function isEntityBusy(entity: any): boolean {
  return BUSY_STATUSES.has(getEntityStatus(entity));
}

function getEquipData(item: any): any {
  return item?.equipData ?? item?.definition?.equipData ?? null;
}

/** Mirrors apps/api/.../entity-stats.util.ts#gearWouldChangeStats. */
export function gearWouldChangeStats(item: any): boolean {
  const eq = getEquipData(item);
  const stats = eq?.stats;
  if (!stats || typeof stats !== 'object') return false;
  for (const k of STAT_KEYS) {
    const v = (stats as Record<string, unknown>)[k];
    if (typeof v === 'number' && v !== 0) return true;
  }
  return false;
}

/**
 * Mirrors apps/api/.../entity-stats.util.ts#effectWouldChangeStats.
 *
 * Compares against the canonical lowercase wire values of the
 * `EffectCategory` / `EffectDurationModel` enums (e.g. `stat_boost`,
 * `instant`) — not the SCREAMING_CASE TypeScript names. Effect defs come
 * from the API serialized in the enum's wire shape, so case-insensitive
 * matching keeps the predicate robust if any caller upper-cases them.
 */
export function effectDefWouldChangeStats(def: any): boolean {
  if (!def) return false;
  const category = typeof def.category === 'string' ? def.category.toLowerCase() : '';
  const durationModel =
    typeof def.durationModel === 'string' ? def.durationModel.toLowerCase() : '';
  if (category === EffectCategory.STAT_BOOST) return true;
  if (durationModel === EffectDurationModel.INSTANT && def.stats && typeof def.stats === 'object') {
    for (const k of STAT_KEYS) {
      const v = (def.stats as Record<string, unknown>)[k];
      if (typeof v === 'number' && v !== 0) return true;
    }
  }
  return false;
}

/**
 * Returns true if any of the consumable's effects targets an ENTITY *and*
 * would change one of the six core stats. Heal / XP / currency / non-stat
 * effects, or effects targeting the player or a location, return false.
 */
export function consumableWouldChangeEntityStats(
  item: any,
  effectDefs: Record<string, any>,
): boolean {
  const cd = item?.consumableData ?? item?.definition?.consumableData;
  const effects: any[] = Array.isArray(cd?.effects) ? cd.effects : [];
  if (effects.length === 0) return false;
  for (const e of effects) {
    const def = effectDefs[e.effectDefId];
    if (!def) continue;
    const tt = ((e.targetType ?? def.targetType) ?? '').toString().toLowerCase();
    if (tt === 'entity' && effectDefWouldChangeStats(def)) return true;
  }
  return false;
}
