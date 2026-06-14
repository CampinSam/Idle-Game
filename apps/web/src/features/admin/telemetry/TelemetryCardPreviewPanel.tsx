import { useState, useEffect, useRef } from 'react';
import type { ScreenSectionDefinition } from '@derp/shared';
import { TelemetryCardComp } from '../../screens/componentRegistry';

const DISPLAY_TYPES = [
  { value: 'number', label: 'Number — single large count' },
  { value: 'progress_bar', label: 'Progress Bar — count vs target' },
  { value: 'comparison', label: 'Comparison — two factions vs bar' },
  { value: 'ranking', label: 'Ranking — leaderboard (default)' },
  { value: 'bar_chart', label: 'Bar Chart — horizontal bars per entry' },
  { value: 'medal_podium', label: 'Medal Podium — top-3 trophy display' },
];

interface EntryConfig {
  key: string;
  label: string;
  icon: string;
  color: string;
}

interface PreviewState {
  displayType: string;
  title: string;
  metricKey: string;
  target: string;
  entries: EntryConfig[];
}

interface SubEvent {
  key: string;
}

interface Props {
  record: Record<string, any>;
}

function buildMockSection(defId: string, state: PreviewState): ScreenSectionDefinition {
  const entries = state.entries.filter((e) => e.key.trim());
  return {
    id: '__preview__',
    component: 'TelemetryCard' as any,
    priority: 0,
    props: {
      telemetryDefId: defId,
      displayType: state.displayType,
      ...(state.title ? { title: state.title } : {}),
      ...(state.metricKey ? { metricKey: state.metricKey } : {}),
      ...(state.target ? { target: Number(state.target) } : {}),
      ...(entries.length > 0 ? { entries } : {}),
      pollIntervalSeconds: 30,
    },
  };
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: '#888',
  marginBottom: 4,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: '#111128',
  border: '1px solid #2a2a4e',
  borderRadius: 6,
  color: '#e0e0ff',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: 'pointer',
};

