import { useState, type CSSProperties } from 'react';
import type { RichSelection, ScopeType, OperatorType } from '@derp/shared';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  inputStyle,
  numberInputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';
import RichSelectionEditor from './RichSelectionEditor';

const PLAYER_EVENT_TYPES = [
  'mission_complete',
  'currency_earned',
  'item_collected',
  'location_claimed',
  'item_crafted',
  'building_built',
  'keeper_level_up',
  'entity_level_up',
  'gift_claimed',
  'lootbox_opened',
  'checkin_completed',
];

export interface Objective {
  eventType?: string;
  target?: number;
  description?: string;
  key?: string;
  selector?: RichSelection | null;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: Objective[]) => void;
}

function defaultObjective(): Objective {
  return { eventType: 'mission_complete', target: 1, description: '' };
}

const collapseToggleStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid #2a2a3e',
  borderRadius: 4,
  color: '#7c6aaa',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  padding: '2px 7px',
  marginTop: 6,
};

function ObjectiveEntry({
  entry, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  entry: Objective;
  onChange: (e: Objective) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const eventType = entry.eventType ?? '';
  const valueIsCustom = eventType !== '' && !PLAYER_EVENT_TYPES.includes(eventType);
  const [customMode, setCustomMode] = useState<boolean>(valueIsCustom);
  const showCustomInput = customMode || valueIsCustom;

  const hasSelector = entry.selector != null;
  const [selectorOpen, setSelectorOpen] = useState<boolean>(hasSelector);

  const handleSelectorToggle = () => {
    if (selectorOpen) {
      setSelectorOpen(false);
    } else {
      setSelectorOpen(true);
      if (!entry.selector) {
        onChange({ ...entry, selector: { op: 'AND', rules: [{ scope: 'event' as ScopeType, field: 'type', operator: 'eq' as OperatorType, value: eventType || '' }] } });
      }
    }
  };

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
          <span style={labelStyle}>eventType</span>
          <select
            value={showCustomInput ? '__custom__' : eventType}
            onChange={e => {
              const v = e.target.value;
              if (v === '__custom__') {
                setCustomMode(true);
              } else {
                setCustomMode(false);
                onChange({ ...entry, eventType: v });
              }
            }}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="">— select —</option>
            {PLAYER_EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="__custom__">custom…</option>
          </select>
          {showCustomInput && (
            <input
              type="text"
              value={entry.eventType ?? ''}
              onChange={e => onChange({ ...entry, eventType: e.target.value })}
              placeholder="custom event type"
              style={{ ...inputStyle, width: '100%', marginTop: 4 }}
            />
          )}
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>target</span>
          <input
            type="number"
            value={entry.target ?? ''}
            onChange={e => onChange({ ...entry, target: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
      <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 0 }}>
        <span style={labelStyle}>description</span>
        <input
          type="text"
          value={entry.description ?? ''}
          onChange={e => onChange({ ...entry, description: e.target.value })}
          placeholder="Player-facing label"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      <div>
        <button
          type="button"
          style={{ ...collapseToggleStyle, ...(hasSelector ? { color: '#a78bfa', borderColor: '#7c3aed55' } : {}) }}
          onClick={handleSelectorToggle}
          title="Build a selector rule to match this objective against specific event fields"
        >
          {selectorOpen ? '▾' : '▸'} selector {hasSelector ? '(active)' : '(optional)'}
        </button>
        {hasSelector && !selectorOpen && (
          <button
            type="button"
            style={{ ...collapseToggleStyle, marginLeft: 6, color: '#f87171', borderColor: '#7f1d1d55' }}
            onClick={() => { onChange({ ...entry, selector: null }); setSelectorOpen(false); }}
            title="Remove selector"
          >
            × clear
          </button>
        )}
      </div>

      {selectorOpen && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e1e3e' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
            Selector — build an <code style={{ color: '#a78bfa' }}>event.*</code> rule to filter which events count toward this objective.
            Example: <code style={{ color: '#a78bfa' }}>event.type eq "mission_complete"</code>.
            Leave empty to match all events of the chosen eventType above.
          </div>
          <RichSelectionEditor
            value={entry.selector ?? null}
            onChange={sel => onChange({ ...entry, selector: sel })}
          />
          <button
            type="button"
            style={{ ...collapseToggleStyle, marginTop: 6, color: '#f87171', borderColor: '#7f1d1d55' }}
            onClick={() => { onChange({ ...entry, selector: null }); setSelectorOpen(false); }}
          >
            × remove selector
          </button>
        </div>
      )}
    </div>
  );
}

export default function ObjectivesListEditor({ value, onChange }: ListProps) {
  const items: Objective[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: Objective) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const arr = items.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };
  const add = () => onChange([...items, defaultObjective()]);

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <ObjectiveEntry
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={addButtonStyle} onClick={add}>+ objective</button>
      </div>
    </div>
  );
}
