import { formatCompact } from '../../../../utils/formatNumber';
import { resolveAssetUrl, DEFAULT_ICON_URL } from '../../../../utils/iconResolver';
import type { ItemCardProps } from '../../types';
import './DefaultItemCard.css';

function MissingIcon() {
  return (
    <svg className="item-card__missing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

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

  const sub = item.kind === 'gear' || item.type === 'GEAR'
    ? `Lvl ${item.level ?? 1}`
    : '';

  const iconUrl = resolveAssetUrl(item.iconKey) ?? DEFAULT_ICON_URL;

  return (
    <div className={cls} onClick={() => !disabled && onClick?.(item)}>
      <div className="item-card__img-wrap">
        {iconUrl ? (
          <img className="item-card__img" src={iconUrl} alt={item.name} />
        ) : (
          <MissingIcon />
        )}
        <span className="item-card__qty">{formatCompact(item.quantity ?? 1)}</span>
      </div>
      <span className="item-card__name">{item.name}</span>
      <span className="item-card__sub">{sub}</span>
    </div>
  );
}
