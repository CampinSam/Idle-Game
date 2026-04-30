import DefaultItemCard from '../_default/DefaultItemCard';
import type { ItemCardProps } from '../../types';
import './ConsumableItemCard.css';

export default function ConsumableItemCard(props: ItemCardProps) {
  return (
    <DefaultItemCard
      {...props}
      className={['item-card--consumable', props.className].filter(Boolean).join(' ')}
    />
  );
}