function EntryRow({
  entry,
  subEventKeys,
  onChange,
  onRemove,
}: {
  entry: EntryConfig;
  subEventKeys: string[];
  onChange: (updated: EntryConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 60px 80px 28px',
      gap: 6,
      alignItems: 'end',
      padding: '8px 10px',
      background: '#0d0d20',
      border: '1px solid #1a1a3e',
      borderRadius: 6,
      marginBottom: 6,
    }}>
      <div>
        <label style={LABEL_STYLE}>Key</label>
        <select
          value={entry.key}
          onChange={(e) => onChange({ ...entry, key: e.target.value })}
          style={SELECT_STYLE}
        >
          <option value="">— pick —</option>
          {subEventKeys.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={LABEL_STYLE}>Label</label>
        <input
          type="text"
          value={entry.label}
          onChange={(e) => onChange({ ...entry, label: e.target.value })}
          placeholder="Display label"
          style={INPUT_STYLE}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Icon</label>
        <input
          type="text"
          value={entry.icon}
          onChange={(e) => onChange({ ...entry, icon: e.target.value })}
          placeholder="🏆"
          style={INPUT_STYLE}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Color</label>
        <input
          type="text"
          value={entry.color}
          onChange={(e) => onChange({ ...entry, color: e.target.value })}
          placeholder="#8b5cf6"
          style={INPUT_STYLE}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove entry"
        style={{
          background: 'transparent', border: '1px solid #3a1a1a',
          borderRadius: 4, color: '#f87171', cursor: 'pointer',
          fontSize: 14, width: 28, height: 28, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function TelemetryCardPreviewPanel({ record }: Props) {
  const defId: string = record?.id ?? '';
  const subEvents: SubEvent[] = Array.isArray(record?.subEvents) ? record.subEvents : [];
  const subEventKeys = subEvents.map((se) => se.key).filter(Boolean);

  const [state, setState] = useState<PreviewState>({
    displayType: 'ranking',
    title: '',
    metricKey: '',
    target: '',
    entries: subEventKeys.slice(0, 4).map((k) => ({ key: k, label: k, icon: '', color: '' })),
  });

  const prevSubEventKeysRef = useRef<string[]>(subEventKeys);

  useEffect(() => {
    const prev = prevSubEventKeysRef.current;
    const added = subEventKeys.filter((k) => !prev.includes(k));
    const removed = new Set(prev.filter((k) => !subEventKeys.includes(k)));

    if (added.length === 0 && removed.size === 0) return;

    prevSubEventKeysRef.current = subEventKeys;

    setState((s) => {
      const kept = s.entries.filter((e) => !removed.has(e.key));
      const existingKeys = new Set(kept.map((e) => e.key));
      const appended = added
        .filter((k) => !existingKeys.has(k))
        .map((k) => ({ key: k, label: k, icon: '', color: '' }));
      return { ...s, entries: [...kept, ...appended] };
    });
  }, [subEventKeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = <K extends keyof PreviewState>(key: K, value: PreviewState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const updateEntry = (i: number, updated: EntryConfig) =>
    setState((s) => {
      const entries = [...s.entries];
      entries[i] = updated;
      return { ...s, entries };
    });

  const removeEntry = (i: number) =>
    setState((s) => ({ ...s, entries: s.entries.filter((_, idx) => idx !== i) }));

  const addEntry = () =>
    setState((s) => ({
      ...s,
      entries: [...s.entries, { key: '', label: '', icon: '', color: '' }],
    }));

  const showMetricKey = state.displayType === 'number' || state.displayType === 'progress_bar';
  const showTarget = state.displayType === 'progress_bar';

  const mockSection = buildMockSection(defId, state);

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#666',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    paddingBottom: 6,
    borderBottom: '1px solid #1a1a3e',
    marginBottom: 8,
  };

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '16px 20px',
      display: 'flex',
      gap: 20,
      fontFamily: "'ui-monospace','SFMono-Regular','Fira Code',monospace",
    }}>
      {/* ── Left: config form ── */}
      <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={sectionHeaderStyle}>Display Config</div>

        <div>
          <label style={LABEL_STYLE}>Display Type</label>
          <select
            value={state.displayType}
            onChange={(e) => setField('displayType', e.target.value)}
            style={SELECT_STYLE}
          >
            {DISPLAY_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>{dt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={LABEL_STYLE}>Card Title (optional — defaults to def name)</label>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder={record?.name ?? 'Leave blank to use def name'}
            style={INPUT_STYLE}
          />
        </div>

        {showMetricKey && (
          <div>
            <label style={LABEL_STYLE}>Metric Key (the counter to display)</label>
            <select
              value={state.metricKey}
              onChange={(e) => setField('metricKey', e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="">— first counter (default) —</option>
              {subEventKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        )}

        {showTarget && (
          <div>
            <label style={LABEL_STYLE}>Target Value (for progress bar)</label>
            <input
              type="number"
              min="0"
              value={state.target}
              onChange={(e) => setField('target', e.target.value)}
              placeholder="e.g. 100000"
              style={INPUT_STYLE}
            />
          </div>
        )}

        <div>
          <div style={{ ...sectionHeaderStyle, marginTop: 4 }}>
            Entries (key → label / icon / color)
          </div>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>
            {state.displayType === 'comparison'
              ? 'First two entries are the left and right sides of the bar.'
              : state.displayType === 'ranking'
              ? 'Each entry maps a sub-event key to a display label and style.'
              : state.displayType === 'bar_chart'
              ? 'Each entry becomes one horizontal bar (key → label / icon / color).'
              : state.displayType === 'medal_podium'
              ? 'First three entries map to gold, silver, and bronze podium slots.'
              : 'Optional: override the label/icon/color for the selected metric.'}
          </div>

          {state.entries.map((entry, i) => (
            <EntryRow
              key={i}
              entry={entry}
              subEventKeys={subEventKeys}
              onChange={(updated) => updateEntry(i, updated)}
              onRemove={() => removeEntry(i)}
            />
          ))}

          <button
            type="button"
            onClick={addEntry}
            style={{
              width: '100%', padding: '6px 10px',
              background: 'transparent', border: '1px dashed #2a2a5e',
              borderRadius: 6, color: '#a78bfa', cursor: 'pointer', fontSize: 12,
            }}
          >
            + Add Entry
          </button>
        </div>

        <div style={{ marginTop: 4 }}>
          <div style={sectionHeaderStyle}>Generated Props JSON</div>
          <pre style={{
            fontSize: 10, color: '#4a4a7a', background: '#060612',
            border: '1px solid #1a1a3e', borderRadius: 6,
            padding: '8px 10px', overflowX: 'auto', margin: 0, lineHeight: 1.5,
          }}>
            {JSON.stringify(mockSection.props, null, 2)}
          </pre>
        </div>
      </div>

      {/* ── Right: phone-sized preview frame with the real TelemetryCardComp ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Live Preview</span>
          <span style={{ fontSize: 10, color: '#3a3a5e', fontWeight: 400, letterSpacing: 0 }}>
            Counts auto-refresh every 30 s via the public telemetry endpoint
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '8px 0' }}>
          <div style={{
            width: 320,
            background: '#0a0a1a',
            border: '1px solid #2a2a4e',
            borderRadius: 20,
            padding: '16px 12px',
            boxShadow: '0 0 0 6px #060610, 0 0 40px rgba(139,92,246,0.08)',
          }}>
            <div style={{ width: 60, height: 5, background: '#1a1a3e', borderRadius: 999, margin: '0 auto 16px' }} />

            {defId ? (
              <TelemetryCardComp
                key={`${defId}-${state.displayType}`}
                section={mockSection}
                onAction={() => {}}
              />
            ) : (
              <div style={{
                padding: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#555', fontSize: 12, textAlign: 'center',
              }}>
                Save the definition first to preview live counts.
              </div>
            )}

            <div style={{ width: 40, height: 5, background: '#1a1a3e', borderRadius: 999, margin: '16px auto 0' }} />
          </div>
        </div>

        {!defId && (
          <div style={{
            fontSize: 11, color: '#4a4a7a', textAlign: 'center',
            padding: '8px 16px', background: '#080814',
            border: '1px solid #1a1a3e', borderRadius: 6,
          }}>
            This is a new unsaved record. Save it first so the preview can load live counter data.
          </div>
        )}
      </div>
    </div>
  );
}
