export const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
export type StatKey = typeof STAT_KEYS[number];

export const POWER_SCORE_WEIGHTS: Record<StatKey, number> = {
  ATK: 0.40,
  DEF: 0.30,
  SPD: 0.20,
  FOC: 0.10,
  LCK: 0.05,
  VIT: 0.05,
};

export interface ScalingContribution {
  statScaling: Record<string, number>;
  rarityMultiplier: number;
}

export function computeScaling(contributions: ScalingContribution[]): Record<string, number> {
  const n = contributions.length;
  const scaling: Record<string, number> = {};

  if (n === 0) {
    for (const k of STAT_KEYS) scaling[k] = 1.0;
    return scaling;
  }

  for (const k of STAT_KEYS) {
    const product = contributions.reduce((acc, c) => {
      const v = c.statScaling[k];
      return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
    }, 1.0);
    scaling[k] = Math.pow(product, 1 / n);
  }

  const rarityProduct = contributions.reduce((acc, c) => {
    const v = c.rarityMultiplier;
    return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
  }, 1.0);
  const rarityGeoMean = Math.pow(rarityProduct, 1 / n);

  for (const k of STAT_KEYS) {
    scaling[k] *= rarityGeoMean;
  }

  return scaling;
}

export interface LevelUpResult {
  stats: Record<string, any>;
  gains: Record<string, number>;
}

/**
 * Apply a single weighted level-up: +1 to every stat, then +14 weighted points
 * distributed by the entity's `scaling` weights. Mutates a copy of the input.
 */
export function applyWeightedLevelUp(currentStats: Record<string, any>): LevelUpResult {
  const boosted = { ...currentStats };
  const scaling: Record<string, number> = (boosted.scaling as any) || {};

  const gains: Record<string, number> = {};
  for (const k of STAT_KEYS) gains[k] = 0;

  for (const k of STAT_KEYS) {
    boosted[k] = (boosted[k] || 0) + 1;
    gains[k] += 1;
  }

  const totalWeight = STAT_KEYS.reduce((sum, k) => sum + (scaling[k] || 1), 0);

  for (let i = 0; i < 14; i++) {
    let roll = Math.random() * totalWeight;
    for (const k of STAT_KEYS) {
      roll -= (scaling[k] || 1);
      if (roll <= 0) {
        boosted[k] = (boosted[k] || 0) + 1;
        gains[k] += 1;
        break;
      }
    }
  }

  boosted.scaling = scaling;
  return { stats: boosted, gains };
}

/**
 * Power score for an entity given its stats. Matches the display formula
 * used on the Entities page and the mission-power calculation.
 */
export function getPowerScore(stats: Record<string, any>): number {
  const s = stats || {};
  return (
    (Number(s.ATK) || 0) * POWER_SCORE_WEIGHTS.ATK +
    (Number(s.DEF) || 0) * POWER_SCORE_WEIGHTS.DEF +
    (Number(s.SPD) || 0) * POWER_SCORE_WEIGHTS.SPD +
    (Number(s.FOC) || 0) * POWER_SCORE_WEIGHTS.FOC +
    (Number(s.LCK) || 0) * POWER_SCORE_WEIGHTS.LCK +
    (Number(s.VIT) || 0) * POWER_SCORE_WEIGHTS.VIT
  );
}
