import {
  STAT_KEYS,
  computeScaling,
  applyWeightedLevelUp,
  getPowerScore,
  type ScalingContribution,
} from '@derp/math';

export interface TraitDef {
  archetype: string;
  slotStats: Record<string, Record<string, number>>;
  scaling: Record<string, number>;
  rarityMultiplier: number;
}

export interface EntityDef {
  id: string;
  name: string;
  speciesId: string;
  slots: Record<string, string[]>;
}

export interface BalanceBundle {
  entityDefinitions: EntityDef[];
  traitDefinitions: Record<string, TraitDef>;
}

export interface SimulationResult {
  /** Mean power score per level. Index = level - 1, length = maxLevel. */
  mean: number[];
  /** 10th-percentile power score per level. */
  p10: number[];
  /** Median (50th-percentile) power score per level. */
  p50: number[];
  /** 90th-percentile power score per level. */
  p90: number[];
}

/**
 * Roll one bird end-to-end: pick a random allowed archetype per slot, sum
 * the trait slot stats into baseStats, and compute the geometric-mean scaling.
 *
 * Mirrors `generateEntityData` in the API generator exactly, minus the DB.
 */
function rollBirdInitialStats(def: EntityDef, traits: Record<string, TraitDef>): Record<string, any> {
  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = 0;

  const contributions: ScalingContribution[] = [];

  for (const [slotName, allowedArchetypes] of Object.entries(def.slots)) {
    if (!Array.isArray(allowedArchetypes) || allowedArchetypes.length === 0) continue;

    const chosen = allowedArchetypes[Math.floor(Math.random() * allowedArchetypes.length)];
    const traitDef = traits[chosen];
    if (!traitDef) continue;

    const slotStats = traitDef.slotStats?.[slotName];
    if (slotStats && typeof slotStats === 'object') {
      for (const [stat, value] of Object.entries(slotStats)) {
        if (typeof value === 'number') {
          baseStats[stat] = (baseStats[stat] || 0) + value;
        }
      }
    }

    const statScaling: Record<string, number> = {};
    for (const k of STAT_KEYS) {
      statScaling[k] = typeof traitDef.scaling?.[k] === 'number' ? traitDef.scaling[k] : 1.0;
    }
    contributions.push({
      statScaling,
      rarityMultiplier: typeof traitDef.rarityMultiplier === 'number' ? traitDef.rarityMultiplier : 1.0,
    });
  }

  const scaling = computeScaling(contributions);
  return { ...baseStats, scaling };
}

/**
 * Simulate `sampleSize` birds for the given entity definition, recording
 * power score at every level from 1 through `maxLevel`. Returns aggregated
 * mean and percentile bands.
 */
export function simulateEntityProgression(
  def: EntityDef,
  traits: Record<string, TraitDef>,
  sampleSize: number,
  maxLevel: number,
): SimulationResult {
  // powersByLevel[level - 1] is an array of power scores across all sims for that level.
  const powersByLevel: number[][] = Array.from({ length: maxLevel }, () => new Array(sampleSize));

  for (let i = 0; i < sampleSize; i++) {
    let stats = rollBirdInitialStats(def, traits);
    powersByLevel[0][i] = getPowerScore(stats);
    for (let level = 2; level <= maxLevel; level++) {
      const result = applyWeightedLevelUp(stats);
      stats = result.stats;
      powersByLevel[level - 1][i] = getPowerScore(stats);
    }
  }

  const mean = new Array<number>(maxLevel);
  const p10 = new Array<number>(maxLevel);
  const p50 = new Array<number>(maxLevel);
  const p90 = new Array<number>(maxLevel);

  for (let l = 0; l < maxLevel; l++) {
    const arr = powersByLevel[l];
    let sum = 0;
    for (const v of arr) sum += v;
    mean[l] = sum / arr.length;
    arr.sort((a, b) => a - b);
    p10[l] = percentile(arr, 0.1);
    p50[l] = percentile(arr, 0.5);
    p90[l] = percentile(arr, 0.9);
  }

  return { mean, p10, p50, p90 };
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = q * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}
