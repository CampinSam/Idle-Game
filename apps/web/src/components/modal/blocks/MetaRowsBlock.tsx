export default function MetaRowsBlock({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="gm-meta-rows">
      {rows.map((r, i) => (
        <div key={i} className="gm-meta-row">
          <span className="gm-meta-label">{r.label}</span>
          <span className="gm-meta-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
