import type { ModalRevealOptions } from '@derp/shared';
import AssetImage from '../AssetImage';
import RevealWrapper, { getItemTag } from './RevealWrapper';

interface DeltaItem {
  assetKey?: string;
  name: string;
  qtyDelta: number;
}

interface InventoryDeltaBlockProps {
  items?: DeltaItem[];
  revealOptions?: ModalRevealOptions;
}

export default function InventoryDeltaBlock({ items = [], revealOptions }: InventoryDeltaBlockProps) {
  return (
    <div className="gm-inv-delta">
      {items.map((it, idx) => {
        const sign = it.qtyDelta >= 0 ? '+' : '';
        const cls = it.qtyDelta >= 0 ? 'gm-delta-positive' : 'gm-delta-negative';
        const resolvedTag = revealOptions
          ? (getItemTag(it, revealOptions.tagsFrom) ?? revealOptions.tags)
          : undefined;

        const row = (
          <div key={idx} className="gm-delta-row">
            {it.assetKey ? (
              <AssetImage asset={{ assetKey: it.assetKey }} style={{ width: 20, height: 20, borderRadius: 4 }} />
            ) : (
              <span className="gm-delta-dot" />
            )}
            <span className="gm-delta-name">{it.name}</span>
            <span className={`gm-delta-qty ${cls}`}>
              {sign}{it.qtyDelta}
            </span>
          </div>
        );

        if (revealOptions) {
          return (
            <RevealWrapper
              key={idx}
              cover={revealOptions.cover}
              coverImage={revealOptions.coverImage}
              tags={resolvedTag}
              soundMap={revealOptions.soundMap}
              fxMap={revealOptions.fxMap}
            >
              {row}
            </RevealWrapper>
          );
        }
        return row;
      })}
    </div>
  );
}
