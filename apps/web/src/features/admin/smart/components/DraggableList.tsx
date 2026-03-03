import { useState, useRef } from 'react';
import CollapsibleObject from './CollapsibleObject';

interface Props {
  items: any[];
  onChange: (items: any[]) => void;
  depth?: number;
}

function getItemSummary(item: any, index: number): string {
  if (typeof item !== 'object' || item === null) return String(item);
  const keys = ['type', 'id', 'name', 'key', 'label'];
  for (const k of keys) {
    if (item[k] !== undefined) return `${k}: ${item[k]}`;
  }
  const firstStrKey = Object.entries(item).find(([, v]) => typeof v === 'string');
  if (firstStrKey) return `${firstStrKey[0]}: ${firstStrKey[1]}`;
  return `Item ${index + 1}`;
}

export default function DraggableList({ items, onChange, depth = 0 }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set(items.map((_, i) => i)));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dropIdx) setDropIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDropIdx(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);

    const newCollapsed = new Set<number>();
    collapsed.forEach(c => {
      if (c === dragIdx) {
        newCollapsed.add(idx);
      } else {
        const adjusted = c < dragIdx && c >= idx ? c + 1 : c > dragIdx && c <= idx ? c - 1 : c;
        newCollapsed.add(adjusted);
      }
    });
    setCollapsed(newCollapsed);
    onChange(next);
    setDragIdx(null);
    setDropIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDropIdx(null);
  };

  const updateItem = (idx: number, val: any) => {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    const newCollapsed = new Set<number>();
    collapsed.forEach(c => { if (c !== idx) newCollapsed.add(c > idx ? c - 1 : c); });
    setCollapsed(newCollapsed);
    onChange(next);
  };

  const addItem = () => {
    const next = [...items, {}];
    onChange(next);
  };

  const toggleCollapse = (idx: number) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, idx) => {
        const isCollapsed = collapsed.has(idx);
        const isDragging = dragIdx === idx;
        const isDropTarget = dropIdx === idx && dragIdx !== null && dragIdx !== idx;

        return (
          <div
            key={idx}
            ref={isDragging ? dragNode : null}
            draggable
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            style={{
              border: isDropTarget ? '2px solid #a78bfa' : '1px solid #333',
              borderRadius: 6,
              background: isDragging ? 'rgba(167,139,250,0.1)' : '#1a1a2e',
              opacity: isDragging ? 0.5 : 1,
              transition: 'border-color 0.1s',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 6px',
              gap: 6,
              borderBottom: isCollapsed ? 'none' : '1px solid #2a2a3e',
            }}>
              <div
                style={{ cursor: 'grab', color: '#555', padding: '0 4px', fontSize: 14, userSelect: 'none' }}
                title="Drag to reorder"
              >
                ⣿
              </div>
              <button
                type="button"
                onClick={() => toggleCollapse(idx)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: '#aaa',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                  padding: '2px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ color: '#666', fontSize: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                  {isCollapsed ? getItemSummary(item, idx) : `Item ${idx + 1}`}
                </span>
                {isCollapsed && typeof item === 'object' && item !== null && (
                  <span style={{ color: '#555', fontSize: 11 }}>
                    {`{ ${Object.keys(item).length} keys }`}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 4px',
                  lineHeight: 1,
                }}
                title="Remove item"
              >
                ×
              </button>
            </div>
            {!isCollapsed && (
              <div style={{ padding: '8px 10px 10px' }}>
                <CollapsibleObject
                  value={item}
                  onChange={val => updateItem(idx, val)}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addItem}
        style={{
          padding: '6px 12px',
          background: 'rgba(167,139,250,0.1)',
          border: '1px dashed #a78bfa',
          borderRadius: 6,
          color: '#a78bfa',
          cursor: 'pointer',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        + Add item
      </button>
    </div>
  );
}
