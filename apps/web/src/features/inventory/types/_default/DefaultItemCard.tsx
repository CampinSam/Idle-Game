import ItemQty from '../../../../components/ItemQty';
import type { ItemCardProps } from '../../types';
import { rarityTextClass } from '../../../../utils/rarityColors';

export default function DefaultItemCard({
  item,
  selected = false,
  disabled = false,
  onClick,
  className = '',
}: ItemCardProps) {
  const cls = [
    'item-card',
    `rarity-${item.rarity || 'COMMON'}`,
    selected && 'item-card--selected',
    disabled && 'item-card--disabled',
    className,
  ].filter(Boolean).join(' ');

  const isEquipped = !!(item.equippedToId || item.isEquipped);
  const sub = item.kind === 'gear' || item.type === 'GEAR'
    ? `Lvl ${item.level ?? 1}`
    : '';

  const rarityLabel = (item.rarity ?? 'COMMON')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div className={cls} onClick={() => !disabled && onClick?.(item)}>
      <div className="item-card__img-wrap">
        <ItemQty
          src={item.iconKey ?? ''}
          amount={item.quantity ?? 1}
          alt={item.name}
          format="compact"
          variant="badge"
        />
      </div>
      <span className="item-card__name">{item.name}</span>
      <span className={`item-card__rarity ${rarityTextClass(item.rarity)}`}>{rarityLabel}</span>
      {isEquipped && (
        <span className="item-card__equipped-badge">Equipped</span>
      )}
      <span className="item-card__sub">{sub}</span>
    </div>
  );
}
