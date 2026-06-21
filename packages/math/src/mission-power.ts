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
