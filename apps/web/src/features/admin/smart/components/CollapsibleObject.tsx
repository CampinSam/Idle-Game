import { useState } from 'react';
import DraggableList from './DraggableList';

interface Props {
  value: any;
  onChange: (val: any) => void;
  depth?: number;
  path?: string;
}

const TIMER_DEFAULTS = {
  duration: 0,
  boostable: true,
  skipable: false,
  skip_cost: [],
  skip_type: 'absolute',
};

function isPrimitive(v: any) {
  return v === null || v === undefined || typeof v !== 'object';
}

function isArrayOfObjects(v: any): boolean {
  return Array.isArray(v) && v.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
}

function PrimitiveValue({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  if (typeof value === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          style={{ accentColor: '#a78bfa', width: 14, height: 14 }}
        />
        <span style={{ fontSize: 12, color: value ? '#a78bfa' : '#888' }}>{String(value)}</span>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        style={{ padding: '2px 6px', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }}
      />
    );
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{ padding: '2px 6px', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }}
    />
  );
}

function ObjectNode({ obj, onChange, depth, path }: { obj: Record<string, any>; onChange: (v: any) => void; depth: number; path?: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(Object.keys(obj)));
  const [addingKey, setAddingKey] = useState(false);
  const [newKey, setNewKey] = useState('');

  const isTimerNode = path?.split('.').pop() === 'timer' || path?.split('.').pop() === 'skip_cost';
  const isEmptyTimerNode = path?.split('.').pop() === 'timer' && Object.keys(obj).length === 0;

  const setField = (key: string, val: any) => {
    onChange({ ...obj, [key]: val });
  };

  const removeField = (key: string) => {
    const next = { ...obj };
    delete next[key];
    onChange(next);
  };

  const addField = () => {
    if (newKey && !(newKey in obj)) {
      onChange({ ...obj, [newKey]: '' });
      setNewKey('');
      setAddingKey(false);
    }
  };

  const toggleKey = (key: string) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.entries(obj).map(([key, val]) => {
        const isComplex = !isPrimitive(val);
        const isCollapsed = collapsed.has(key) && isComplex;
        const childPath = path ? `${path}.${key}` : key;

        const valuePreview = () => {
          if (Array.isArray(val)) return `[ ${val.length} items ]`;
          if (typeof val === 'object' && val !== null) return `{ ${Object.keys(val).length} keys }`;
          return String(val);
        };

        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
              {isComplex && (
                <button
                  type="button"
                  onClick={() => toggleKey(key)}
                  style={{
                    background: 'none', border: 'none', color: '#666', cursor: 'pointer',
                    fontSize: 10, padding: '0 2px', lineHeight: 1, flexShrink: 0,
                  }}
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>
              )}
              {!isComplex && <div style={{ width: 14 }} />}
              <span style={{ color: '#7dd3fc', fontSize: 12, flexShrink: 0, minWidth: 60 }}>{key}:</span>
              {isCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleKey(key)}
                  style={{
                    flex: 1, background: 'none', border: 'none', color: '#555',
                    fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0,
                  }}
                >
                  {valuePreview()}
                </button>
              ) : isPrimitive(val) ? (
                <div style={{ flex: 1 }}>
                  <PrimitiveValue value={val} onChange={v => setField(key, v)} />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => removeField(key)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
                title="Remove key"
              >
                ×
              </button>
            </div>
            {!isCollapsed && isComplex && (
              <div style={{ marginLeft: 20, borderLeft: '1px solid #2a2a3e', paddingLeft: 10 }}>
                <CollapsibleObject value={val} onChange={v => setField(key, v)} depth={depth + 1} path={childPath} />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        {isEmptyTimerNode ? (
          <button
            type="button"
            onClick={() => onChange(TIMER_DEFAULTS)}
            style={{
              padding: '4px 12px',
              background: 'rgba(251,146,60,0.1)',
              border: '1px solid #fb923c55',
              borderRadius: 6,
              color: '#fb923c',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              fontWeight: 700,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,146,60,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,146,60,0.1)'; }}
            title="Pre-fill all timer fields with defaults"
          >
            <span>⚡</span>
            <span>Fill timer defaults</span>
          </button>
        ) : addingKey ? (
          <>
            <input
              autoFocus
              type="text"
              placeholder="new key"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') setAddingKey(false); }}
              style={{ padding: '2px 6px', background: '#0f0f2e', border: '1px solid #a78bfa', borderRadius: 4, color: '#e0e0ff', fontSize: 12, width: 120 }}
            />
            <button type="button" onClick={addField} style={{ padding: '2px 8px', background: '#a78bfa', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Add</button>
            <button type="button" onClick={() => setAddingKey(false)} style={{ padding: '2px 6px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAddingKey(true)}
            style={{ padding: '2px 8px', background: 'rgba(167,139,250,0.1)', border: '1px dashed #a78bfa', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11 }}
          >
            + key
          </button>
        )}
      </div>
    </div>
  );
}

export default function CollapsibleObject({ value, onChange, depth = 0, path }: Props) {
  if (Array.isArray(value)) {
    if (isArrayOfObjects(value) || value.length === 0) {
      return <DraggableList items={value} onChange={onChange} depth={depth} path={path} />;
    }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {value.map((item, i) => (
          <span key={i} style={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, padding: '2px 8px', color: '#e0e0ff', fontSize: 12 }}>
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return <ObjectNode obj={value} onChange={onChange} depth={depth} path={path} />;
  }

  return <PrimitiveValue value={value} onChange={onChange} />;
}
