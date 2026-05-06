import type { RewardItem } from '@derp/shared';
import ItemQty from '../../ItemQty';

const RARITY_CLASSES: Record<string, string> = {
  COMMON:     'gm-rarity-common',
  UNCOMMON:   'gm-rarity-uncommon',
  SCARCE:     'gm-rarity-scarce',
  ADVANCED:   'gm-rarity-advanced',
  RARE:       'gm-rarity-rare',
  ULTRA_RARE: 'gm-rarity-ultra_rare',
  EPIC:       'gm-rarity-epic',
  MYTHIC:     'gm-rarity-mythic',
  LEGENDARY:  'gm-rarity-legendary',
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
            <div className="gm-reward-icon-wrap">
              {it.assetKey ? (
                <ItemQty
                  src={it.assetKey}
                  amount={it.qty ?? 1}
                  size={32}
                  variant="badge"
                />
              ) : (
                <span className="gm-reward-icon-placeholder">✨</span>
              )}
            </div>
            <div className="gm-reward-info">
              <div className="gm-reward-name">{it.name}</div>
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
