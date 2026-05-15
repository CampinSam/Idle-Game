import { useState } from 'react';

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

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const displayValue = (key: string): string => {
    if (key in drafts) return drafts[key];
    const n = committed[key];
    return n !== undefined ? String(n) : '';
  };

  const handleChange = (key: string, raw: string) => {
    setDrafts(prev => ({ ...prev, [key]: raw }));
    if (raw === '' || raw === '-') return;
    const n = Number(raw);
    if (!isNaN(n) && raw.trim() !== '') {
      const next = { ...committed };
      if (n === 0) {
        delete next[key];
      } else {
        next[key] = n;
      }
      onChange(next);
    }
  };

  const handleBlur = (key: string) => {
    const raw = drafts[key];
    if (raw === undefined) return;
    const next = { ...committed };
    if (raw === '' || raw === '-') {
      delete next[key];
    } else {
      const n = Number(raw);
      if (!isNaN(n)) {
        if (n === 0) delete next[key];
        else next[key] = n;
      }
    }
    setDrafts(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
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
            {/* type="text" + inputMode="numeric" is intentional: type="number" causes
                browsers to emit "" for a bare "-" keystroke, breaking negative entry.
                Draft state handles the intermediate "-" so blur commits the final value. */}
            <input
              type="text"
              inputMode="numeric"
              value={displayValue(key)}
              placeholder="—"
              onChange={e => handleChange(key, e.target.value)}
              onBlur={() => handleBlur(key)}
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
                transition: 'border-color 0.15s, color 0.15s',
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
