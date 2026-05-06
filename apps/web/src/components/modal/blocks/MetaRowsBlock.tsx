import ItemQty from '../../ItemQty';

interface MetaRowValueItem {
  assetKey: string;
  amount: number;
}

interface MetaRow {
  label: string;
  value: string;
  valueItems?: MetaRowValueItem[];
}

export default function MetaRowsBlock({ rows }: { rows: MetaRow[] }) {
  return (
    <div className="gm-meta-rows">
      {rows.map((r, i) => (
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
      ))}
    </div>
  );
}
