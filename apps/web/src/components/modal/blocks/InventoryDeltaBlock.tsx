import AssetImage from '../AssetImage';

interface DeltaItem {
  assetKey?: string;
  name: string;
  qtyDelta: number;
}

export default function InventoryDeltaBlock({ items }: { items: DeltaItem[] }) {
  return (
    <div className="gm-inv-delta">
      {items.map((it, idx) => {
        const sign = it.qtyDelta >= 0 ? '+' : '';
        const cls = it.qtyDelta >= 0 ? 'gm-delta-positive' : 'gm-delta-negative';

        return (
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
      })}
    </div>
  );
}
