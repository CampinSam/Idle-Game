import { EntityTraits, EntityArchetype } from '@derp/shared';
import { ANTI_WHALE_CAPS } from '@derp/shared';

/**
 * Calculate synergy score from a team's trait distribution.
 * More matching archetypes across entities = higher synergy.
 */
export const calculateSynergyScore = (teamTraits: EntityTraits[]): number => {
  if (teamTraits.length <= 1) return 0;

  const traitSlots: (keyof EntityTraits)[] = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'];
  let score = 0;

  for (const slot of traitSlots) {
    const archetypes = teamTraits.map((t) => t[slot]);
    const counts = new Map<EntityArchetype, number>();
    for (const arch of archetypes) {
      counts.set(arch, (counts.get(arch) || 0) + 1);
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
