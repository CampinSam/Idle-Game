import { EntityStats } from '@derp/shared';
import { ANTI_WHALE_CAPS } from '@derp/shared';

export interface CraftingBonuses {
  relic: number;
  worker: number;
  room: number;
}

/**
 * Calculate Crafting Luck for an entity with bonuses.
 * Hard-capped at 150.
 */
export const calculateCraftingLuck = (
  stats: EntityStats,
  bonuses: CraftingBonuses = { relic: 0, worker: 0, room: 0 },
): number => {
  const cl =
    stats.FOC * 0.5 +
    stats.LCK * 0.3 +
    bonuses.relic +
    bonuses.worker +
    bonuses.room;

  return Math.min(cl, ANTI_WHALE_CAPS.craftingLuckCap);
};
