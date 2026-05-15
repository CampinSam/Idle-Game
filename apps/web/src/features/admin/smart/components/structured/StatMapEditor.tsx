import { useState, useEffect, useRef } from 'react';

const STAT_ROWS: { key: string; color: string }[] = [
  { key: 'ATK', color: '#f87171' },
  { key: 'DEF', color: '#60a5fa' },
  { key: 'SPD', color: '#fbbf24' },
  { key: 'FOC', color: '#c084fc' },
  { key: 'LCK', color: '#4ade80' },
  { key: 'VIT', color: '#2dd4bf' },
];

const RND_COLOR = '#9ca3af';

interface Props {
  value: Record<string, number | number[]> | null | undefined;
  onChange: (v: Record<string, number | number[]>) => void;
}

/** Each RND row has a stable `id` (never reused) so React unmounts/remounts
 *  the correct DOM node when rows are removed or reordered. */
interface RndRow {
  id: number;
  value: number;
}

let nextRowId = 1;

function getRndEntries(value: Record<string, number | number[]> | null | undefined): number[] {
  const raw = value?.['RND'];
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return [...raw];
  return [raw as number];
}

function makeRows(values: number[]): RndRow[] {
  return values.map(v => ({ id: nextRowId++, value: v }));
}

/**
 * Writes RND entries back into a stat map copy.
 * Serialization shape is driven by total row count (not just non-zero count)
 * so that authoring two rows — even if one is still blank — round-trips as
 * an array and preserves the row structure the admin intended.
 * - No rows, or all entries zero → delete RND key (no game contribution)
 * - Exactly 1 row → plain number (backwards compat with existing definitions)
 * - 2+ rows → array of all values (zeros are skipped at resolve-time)
 */
function serializeRnd(map: Record<string, number | number[]>, rows: RndRow[]): void {
  const hasAnyNonZero = rows.some(r => r.value !== 0);
  if (!hasAnyNonZero) {
    delete map['RND'];
  } else if (rows.length === 1) {
    map['RND'] = rows[0].value;
  } else {
    map['RND'] = rows.map(r => r.value);
  }
}

export default function StatMapEditor({ value, onChange }: Props) {
  const committed: Record<string, number | number[]> = (value && typeof value === 'object') ? value : {};

  // Track RND rows in local state with stable IDs so:
  // 1. Blank rows persist while the user is typing (don't collapse to nothing
  //    just because the value is 0).
  // 2. Removing row 0 of [A, B] correctly unmounts A's input, not B's — React
  //    uses the `id` key to identify and unmount the right DOM node.
  const [rndRows, setRndRows] = useState<RndRow[]>(() => makeRows(getRndEntries(committed)));

  // Detect external changes (e.g. JSON paste in the parent editor) by
  // comparing the incoming RND value to what we last emitted. When they
  // differ, rebuild local rows from the incoming value.
  const lastEmittedRnd = useRef<number | number[] | undefined>(committed['RND']);
  useEffect(() => {
    const incoming = value?.['RND'];
    if (incoming !== lastEmittedRnd.current) {
      lastEmittedRnd.current = incoming;
      setRndRows(makeRows(getRndEntries(value)));
    }
  }, [value?.['RND']]);  // eslint-disable-line react-hooks/exhaustive-deps

  const commitStat = (key: string, rawValue: string) => {
    const n = Number(rawValue);
    const next = { ...committed };
    if (rawValue.trim() === '' || isNaN(n) || n === 0) {
      delete next[key];
    } else {
      next[key] = n;
    }
    onChange(next);
  };

  const emitRnd = (rows: RndRow[]) => {
    const next = { ...committed };
    serializeRnd(next, rows);
    lastEmittedRnd.current = next['RND'];
    onChange(next);
  };

  const commitRndRow = (id: number, rawValue: string) => {
    const n = Number(rawValue);
    const updated = rndRows.map(r => r.id === id ? { ...r, value: isNaN(n) ? 0 : n } : r);
    setRndRows(updated);
    emitRnd(updated);
  };

  const addRnd = () => {
    // Only update local state — don't emit until the user types a nonzero value.
    setRndRows(prev => [...prev, { id: nextRowId++, value: 0 }]);
  };

  const removeRnd = (id: number) => {
    const updated = rndRows.filter(r => r.id !== id);
    setRndRows(updated);
    emitRnd(updated);
  };

  return (
    <div style={{
      background: '#0f0f2e',
      border: '1px solid #2a2a4e',
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Visible stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 12px',
      }}>
        {STAT_ROWS.map(({ key, color }) => {
          const raw = committed[key];
          const hasValue = raw !== undefined;
          const numVal = typeof raw === 'number' ? raw : undefined;
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
                  "-" character while typing negative numbers. key forces re-mount
                  when the committed value changes from outside (e.g. raw-JSON paste). */}
              <input
                key={`${key}-${String(numVal ?? '')}`}
                type="number"
                step={1}
                defaultValue={hasValue ? numVal : ''}
                placeholder="—"
                onChange={e => {
                  const n = e.target.valueAsNumber;
                  if (!isNaN(n)) commitStat(key, String(n));
                }}
                onBlur={e => commitStat(key, e.target.value)}
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
            </div>
          );
        })}
      </div>

      {/* RND section — supports multiple independent random picks */}
      <div style={{ borderTop: '1px solid #1e1e3a', paddingTop: 10 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: rndRows.length > 0 ? 8 : 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: RND_COLOR, letterSpacing: '0.05em', flexShrink: 0 }}>
            RND
          </span>
          <span style={{ fontSize: 9, color: '#555', flex: 1 }}>each picks a random stat independently</span>
          <button
            type="button"
            onClick={addRnd}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              background: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: 4,
              color: RND_COLOR,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            + Add
          </button>
        </div>

        {rndRows.map((row, i) => (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 34, fontSize: 10, color: '#666', textAlign: 'right', flexShrink: 0 }}>
              #{i + 1}
            </span>
            {/* Keyed on stable row.id + initial value so:
                - Removing row 0 of [A, B] unmounts A's input (not B's).
                - External value changes (JSON paste) cause a re-mount via the
                  updated lastEmittedRnd / new RndRow id. */}
            <input
              key={`rnd-${row.id}-${row.value}`}
              type="number"
              step={1}
              defaultValue={row.value !== 0 ? row.value : ''}
              placeholder="—"
              onChange={e => {
                const n = e.target.valueAsNumber;
                if (!isNaN(n)) commitRndRow(row.id, String(n));
              }}
              onBlur={e => commitRndRow(row.id, e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                background: '#1a1a2e',
                border: `1px solid ${row.value !== 0 ? RND_COLOR + '66' : '#333'}`,
                borderRadius: 5,
                color: row.value !== 0 ? RND_COLOR : '#666',
                fontSize: 13,
                fontWeight: row.value !== 0 ? 700 : 400,
                boxSizing: 'border-box',
                minWidth: 0,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => removeRnd(row.id)}
              style={{
                fontSize: 11,
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#555',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
