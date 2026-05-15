export const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
export type StatKey = typeof STAT_KEYS[number];

// Re-exported from @derp/shared so the math package is the single consumer-facing
// import for both stat-key lists, but the authoritative definition lives in shared.
export { VISIBLE_STATS, HIDDEN_STATS } from '@derp/shared';

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

  // Compute geometric mean for RND if any contribution authored a positive RND weight.
  // RND is preserved in the output scaling map so it can be used as a level-up
  // weight at level-up time — it is never resolved here.
  const hasRnd = contributions.some((c) => typeof c.statScaling['RND'] === 'number' && c.statScaling['RND'] > 0);
  if (hasRnd) {
    const rndProduct = contributions.reduce((acc, c) => {
      const v = c.statScaling['RND'];
      return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
    }, 1.0);
    scaling['RND'] = Math.pow(rndProduct, 1 / n);
  }

  const rarityProduct = contributions.reduce((acc, c) => {
    const v = c.rarityMultiplier;
    return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
  }, 1.0);
  const rarityGeoMean = Math.pow(rarityProduct, 1 / n);

  for (const k of STAT_KEYS) {
    scaling[k] *= rarityGeoMean;
  }
  // Apply rarity multiplier to RND weight as well so chaos entities benefit from
  // the same rarity scaling bonus as all other weighted stats.
  if (hasRnd) {
    scaling['RND'] *= rarityGeoMean;
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
 * Stat-gain rules sourced from EntityDefinition.progression.statGain.
 * Passed in by the caller so the math package stays definition-agnostic.
 *
 * Defaults reproduce the legacy hardcoded behavior exactly:
 *   - guaranteed +1 to every visible stat
 *   - bonus pool = floor(14 * compositRarity^(currentLevel * 0.16))
 *   - 50/50 split between uniform-random and scaling-weighted distribution
 */
export interface StatGainConfig {
  guaranteed?: Partial<Record<StatKey, number>>;
  bonusPool?:
    | { kind: 'rarityScaled'; base: number; exponent: number; rarityField?: string }
    | { kind: 'flat'; amount: number };
  distribution?: {
    uniformShare?: number;
    weightedShare?: number;
    weightsField?: string;
  };
}

const DEFAULT_STAT_GAIN: Required<StatGainConfig> = {
  guaranteed: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 },
  bonusPool: { kind: 'rarityScaled', base: 14, exponent: 0.16, rarityField: 'compositRarity' },
  distribution: { uniformShare: 0.5, weightedShare: 0.5, weightsField: 'scaling' },
};

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
  randomStatPicker?: (visibleStats: readonly StatKey[]) => StatKey,
  config?: StatGainConfig,
): LevelUpResult {
  const pickRandom = randomStatPicker ?? ((stats) => stats[Math.floor(Math.random() * stats.length)]);
  const cfgGuaranteed = (config?.guaranteed ?? DEFAULT_STAT_GAIN.guaranteed) as Partial<Record<StatKey, number>>;
  const cfgBonus = config?.bonusPool ?? DEFAULT_STAT_GAIN.bonusPool;
  const cfgDist = config?.distribution ?? DEFAULT_STAT_GAIN.distribution;
  const uniformShare = typeof cfgDist.uniformShare === 'number' ? cfgDist.uniformShare : 0.5;
  const weightsField =
    typeof cfgDist.weightsField === 'string' && cfgDist.weightsField.length > 0
      ? cfgDist.weightsField
      : 'scaling';
  const rarityField =
    cfgBonus.kind === 'rarityScaled' && typeof cfgBonus.rarityField === 'string' && cfgBonus.rarityField.length > 0
      ? cfgBonus.rarityField
      : null;

  const boosted = { ...currentStats };
  const scaling: Record<string, number> = (boosted[weightsField] as any) || {};
  const effectiveRarity = rarityField
    ? (typeof boosted[rarityField] === 'number' ? boosted[rarityField] : compositRarity)
    : compositRarity;

  const gains: Record<string, number> = {};
  for (const k of STAT_KEYS) gains[k] = 0;

  for (const k of STAT_KEYS) {
    const g = cfgGuaranteed[k] ?? 0;
    if (g > 0) {
      boosted[k] = (boosted[k] || 0) + g;
      gains[k] += g;
    }
  }

  const bonusPool = cfgBonus.kind === 'flat'
    ? Math.floor(cfgBonus.amount)
    : Math.floor(cfgBonus.base * Math.pow(effectiveRarity, currentLevel * cfgBonus.exponent));
  const unweightedCount = Math.floor(bonusPool * uniformShare);
  const weightedCount = bonusPool - unweightedCount;

  for (let i = 0; i < unweightedCount; i++) {
    const k = pickRandom(STAT_KEYS);
    boosted[k] = (boosted[k] || 0) + 1;
    gains[k] += 1;
  }

  // Build the weight map including RND if present in scaling.
  // When the weighted draw lands on RND, a random visible stat receives the point.
  const weightEntries: Array<{ key: string; weight: number }> = [];
  for (const k of STAT_KEYS) {
    weightEntries.push({ key: k, weight: scaling[k] || 1 });
  }
  const rndWeight = typeof scaling['RND'] === 'number' && scaling['RND'] > 0 ? scaling['RND'] : 0;
  if (rndWeight > 0) {
    weightEntries.push({ key: 'RND', weight: rndWeight });
  }
  const totalWeight = weightEntries.reduce((sum, e) => sum + e.weight, 0);

  for (let i = 0; i < weightedCount; i++) {
    let roll = Math.random() * totalWeight;
    let chosen = weightEntries[weightEntries.length - 1].key;
    for (const entry of weightEntries) {
      roll -= entry.weight;
      if (roll <= 0) {
        chosen = entry.key;
        break;
      }
    }
    const target: StatKey = chosen === 'RND' ? pickRandom(STAT_KEYS) : (chosen as StatKey);
    boosted[target] = (boosted[target] || 0) + 1;
    gains[target] += 1;
  }

  boosted[weightsField] = scaling;
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
