const STAT_ROWS: { key: string; label: string; color: string; hint?: string }[] = [
  { key: 'ATK', label: 'ATK', color: '#f87171' },
  { key: 'DEF', label: 'DEF', color: '#60a5fa' },
  { key: 'SPD', label: 'SPD', color: '#fbbf24' },
  { key: 'FOC', label: 'FOC', color: '#c084fc' },
  { key: 'LCK', label: 'LCK', color: '#4ade80' },
  { key: 'VIT', label: 'VIT', color: '#2dd4bf' },
  { key: 'RND', label: 'RND', color: '#9ca3af', hint: 'resolves randomly' },
];

interface Props {
  value: Record<string, number> | null | undefined;
  onChange: (v: Record<string, number>) => void;
}

export default function StatMapEditor({ value, onChange }: Props) {
  const current: Record<string, number> = (value && typeof value === 'object') ? value : {};

  const handleChange = (key: string, raw: string) => {
    const next = { ...current };
    if (raw === '' || raw === '-') {
      delete next[key];
    } else {
      const n = Number(raw);
      if (!isNaN(n)) {
        if (n === 0) {
          delete next[key];
        } else {
          next[key] = n;
        }
      }
    }
    onChange(next);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px 12px',
      background: '#0f0f2e',
      border: '1px solid #2a2a4e',
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      {STAT_ROWS.map(({ key, label, color, hint }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 34,
            fontSize: 11,
            fontWeight: 800,
            color,
            letterSpacing: '0.05em',
            flexShrink: 0,
            textAlign: 'right',
          }}>
            {label}
          </span>
          <input
            type="number"
            step={1}
            value={current[key] ?? ''}
            placeholder="—"
            onChange={e => handleChange(key, e.target.value)}
            style={{
              flex: 1,
              padding: '4px 8px',
              background: '#1a1a2e',
              border: `1px solid ${current[key] !== undefined ? color + '66' : '#333'}`,
              borderRadius: 5,
              color: current[key] !== undefined ? color : '#666',
              fontSize: 13,
              fontWeight: current[key] !== undefined ? 700 : 400,
              boxSizing: 'border-box',
              minWidth: 0,
              transition: 'border-color 0.15s, color 0.15s',
              outline: 'none',
            }}
          />
          {hint && (
            <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}
