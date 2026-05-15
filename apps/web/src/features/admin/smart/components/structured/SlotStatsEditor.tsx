import { useState } from 'react';
import StatMapEditor from './StatMapEditor';

interface Props {
  value: Record<string, Record<string, number>> | null | undefined;
  onChange: (v: Record<string, Record<string, number>>) => void;
}

export default function SlotStatsEditor({ value, onChange }: Props) {
  const [newSlot, setNewSlot] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const current: Record<string, Record<string, number>> =
    (value && typeof value === 'object') ? value : {};
  const slots = Object.keys(current);

  const isExpanded = (slot: string) => expanded[slot] !== false;

  const toggleSlot = (slot: string) =>
    setExpanded(prev => ({ ...prev, [slot]: !isExpanded(slot) }));

  const handleSlotChange = (slot: string, stats: Record<string, number>) => {
    onChange({ ...current, [slot]: stats });
  };

  const addSlot = () => {
    const trimmed = newSlot.trim();
    if (!trimmed || current[trimmed] !== undefined) return;
    onChange({ ...current, [trimmed]: {} });
    setExpanded(prev => ({ ...prev, [trimmed]: true }));
    setNewSlot('');
  };

  const removeSlot = (slot: string) => {
    const next = { ...current };
    delete next[slot];
    onChange(next);
  };

  const statCount = (slot: string) => Object.keys(current[slot] ?? {}).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {slots.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '8px 0' }}>
          No slots defined — add one below
        </div>
      )}

      {slots.map(slot => {
        const open = isExpanded(slot);
        const count = statCount(slot);
        return (
          <div key={slot} style={{
            background: '#0f0f2e',
            border: '1px solid #2a2a4e',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <div
              onClick={() => toggleSlot(slot)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                background: '#12123a',
                borderBottom: open ? '1px solid #2a2a4e' : 'none',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10,
                  color: '#666',
                  transition: 'transform 0.15s',
                  display: 'inline-block',
                  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>▶</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em' }}>
                  {slot.toUpperCase()}
                </span>
                {!open && count > 0 && (
                  <span style={{ fontSize: 10, color: '#555' }}>
                    {count} stat{count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeSlot(slot); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#555',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: '0 2px',
                }}
                title={`Remove ${slot}`}
              >
                ×
              </button>
            </div>
            {open && (
              <div style={{ padding: 10 }}>
                <StatMapEditor
                  value={current[slot]}
                  onChange={stats => handleSlotChange(slot, stats)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={newSlot}
          onChange={e => setNewSlot(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } }}
          placeholder="slot name (e.g. head, body)"
          style={{
            flex: 1,
            padding: '5px 10px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 5,
            color: '#e0e0ff',
            fontSize: 12,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={addSlot}
          disabled={!newSlot.trim()}
          style={{
            padding: '5px 12px',
            background: newSlot.trim() ? '#7c3aed' : '#2a2a4e',
            border: 'none',
            borderRadius: 5,
            color: newSlot.trim() ? '#fff' : '#555',
            cursor: newSlot.trim() ? 'pointer' : 'default',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          + Add slot
        </button>
      </div>
    </div>
  );
}
