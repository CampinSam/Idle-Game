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

/**
 * Compute the composite rarity scalar for an entity: the geometric mean of
 * all trait rarityMultiplier values across contributions. A fully-common bird
 * (all rarityMultiplier = 1.0) returns exactly 1.0; a fully-legendary bird
 * returns a value approaching the max rarityMultiplier configured on traits.
 *
 * Stored as `stats.compositRarity` during entity generation so it is
 * available to `applyWeightedLevelUp` without re-reading trait definitions.
 */
export function computeCompositRarity(contributions: ScalingContribution[]): number {
  const n = contributions.length;
  if (n === 0) return 1.0;
  const rarityProduct = contributions.reduce((acc, c) => {
    const v = c.rarityMultiplier;
    return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
  }, 1.0);
  return Math.pow(rarityProduct, 1 / n);
}

export interface LevelUpResult {
  stats: Record<string, any>;
  gains: Record<string, number>;
}

/**
 * Apply a single weighted level-up to an entity:
 *
 * 1. **Guaranteed +1 to every stat** (6 points total, unchanged).
 * 2. **Rarity-scaled bonus pool** = floor(14 × compositRarity^(currentLevel × 0.16)).
 *    - A common bird (compositRarity = 1.0) always gets exactly 14 bonus points.
 *    - A legendary bird (compositRarity ≈ 1.15) earns ~14 at level 1, ~24 at
 *      level 25, and ~41 at level 49.
 * 3. **50/50 split**: half the pool (rounded down) is distributed with equal
 *    probability across all 6 stats; the remaining half follows the entity's
 *    scaling weights. This preserves trait identity while adding meaningful
 *    variance at higher rarities.
 *
 * @param currentStats  The entity's current stats object (must include `scaling`
 *                      and `compositRarity` sub-fields set at generation time).
 * @param compositRarity  Geometric mean of trait rarity multipliers (default 1.0).
 * @param currentLevel    The entity's level **before** this level-up (default 1).
 *                        Pass the old level (e.g. `newLevel - 1` after incrementing),
 *                        not the level being reached. "14 at level 1" means entity
 *                        was at level 1 when the level-up fired → pass 1.
 */
export function applyWeightedLevelUp(
  currentStats: Record<string, any>,
  compositRarity = 1.0,
  currentLevel = 1,
): LevelUpResult {
  const boosted = { ...currentStats };
  const scaling: Record<string, number> = (boosted.scaling as any) || {};

  const gains: Record<string, number> = {};
  for (const k of STAT_KEYS) gains[k] = 0;

  for (const k of STAT_KEYS) {
    boosted[k] = (boosted[k] || 0) + 1;
    gains[k] += 1;
  }

  const bonusPool = Math.floor(14 * Math.pow(compositRarity, currentLevel * 0.16));
  const unweightedCount = Math.floor(bonusPool * 0.5);
  const weightedCount = bonusPool - unweightedCount;

  for (let i = 0; i < unweightedCount; i++) {
    const idx = Math.floor(Math.random() * STAT_KEYS.length);
    const k = STAT_KEYS[idx];
    boosted[k] = (boosted[k] || 0) + 1;
    gains[k] += 1;
  }

  const totalWeight = STAT_KEYS.reduce((sum, k) => sum + (scaling[k] || 1), 0);

  for (let i = 0; i < weightedCount; i++) {
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
