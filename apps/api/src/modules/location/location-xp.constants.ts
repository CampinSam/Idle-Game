/**
 * Shared, dependency-free constants for the location XP / level-up flow.
 *
 * Lives outside any service so collaborators (UiService, LocationService,
 * future handlers) can reference these values without pulling in
 * LocationService at runtime — keeping the module graph acyclic.
 */

export interface LocationXpCostOption {
  type: 'currency' | 'item';
  id: string;
  amount: number;
  xpPerCharge: number;
}

/**
 * Fallback XP deposit option used when a LocationDefinition has no
 * `rules.xpDepositCosts` configured. Single source of truth — referenced by
 * both `LocationService.resolveXpDepositCosts` and `UiService.buildModalForLocationDepositXp`.
 */
export const DEFAULT_XP_DEPOSIT_COST: LocationXpCostOption = {
  type: 'currency',
  id: 'hard_essence',
  amount: 1,
  xpPerCharge: 1,
};
