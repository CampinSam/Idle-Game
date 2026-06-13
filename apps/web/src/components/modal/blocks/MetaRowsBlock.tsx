import type { ModalRevealOptions } from '@derp/shared';
import ItemQty from '../../ItemQty';
import RevealWrapper, { getItemTag } from './RevealWrapper';

interface MetaRowValueItem {
  assetKey: string;
  amount: number;
}

interface MetaRow {
  label: string;
  value: string;
  valueItems?: MetaRowValueItem[];
}

interface MetaRowsBlockProps {
  rows: MetaRow[];
  revealOptions?: ModalRevealOptions;
}

export default function MetaRowsBlock({ rows, revealOptions }: MetaRowsBlockProps) {
  return (
    <div className="gm-meta-rows">
      {rows.map((r, i) => {
        const resolvedTag = revealOptions
          ? (getItemTag(r, revealOptions.tagsFrom) ?? revealOptions.tags)
          : undefined;

        const rowContent = (
          <div key={i} className="gm-meta-row">
            <span className="gm-meta-label">{r.label}</span>
            {r.valueItems && r.valueItems.length > 0 ? (
              <span className="gm-meta-value gm-meta-value--items">
                {r.valueItems.map((vi, j) => (
                  <ItemQty key={j} src={vi.assetKey} amount={vi.amount} size={15} />
                ))}
              </span>
            ) : (
              <span className="gm-meta-value">{r.value}</span>
            )}
          </div>
        );

        if (revealOptions) {
          return (
            <RevealWrapper
              key={i}
              cover={revealOptions.cover}
              coverImage={revealOptions.coverImage}
              tags={resolvedTag}
              soundMap={revealOptions.soundMap}
              fxMap={revealOptions.fxMap}
            >
              {rowContent}
            </RevealWrapper>
          );
        }
        return rowContent;
      })}
    </div>
  );
}
