import { resolveAssetUrl, DEFAULT_ICON_URL } from '../../../../utils/iconResolver';
import type { ItemDetailPanelProps } from '../../types';

const RARITY_COLORS: Record<string, string> = {
  COMMON:    '#8a8a9a',
  UNCOMMON:  '#4dcb6a',
  SCARCE:    '#4db0da',
  ADVANCED:  '#8a7aee',
  RARE:      '#a98aff',
  ULTRA_RARE:'#e060ff',
  EPIC:      '#ff6090',
  MYTHIC:    '#ffc040',
  LEGENDARY: '#ffe040',
};

function rarityColor(r?: string) {
  return RARITY_COLORS[(r || 'COMMON').toUpperCase()] ?? RARITY_COLORS.COMMON;
}

function rarityLabel(r?: string) {
  return (r || 'COMMON').replace(/_/g, ' ');
}

function MissingIcon() {
  return (
    <svg
      className="w-1/2 h-1/2 opacity-[0.35]"
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

export default function DefaultItemDetailPanel({ item, actions, className = '' }: ItemDetailPanelProps) {
  const iconUrl = resolveAssetUrl(item.iconKey) ?? DEFAULT_ICON_URL;

  return (
    <div
      className={[
        'bg-[rgba(10,8,30,0.95)] border-t border-[rgba(139,92,246,0.2)]',
        'p-[14px] flex gap-[14px] items-start',
        'motion-safe:animate-[detail-enter_0.28s_ease-out_both]',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="w-[72px] h-[72px] flex-shrink-0 rounded-[10px] flex items-center justify-center overflow-hidden bg-black/25 border-2 border-border">
        {iconUrl ? (
          <img className="w-[60%] h-[60%] object-contain" src={iconUrl} alt={item.name} />
        ) : (
          <MissingIcon />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.5px] px-[6px] py-[1px] rounded-[4px] inline-block mb-1"
          style={{ color: rarityColor(item.rarity) }}
        >
          {rarityLabel(item.rarity)}
        </span>
        <div className="text-base font-bold text-text-primary mb-1">{item.name}</div>
        <div className="text-[12px] text-text-secondary leading-[1.4] mb-2 line-clamp-2">
          {item.description || 'A mysterious item with unknown properties.'}
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {item.type && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-[0.5px] bg-[rgba(58,123,213,0.2)] text-derp-blue border border-[rgba(58,123,213,0.4)]">
              {item.type}
            </span>
          )}
          {item.category && item.category !== 'MISC' && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-[0.5px] bg-[rgba(139,92,246,0.2)] text-derp-purple border border-[rgba(139,92,246,0.4)]">
              {item.category}
            </span>
          )}
          {(item.tags || []).map((t: string) => (
            <span
              key={t}
              className="text-[9px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-[0.5px] bg-bg-secondary text-text-secondary border border-border"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {actions && (
        <div className="flex-shrink-0 flex flex-col gap-[6px]">{actions}</div>
      )}
    </div>
  );
}
