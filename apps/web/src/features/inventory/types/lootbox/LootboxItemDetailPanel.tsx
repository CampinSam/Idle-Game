import { resolveAssetUrl, DEFAULT_ICON_URL } from '../../../../utils/iconResolver';
import type { ItemDetailPanelProps } from '../../types';

function MissingIcon() {
  return (
    <svg
      className="relative w-1/2 h-1/2 opacity-40 text-[color:var(--text-secondary)] z-[1]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function rarityLabel(r?: string) {
  return (r || 'COMMON').replace(/_/g, ' ');
}

const RARITY_COLOR: Record<string, string> = {
  COMMON:     'text-[#8a8a9a]',
  UNCOMMON:   'text-[#4dcb6a]',
  SCARCE:     'text-[#4db0da]',
  ADVANCED:   'text-[#8a7aee]',
  RARE:       'text-[#a98aff]',
  ULTRA_RARE: 'text-[#e060ff]',
  EPIC:       'text-[#ff6090]',
  MYTHIC:     'text-[#ffc040]',
  LEGENDARY:  'text-[#ffe040]',
};

export default function LootboxItemDetailPanel({
  item,
  actions,
  className = '',
}: ItemDetailPanelProps) {
  const possibleRewards: string[] = Array.isArray(item.possibleRewards) ? item.possibleRewards : [];
  const iconUrl = resolveAssetUrl(item.iconKey) ?? DEFAULT_ICON_URL;
  const rarity = item.rarity || 'COMMON';

  return (
    <div
      className={[
        'item-detail-panel',
        '[background:linear-gradient(180deg,rgba(20,12,38,0.97),rgba(8,5,20,0.97))] border-t border-[rgba(245,158,11,0.35)] p-3.5 flex gap-3.5 items-start [animation:detail-enter_0.28s_ease-out_both]',
        'motion-reduce:![animation:none]',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="relative w-[88px] h-[88px] shrink-0 rounded-xl flex items-center justify-center bg-[rgba(0,0,0,0.35)] border-2 border-[rgba(245,158,11,0.55)]">
        <div
          className="absolute -inset-1 rounded-[14px] [background:radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.45),transparent_70%)] [animation:lootbox-detail-pulse_2.4s_ease-in-out_infinite] pointer-events-none motion-reduce:![animation:none] motion-reduce:opacity-65"
          aria-hidden
        />
        {iconUrl ? (
          <img
            className="relative w-[70%] h-[70%] object-contain z-[1]"
            src={iconUrl}
            alt={item.name}
          />
        ) : (
          <MissingIcon />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span
          className={[
            'text-[9px] font-bold uppercase tracking-[0.5px] px-1.5 py-px rounded inline-block mb-1',
            RARITY_COLOR[rarity] ?? 'text-[#8a8a9a]',
          ].join(' ')}
        >
          {rarityLabel(rarity)}
        </span>
        <div className="text-[16px] font-extrabold text-[#fde68a] mb-1 [text-shadow:0_1px_4px_rgba(245,158,11,0.35)]">
          {item.name}
        </div>
        <div className="text-[12px] text-[color:var(--text-secondary)] leading-[1.4] mb-2">
          {item.description || 'Open this lootbox to claim its contents.'}
        </div>
        <div className="flex flex-wrap gap-1 mb-1.5">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-[0.5px] bg-[rgba(245,158,11,0.18)] text-[#fbbf24] border border-[rgba(245,158,11,0.5)]">
            LOOTBOX
          </span>
          {possibleRewards.length > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-[0.5px] bg-[color:var(--bg-secondary)] text-[color:var(--text-secondary)] border border-[color:var(--border)]">
              {possibleRewards.length} possible rewards
            </span>
          )}
        </div>
        {possibleRewards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {possibleRewards.slice(0, 4).map((r) => (
              <span
                key={r}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[rgba(139,92,246,0.18)] text-[#c4b5fd] border border-[rgba(139,92,246,0.4)]"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {actions && (
        <div className="shrink-0 flex flex-col gap-1.5">{actions}</div>
      )}
    </div>
  );
}
