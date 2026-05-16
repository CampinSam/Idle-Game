import { useState } from 'react';
import {
  containerStyle, entryCardStyle, inputStyle, addButtonStyle,
  dangerIconButtonStyle, labelStyle, fieldRowStyle, numberInputStyle,
} from './editorStyles';

interface Props {
  value: Record<string, number> | null | undefined;
  onChange: (v: Record<string, number>) => void;
}

export default function EquipmentSlotsEditor({ value, onChange }: Props) {
  const current: Record<string, number> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const [newSlot, setNewSlot] = useState('');

  const slots = Object.keys(current);

  const setSlot = (slot: string, n: number) => {
    onChange({ ...current, [slot]: n });
  };
  const removeSlot = (slot: string) => {
    const next = { ...current };
    delete next[slot];
    onChange(next);
  };
  const addSlot = () => {
    const t = newSlot.trim();
    if (!t || current[t] !== undefined) return;
    onChange({ ...current, [t]: 1 });
    setNewSlot('');
  };

  return (
    <div style={containerStyle}>
      {slots.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '6px 0' }}>
          No equipment slots — add one below
        </div>
      )}
      {slots.map(slot => (
        <div key={slot} style={entryCardStyle}>
          <div style={fieldRowStyle}>
            <span style={{ ...labelStyle, color: '#fbbf24', fontWeight: 700, letterSpacing: '0.05em', minWidth: 80 }}>
              {slot.toUpperCase()}
            </span>
            <span style={labelStyle}>capacity:</span>
            <input
              type="number"
              min={1}
              value={current[slot] ?? 1}
              onChange={e => {
                const n = Number(e.target.value);
                setSlot(slot, isNaN(n) || n < 1 ? 1 : Math.floor(n));
              }}
              style={numberInputStyle}
            />
            <span style={{ flex: 1 }} />
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
          placeholder="slot name (e.g. weapon)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={addSlot} disabled={!newSlot.trim()} style={addButtonStyle}>
          + slot
        </button>
      </div>
    </div>
  );
}
