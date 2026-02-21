import type { RewardItem } from '@derp/shared';
import AssetImage from '../AssetImage';

const RARITY_CLASSES: Record<string, string> = {
  COMMON: 'gm-rarity-common',
  UNCOMMON: 'gm-rarity-uncommon',
  RARE: 'gm-rarity-rare',
  EPIC: 'gm-rarity-epic',
  LEGENDARY: 'gm-rarity-legendary',
};

interface RewardsListBlockProps {
  items: RewardItem[];
  title?: string;
  compact?: boolean;
}

export default function RewardsListBlock({ items, title, compact }: RewardsListBlockProps) {
  const display = compact ? items.slice(0, 5) : items;

  return (
    <div className="gm-rewards-section">
      {title && <div className="gm-section-title">{title}</div>}
      <div className="gm-rewards-grid">
        {display.map((it, idx) => (
          <div
            key={idx}
            className={`gm-reward-card ${RARITY_CLASSES[it.rarity?.toUpperCase() || ''] || ''}`}
          >
            {it.assetKey ? (
              <div className="gm-reward-icon-wrap">
                <AssetImage asset={{ assetKey: it.assetKey }} style={{ width: 32, height: 32, borderRadius: 6 }} />
              </div>
            ) : (
              <div className="gm-reward-icon-placeholder">✨</div>
            )}
            <div className="gm-reward-info">
              <div className="gm-reward-name">
                {it.name}
                {typeof it.qty === 'number' && it.qty > 0 ? ` ×${it.qty}` : ''}
              </div>
              {it.note && <div className="gm-reward-note">{it.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {compact && items.length > display.length && (
        <div className="gm-rewards-more">+{items.length - display.length} more</div>
      )}
    </div>
  );
}
