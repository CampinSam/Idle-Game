import { useState, useRef } from 'react';
import CollapsibleObject from './CollapsibleObject';
import { resolveTemplates, hexToRgb } from './jsonTemplates';

interface Props {
  items: any[];
  onChange: (items: any[]) => void;
  depth?: number;
  path?: string;
}

function getItemSummary(item: any, index: number): string {
  if (typeof item !== 'object' || item === null) return String(item);
  if ('bundle' in item && Array.isArray(item.bundle)) return `bundle { ${item.bundle.length} items }`;
  const keys = ['type', 'id', 'name', 'key', 'label', 'eventType'];
  for (const k of keys) {
    if (item[k] !== undefined) return `${k}: ${item[k]}`;
  }
  const firstStrKey = Object.entries(item).find(([, v]) => typeof v === 'string');
  if (firstStrKey) return `${firstStrKey[0]}: ${firstStrKey[1]}`;
  return `Item ${index + 1}`;
}

export default function DraggableList({ items, onChange, depth = 0, path }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set(items.map((_, i) => i)));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const templates = resolveTemplates(path ?? '');

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

  const insertItem = (newItem: Record<string, any>) => {
    const next = [...items, newItem];
    const newIdx = next.length - 1;
    setCollapsed(prev => {
      const s = new Set(prev);
      s.delete(newIdx);
      return s;
    });
    onChange(next);
    setPickerOpen(false);
  };

  const addBlank = () => insertItem({});

  const toggleCollapse = (idx: number) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  };

  const hasTemplates = templates !== null && templates.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <style>{`
        @keyframes _dl_fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ color: '#666', fontSize: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                  {isCollapsed ? getItemSummary(item, idx) : `Item ${idx + 1}`}
                </span>
                {isCollapsed && typeof item === 'object' && item !== null && (
                  <span style={{ color: '#555', fontSize: 11 }}>
                    {'bundle' in item ? '' : `{ ${Object.keys(item).length} keys }`}
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
                  path={path ? `${path}[${idx}]` : `[${idx}]`}
                />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <button
          type="button"
          onClick={() => {
            if (hasTemplates) {
              setPickerOpen(p => !p);
            } else {
              addBlank();
            }
          }}
          style={{
            padding: '6px 12px',
            background: 'rgba(167,139,250,0.08)',
            border: '1px dashed #a78bfa',
            borderRadius: pickerOpen ? '6px 6px 0 0' : 6,
            borderBottom: pickerOpen ? '1px solid #2a2a4e' : '1px dashed #a78bfa',
            color: '#a78bfa',
            cursor: 'pointer',
            fontSize: 12,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'inherit',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}
        >
          <span>+ Add item</span>
          {hasTemplates && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#6b5fa0',
              transform: pickerOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}>▾</span>
          )}
        </button>

        {pickerOpen && hasTemplates && (
          <div style={{
            background: '#0d0d1e',
            border: '1px dashed #a78bfa',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '8px 10px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            alignItems: 'center',
            animation: '_dl_fadeIn 0.12s ease',
          }}>
            {templates!.map(tpl => (
              <button
                key={tpl.label}
                type="button"
                title={tpl.description}
                onClick={() => insertItem(tpl.template())}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 13,
                  background: `rgba(${hexToRgb(tpl.color)}, 0.12)`,
                  border: `1px solid ${tpl.color}55`,
                  color: tpl.color,
                  fontSize: 10,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'background 0.1s, box-shadow 0.1s',
                  lineHeight: 1,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `rgba(${hexToRgb(tpl.color)}, 0.25)`;
                  e.currentTarget.style.boxShadow = `0 0 8px rgba(${hexToRgb(tpl.color)}, 0.3)`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `rgba(${hexToRgb(tpl.color)}, 0.12)`;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                + {tpl.label}
              </button>
            ))}
            <button
              type="button"
              title="Insert empty object"
              onClick={addBlank}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 13,
                background: 'rgba(148,163,184,0.08)',
                border: '1px solid #333',
                color: '#64748b',
                fontSize: 10,
                fontFamily: 'inherit',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              + blank
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#444',
                cursor: 'pointer',
                fontSize: 14,
                padding: '0 4px',
                lineHeight: 1,
              }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
