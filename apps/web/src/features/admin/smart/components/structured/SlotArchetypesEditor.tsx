import { useState } from 'react';
import {
  containerStyle, entryCardStyle, inputStyle, addButtonStyle,
  dangerIconButtonStyle, labelStyle, fieldRowStyle,
} from './editorStyles';

interface Props {
  value: Record<string, string[]> | null | undefined;
  onChange: (v: Record<string, string[]>) => void;
}

export default function SlotArchetypesEditor({ value, onChange }: Props) {
  const current: Record<string, string[]> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const [newSlot, setNewSlot] = useState('');

  const slots = Object.keys(current);

  const setSlot = (slot: string, arch: string[]) => {
    onChange({ ...current, [slot]: arch });
  };
  const removeSlot = (slot: string) => {
    const next = { ...current };
    delete next[slot];
    onChange(next);
  };
  const addSlot = () => {
    const t = newSlot.trim();
    if (!t || current[t] !== undefined) return;
    onChange({ ...current, [t]: [] });
    setNewSlot('');
  };

  return (
    <div style={containerStyle}>
      {slots.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '6px 0' }}>
          No slots — add one below
        </div>
      )}
      {slots.map(slot => (
        <SlotRow
          key={slot}
          slot={slot}
          archetypes={current[slot] ?? []}
          onArchChange={a => setSlot(slot, a)}
          onRemove={() => removeSlot(slot)}
        />
      ))}
      <div style={fieldRowStyle}>
        <input
          type="text"
          value={newSlot}
          onChange={e => setNewSlot(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } }}
          placeholder="slot name (e.g. head)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={addSlot} disabled={!newSlot.trim()} style={addButtonStyle}>
          + slot
        </button>
      </div>
    </div>
  );
}

function SlotRow({ slot, archetypes, onArchChange, onRemove }: {
  slot: string;
  archetypes: string[];
  onArchChange: (a: string[]) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t || archetypes.includes(t)) return;
    onArchChange([...archetypes, t]);
    setDraft('');
  };
  return (
    <div style={entryCardStyle}>
      <div style={fieldRowStyle}>
        <span style={{ ...labelStyle, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.05em' }}>
          {slot.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: '#666' }}>
          {archetypes.length} archetype{archetypes.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onRemove} style={dangerIconButtonStyle} title={`Remove ${slot}`}>×</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {archetypes.map(a => (
          <span key={a} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 12,
            padding: '2px 8px', fontSize: 11, color: '#e0e0ff',
          }}>
            {a}
            <button
              type="button"
              onClick={() => onArchChange(archetypes.filter(x => x !== a))}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={fieldRowStyle}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder="archetype name"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} style={addButtonStyle}>
          + archetype
        </button>
      </div>
    </div>
  );
}
