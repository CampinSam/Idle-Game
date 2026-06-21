import { EntityStats, TraitPrimitive } from '@derp/shared';

export interface EntityForMP {
  stats: EntityStats;
  traits: Record<string, TraitPrimitive>;
}

/**
 * Calculate base Mission Power for a single entity.
 * Server-side only — never expose to client.
 */
export const calculateMP = (stats: EntityStats): number => {
  return (
    stats.ATK * 0.40 +
    stats.DEF * 0.30 +
    stats.SPD * 0.20 +
    stats.FOC * 0.10 +
    stats.LCK * 0.05 +
    stats.VIT * 0.05
  );
};

/**
 * Calculate total team Mission Power (base stats only).
 * Synergy bonuses are now data-driven and applied separately via
 * SynergyResolverService — callers should add the resolver's output
 * on top of this base total.
 */
export const calculateTeamMP = (entities: EntityForMP[]): number => {
  return entities.reduce((sum, e) => sum + calculateMP(e.stats), 0);
};

/**
 * DEF mitigation scale constant for per-entity injury chance.
 * At DEF = DEF_INJURY_SCALE the base injury chance is halved.
 * Higher values make DEF weaker; lower values make it stronger.
 */
export const DEF_INJURY_SCALE = 200;

/**
 * Calculate the per-entity injury chance on mission failure.
 *
 * Base formula:  D / (TMP + D) * IR
 * DEF mitigation: mitigation = 1 - DEF / (DEF + DEF_INJURY_SCALE)
 * Full formula:  (D / (TMP + D)) * IR * mitigation
 *
 * The mitigation uses an asymptotic curve identical to the VIT functions:
 *   DEF =   0 → mitigation = 1.00 (no reduction)
 *   DEF = 200 → mitigation = 0.50 (50 % reduction)
 *   DEF = ∞   → mitigation → 0.00 (near-zero chance)
 *
 * `def` defaults to 0 so callers that do not pass it (e.g. preview endpoints)
 * are unaffected and continue using the base formula.
 *
 * Returns a float 0–1 for use with rng.chance().
 */
export const calculateInjuryChance = (
  difficulty: number,
  totalTeamMP: number,
  injuryRate: number,
  def: number = 0,
): number => {
  if (injuryRate <= 0 || totalTeamMP + difficulty <= 0) return 0;
  const baseProbability = (difficulty / (totalTeamMP + difficulty)) * injuryRate;
  const mitigation = 1 - def / (def + DEF_INJURY_SCALE);
  return baseProbability * mitigation;
};

/**
 * Calculate recovery ticks for an injured entity.
 * Formula: baseRecoveryTicks * (1 - VIT / (VIT + 100)), rounded to nearest integer.
 * Higher VIT → shorter recovery.
 */
export const calculateInjuryRecoveryTicks = (
  baseRecoveryTicks: number,
  vit: number,
): number => {
  return Math.round(baseRecoveryTicks * (1 - vit / (vit + 100)));
};

/**
 * Reduce an injury's MP penalty severity based on entity VIT.
 * Uses the same curve as recovery-tick reduction so both duration and
 * severity scale consistently: higher VIT → weaker penalty (closer to 1.0).
 *
 * Formula: 1 - (1 - basePenalty) * (1 - VIT / (VIT + 100))
 *
 * Examples (basePenalty = 0.8 → 20 % MP loss):
 *   VIT=0   → 0.80  (full penalty)
 *   VIT=100 → 0.90  (half the penalty)
 *   VIT=∞   → 1.00  (no penalty)
 */
export const calculateInjuryPenaltyMultiplier = (
  basePenalty: number,
  vit: number,
): number => {
  const vitFactor = 1 - vit / (vit + 100);
  return 1 - (1 - basePenalty) * vitFactor;
};

/**
 * Asymptotic scale constant for SPD timer reduction.
 * At effectiveSPD = SPD_TIMER_SCALE the timer is reduced by 50 %.
 * Higher values make SPD weaker; lower values make it stronger.
 * Mirrors DEF_INJURY_SCALE in shape and intent.
 */
export const SPD_TIMER_SCALE = 300;

/**
 * Compute the team's effective SPD for mission timer reduction.
 *
 * Algorithm:
 * 1. Compute team mean (μ) and population standard deviation (σ).
 * 2. Filter to entities with SPD strictly above μ + σ.
 *    - When σ = 0 (all equal) the threshold equals μ and no entity qualifies,
 *      so the mechanic only activates when genuine speed outliers exist.
 * 3. Return sqrt(Σ qualifying_SPD²) — same Pythagorean aggregation as effectiveCL.
 */
export const calculateEffectiveTeamSPD = (entities: Array<{ stats?: Record<string, number> | EntityStats }>): number => {
  if (entities.length === 0) return 0;
  const spds = entities.map((e) => (e.stats as any)?.SPD ?? 0);
  const mean = spds.reduce((s, v) => s + v, 0) / spds.length;
  const variance = spds.reduce((s, v) => s + (v - mean) ** 2, 0) / spds.length;
  const sigma = Math.sqrt(variance);
  const threshold = mean + sigma;
  const qualifying = spds.filter((s) => s > threshold);
  if (qualifying.length === 0) return 0;
  return Math.sqrt(qualifying.reduce((s, v) => s + v * v, 0));
};

/**
 * Convert an effective team SPD into a timer duration multiplier.
 *
 * Formula: 1 - effectiveSPD / (effectiveSPD + SPD_TIMER_SCALE)
 * Returns a value in [0, 1) representing the fraction of the original
 * duration to *keep*. Multiply `durationTicks` by this value to shorten it.
 *
 * Examples (SPD_TIMER_SCALE = 300):
 *   effectiveSPD =   0 → multiplier = 1.00  (no reduction)
 *   effectiveSPD = 150 → multiplier ≈ 0.67  (~33 % faster)
 *   effectiveSPD = 300 → multiplier = 0.50  (50 % faster)
 *   effectiveSPD = 600 → multiplier ≈ 0.33  (~67 % faster)
 *   effectiveSPD → ∞   → multiplier → 0.00  (asymptotic limit)
 */
export const calculateSpdTimerMultiplier = (effectiveSPD: number): number => {
  if (effectiveSPD <= 0) return 1;
  return 1 - effectiveSPD / (effectiveSPD + SPD_TIMER_SCALE);
};
