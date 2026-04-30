import DefaultItemCard from '../_default/DefaultItemCard';
import type { ItemCardProps } from '../../types';
import './LootboxItemCard.css';

/**
 * Bespoke card for LOOTBOX-type items (chests, capsules, mystery boxes).
 *
 * Wraps DefaultItemCard via className and layers a sparkle/shimmer treatment
 * through CSS pseudo-elements + a "?" mystery badge so players can spot
 * unopened lootboxes at a glance in the inventory grid.
 */
export default function LootboxItemCard(props: ItemCardProps) {
  return (
    <DefaultItemCard
      {...props}
      className={['item-card--lootbox', props.className].filter(Boolean).join(' ')}
    />
  );
}
