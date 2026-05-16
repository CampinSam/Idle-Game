import { useState } from 'react';
import {
  containerStyle, entryCardStyle, inputStyle, addButtonStyle,
  dangerIconButtonStyle, labelStyle, fieldRowStyle,
} from './editorStyles';

interface Props {
  value: Record<string, string> | null | undefined;
  onChange: (v: Record<string, string>) => void;
  emptyMessage?: string;
}

/** Editor for a slot → single archetype string map (init.scratch.slotFill.fixed, init.nft.defaults). */
export default function SlotSingleArchetypeEditor({ value, onChange, emptyMessage }: Props) {
  const current: Record<string, string> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const [newSlot, setNewSlot] = useState('');

  const slots = Object.keys(current);

  const setSlot = (slot: string, arch: string) => {
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
    onChange({ ...current, [t]: '' });
    setNewSlot('');
  };

  return (
    <div style={containerStyle}>
      {slots.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '6px 0' }}>
          {emptyMessage ?? 'No entries — add one below'}
        </div>
      )}
      {slots.map(slot => (
        <div key={slot} style={entryCardStyle}>
          <div style={fieldRowStyle}>
            <span style={{ ...labelStyle, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.05em', minWidth: 80 }}>
              {slot.toUpperCase()}
            </span>
            <span style={labelStyle}>→</span>
            <input
              type="text"
              value={current[slot] ?? ''}
              onChange={e => setSlot(slot, e.target.value)}
              placeholder="archetype name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={() => removeSlot(slot)} style={dangerIconButtonStyle}>×</button>
          </div>
        </div>
      ))}
      <div style={fieldRowStyle}>
        <input
          type="text"
          value={newSlot}
          onChange={e => setNewSlot(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } }}
          placeholder="slot name"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={addSlot} disabled={!newSlot.trim()} style={addButtonStyle}>
          + entry
        </button>
      </div>
    </div>
  );
}
