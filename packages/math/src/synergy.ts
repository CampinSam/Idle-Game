import { EntityTraits } from '@derp/shared';
import { ANTI_WHALE_CAPS } from '@derp/shared';

/**
 * Calculate synergy score from a team's trait distribution.
 * More matching archetypes across entities = higher synergy.
 *
 * Works with any EntityDefinition slot schema — iterates over the union of
 * all slots present in the team rather than a hardcoded Derp-specific list.
 */
export const calculateSynergyScore = (teamTraits: EntityTraits[]): number => {
  if (teamTraits.length <= 1) return 0;

  const allSlots = new Set<string>();
  for (const traits of teamTraits) {
    for (const slot of Object.keys(traits)) {
      allSlots.add(slot);
    }
  }

  let score = 0;

  for (const slot of allSlots) {
    const counts = new Map<string, number>();
    for (const traits of teamTraits) {
      const arch = traits[slot];
      if (arch) counts.set(arch, (counts.get(arch) || 0) + 1);
    }
    for (const count of counts.values()) {
      if (count > 1) {
        score += count - 1;
      }
    }
  }

  return score;
};

/**
 * Convert synergy score into MP bonus percentage (capped at 30%).
 */
export const calculateSynergyBonus = (teamTraits: EntityTraits[]): number => {
  const score = calculateSynergyScore(teamTraits);

  let bonus: number;
  if (score <= 5) bonus = 0;
  else if (score <= 10) bonus = 0.05;
  else if (score <= 15) bonus = 0.10;
  else if (score <= 20) bonus = 0.15;
  else if (score <= 25) bonus = 0.20;
  else if (score <= 30) bonus = 0.25;
  else bonus = 0.30;

  return Math.min(bonus, ANTI_WHALE_CAPS.synergyStackingCap);
};
