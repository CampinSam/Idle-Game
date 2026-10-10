import { getItemViews } from '../registry';
import type { ItemCardProps } from '../types';

export default function ItemCard(props: ItemCardProps) {
  const Card = getItemViews(props.item).Card;
  return <Card {...props} />;
}
