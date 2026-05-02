import { resolveAssetUrl, DEFAULT_ICON_URL } from '../../../../utils/iconResolver';
import type { ItemDetailPanelProps } from '../../types';
import './LootboxItemDetailPanel.css';

function MissingIcon() {
  return (
    <svg className="lootbox-detail__missing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function rarityLabel(r?: string) {
  return (r || 'COMMON').replace(/_/g, ' ');
}

export default function LootboxItemDetailPanel({
  item,
  actions,
  className = '',
}: ItemDetailPanelProps) {
  const possibleRewards: string[] = Array.isArray(item.possibleRewards) ? item.possibleRewards : [];
  const iconUrl = resolveAssetUrl(item.iconKey) ?? DEFAULT_ICON_URL;

  return (
    <div className={`lootbox-detail item-detail-panel ${className}`.trim()}>
      <div className="lootbox-detail__icon-wrap">
        <div className="lootbox-detail__icon-glow" aria-hidden />
        {iconUrl ? (
          <img className="lootbox-detail__icon" src={iconUrl} alt={item.name} />
        ) : (
          <MissingIcon />
        )}
      </div>

      <div className="lootbox-detail__info">
        <span className={`lootbox-detail__rarity rarity-${item.rarity || 'COMMON'}`}>
          {rarityLabel(item.rarity)}
        </span>
        <div className="lootbox-detail__name">{item.name}</div>
        <div className="lootbox-detail__desc">
          {item.description || 'Open this lootbox to claim its contents.'}
        </div>
        <div className="lootbox-detail__meta-row">
          <span className="lootbox-detail__chip lootbox-detail__chip--type">LOOTBOX</span>
          {possibleRewards.length > 0 && (
            <span className="lootbox-detail__chip">{possibleRewards.length} possible rewards</span>
          )}
        </div>
        {possibleRewards.length > 0 && (
          <div className="lootbox-detail__rewards">
            {possibleRewards.slice(0, 4).map((r) => (
              <span key={r} className="lootbox-detail__reward-pill">{r}</span>
            ))}
          </div>
        )}
      </div>

      {actions && <div className="lootbox-detail__actions">{actions}</div>}
    </div>
  );
}
