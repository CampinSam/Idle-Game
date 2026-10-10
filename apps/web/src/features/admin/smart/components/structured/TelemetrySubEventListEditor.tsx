import { useState } from 'react';
import type { RichSelection } from '@derp/shared';
import { TELEMETRY_EVENT_TYPES } from '@derp/shared';
import {
  containerStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  addButtonStyle,
  dangerIconButtonStyle,
  fieldGroupStyle,
} from './editorStyles';
import RichSelectionEditor from './RichSelectionEditor';

export interface TelemetrySubEventSpec {
  key: string;
  eventType: string;
  filter: RichSelection | null;
}

interface Props {
  value: TelemetrySubEventSpec[];
  onChange: (v: TelemetrySubEventSpec[]) => void;
}

function defaultSubEvent(): TelemetrySubEventSpec {
  return { key: '', eventType: 'MISSION_START', filter: null };
}

export function TelemetrySubEventListEditor({ value, onChange }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const items = Array.isArray(value) ? value : [];

  const update = (idx: number, patch: Partial<TelemetrySubEventSpec>) => {
    onChange(items.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  };

  const add = () => {
    onChange([...items, defaultSubEvent()]);
    setExpandedIdx(items.length);
  };

  return (
    <div style={{ ...containerStyle, gap: 8, padding: 8 }}>
      {items.length === 0 && (
        <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
          No sub-event counters yet. Add one to start tracking.
        </div>
      )}
      {items.map((item, idx) => {
        const isExpanded = expandedIdx === idx;
        const hasKey = item.key.trim().length > 0;
        return (
          <div key={idx} style={{
            border: '1px solid #1e2a3a',
            borderRadius: 6,
            background: '#060d1a',
          }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <span style={{ color: '#6366f1', fontSize: 11, fontWeight: 700, minWidth: 16 }}>
                {isExpanded ? '▾' : '▸'}
              </span>
              <span style={{
                fontSize: 11,
                fontFamily: 'monospace',
                background: '#1a1a3a',
                padding: '2px 6px',
                borderRadius: 3,
                color: hasKey ? '#c0c8ff' : '#555',
              }}>
                {hasKey ? item.key : '(unnamed)'}
              </span>
              <span style={{
                fontSize: 10,
                background: '#1a2e1a',
                color: '#6adc6a',
                padding: '1px 6px',
                borderRadius: 3,
              }}>
                {item.eventType}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(idx); }}
                style={dangerIconButtonStyle}
                title="Remove"
              >×</button>
            </div>

            {isExpanded && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid #1e2a3a', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 140 }}>
                    <span style={{ ...labelStyle, color: !hasKey ? '#f87171' : undefined }}>
                      key {!hasKey ? '(required)' : ''}
                    </span>
                    <input
                      type="text"
                      value={item.key}
                      onChange={e => update(idx, { key: e.target.value })}
                      placeholder="e.g. faction_a_starts"
                      style={{ ...inputStyle, width: '100%', ...((!hasKey) ? { borderColor: '#f87171' } : {}) }}
                    />
                    <span style={{ fontSize: 10, color: '#666' }}>Unique key within this def</span>
                  </div>
                  <div style={{ ...fieldGroupStyle, minWidth: 160 }}>
                    <span style={labelStyle}>event type</span>
                    <select
                      value={item.eventType}
                      onChange={e => update(idx, { eventType: e.target.value })}
                      style={{ ...selectStyle, width: '100%' }}
                    >
                      {TELEMETRY_EVENT_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>filter (RichSelection — blank = match all)</span>
                  <RichSelectionEditor
                    value={item.filter}
                    onChange={filter => update(idx, { filter })}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} style={{ ...addButtonStyle, marginTop: 2 }}>
        + Add Sub-Event Counter
      </button>
    </div>
  );
}
