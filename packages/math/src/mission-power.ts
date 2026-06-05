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
 * Calculate the per-entity injury chance on mission failure.
 * Formula: D / (TMP + D) * IR
 * Returns a float 0–1 for use with rng.chance().
 */
export const calculateInjuryChance = (
  difficulty: number,
  totalTeamMP: number,
  injuryRate: number,
): number => {
  if (injuryRate <= 0 || totalTeamMP + difficulty <= 0) return 0;
  return (difficulty / (totalTeamMP + difficulty)) * injuryRate;
};

/**
 * Calculate recovery ticks for an injured entity.
 * Formula: baseRecoveryTicks * (1 - VIT / (VIT + 100)), rounded to nearest integer.
 */
export const calculateInjuryRecoveryTicks = (
  baseRecoveryTicks: number,
  vit: number,
): number => {
  return Math.round(baseRecoveryTicks * (1 - vit / (vit + 100)));
};
