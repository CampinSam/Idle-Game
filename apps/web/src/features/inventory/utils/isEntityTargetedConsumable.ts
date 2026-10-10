import { getConsumableTargetType } from './getConsumableTargetType';

/**
 * Backward-compat helper: returns true when this consumable needs an entity
 * target. Implemented in terms of `getConsumableTargetType` so the two stay
 * in sync.
 */
export function isEntityTargetedConsumable(item: any): boolean {
  return getConsumableTargetType(item) === 'entity';
}
