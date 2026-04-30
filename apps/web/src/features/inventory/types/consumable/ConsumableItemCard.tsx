import DefaultItemCard from '../_default/DefaultItemCard';
import type { ItemCardProps } from '../../types';
import './ConsumableItemCard.css';

/**
 * Bespoke card for CONSUMABLE-type items (potions, elixirs, scrolls).
 *
 * Wraps DefaultItemCard and layers a soft green "potion glow" behind the
 * icon plus a small bubble decoration so consumables feel distinct from
 * inert materials in the inventory grid.
 */
export default function ConsumableItemCard(props: ItemCardProps) {
  return (
    <DefaultItemCard
      {...props}
      className={['item-card--consumable', props.className].filter(Boolean).join(' ')}
    />
  );
}
