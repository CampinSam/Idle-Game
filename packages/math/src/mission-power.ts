import { EntityStats } from '@derp/shared';
import { calculateSynergyBonus } from './synergy';
import { EntityArchetype, EntityTraits } from '@derp/shared';

export interface EntityForMP {
  stats: EntityStats;
  traits: EntityTraits;
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
 * Calculate total team Mission Power with synergy bonus.
 */
export const calculateTeamMP = (entities: EntityForMP[]): number => {
  const individualMPs = entities.map((b) => calculateMP(b.stats));
  const baseMPTotal = individualMPs.reduce((a, b) => a + b, 0);
  const synergyBonus = calculateSynergyBonus(entities.map((b) => b.traits));
  return baseMPTotal * (1 + synergyBonus);
};
