const STAT_ROWS: { key: string; color: string; hint?: string }[] = [
  { key: 'ATK', color: '#f87171' },
  { key: 'DEF', color: '#60a5fa' },
  { key: 'SPD', color: '#fbbf24' },
  { key: 'FOC', color: '#c084fc' },
  { key: 'LCK', color: '#4ade80' },
  { key: 'VIT', color: '#2dd4bf' },
  { key: 'RND', color: '#9ca3af', hint: 'resolves randomly' },
];

interface Props {
  value: Record<string, number> | null | undefined;
  onChange: (v: Record<string, number>) => void;
}

export default function StatMapEditor({ value, onChange }: Props) {
  const committed: Record<string, number> = (value && typeof value === 'object') ? value : {};

  const commit = (key: string, rawValue: string) => {
    const n = Number(rawValue);
    const next = { ...committed };
    if (rawValue.trim() === '' || isNaN(n) || n === 0) {
      delete next[key];
    } else {
      next[key] = n;
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
      {STAT_ROWS.map(({ key, color, hint }) => {
        const hasValue = committed[key] !== undefined;
        return (
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
              {key}
            </span>
            {/* Uncontrolled input so React doesn't clear the browser's intermediate
                "-" character while typing negative numbers (Chrome normalises
                type="number" value to "" for bare "-", which would wipe the draft
                in a controlled input on re-render). key forces a re-mount when the
                committed value changes from outside (e.g. raw-JSON paste). */}
            <input
              key={`${key}-${String(committed[key] ?? '')}`}
              type="number"
              step={1}
              defaultValue={hasValue ? committed[key] : ''}
              placeholder="—"
              onChange={e => {
                const n = e.target.valueAsNumber;
                if (!isNaN(n)) commit(key, String(n));
              }}
              onBlur={e => commit(key, e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                background: '#1a1a2e',
                border: `1px solid ${hasValue ? color + '66' : '#333'}`,
                borderRadius: 5,
                color: hasValue ? color : '#666',
                fontSize: 13,
                fontWeight: hasValue ? 700 : 400,
                boxSizing: 'border-box',
                minWidth: 0,
                outline: 'none',
              }}
            />
            {hint && (
              <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{hint}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
