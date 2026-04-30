import DefaultItemCard from '../_default/DefaultItemCard';
import type { ItemCardProps } from '../../types';
import './LootboxItemCard.css';

export default function LootboxItemCard(props: ItemCardProps) {
  return (
    <DefaultItemCard
      {...props}
      className={['item-card--lootbox', props.className].filter(Boolean).join(' ')}
    />
  );
}
