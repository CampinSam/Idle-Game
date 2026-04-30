import type { ItemDetailPanelProps } from '../../types';
import './DefaultItemDetailPanel.css';

function MissingIcon() {
  return (
    <svg className="item-detail-panel__missing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function rarityLabel(r?: string) {
  return (r || 'COMMON').replace(/_/g, ' ');
}

export default function DefaultItemDetailPanel({ item, actions, className = '' }: ItemDetailPanelProps) {
  return (
    <div className={`item-detail-panel ${className}`.trim()}>
      <div className="item-detail-panel__img-wrap">
        {item.iconUrl ? (
          <img className="item-detail-panel__img" src={item.iconUrl} alt={item.name} />
        ) : (
          <MissingIcon />
        )}
      </div>
      <div className="item-detail-panel__info">
        <span className={`item-detail-panel__rarity rarity-${item.rarity || 'COMMON'}`}>
          {rarityLabel(item.rarity)}
        </span>
        <div className="item-detail-panel__name">{item.name}</div>
        <div className="item-detail-panel__desc">
          {item.description || 'A mysterious item with unknown properties.'}
        </div>
        <div className="item-detail-panel__tags">
          {item.type && (
            <span className="item-detail-panel__tag item-detail-panel__tag--type">{item.type}</span>
          )}
          {item.category && item.category !== 'MISC' && (
            <span className="item-detail-panel__tag item-detail-panel__tag--category">{item.category}</span>
          )}
          {(item.tags || []).map((t: string) => (
            <span key={t} className="item-detail-panel__tag">{t}</span>
          ))}
        </div>
      </div>
      {actions && (
        <div className="item-detail-panel__actions">{actions}</div>
      )}
    </div>
  );
}
