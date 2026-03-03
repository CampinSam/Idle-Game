import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../adminApi';

const refCache = new Map<string, any[]>();

interface Props {
  refTable: string;
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export default function RefSelect({ refTable, value, onChange, onBlur, placeholder }: Props) {
  const [options, setOptions] = useState<any[]>(refCache.get(refTable) || []);
  const [loading, setLoading] = useState(!refCache.has(refTable));
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (refCache.has(refTable)) return;
    setLoading(true);
    adminApi.list(refTable).then(data => {
      refCache.set(refTable, data);
      setOptions(data);
    }).catch(() => {
      refCache.set(refTable, []);
    }).finally(() => setLoading(false));
  }, [refTable]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onBlur]);

  const filtered = options.filter(o => {
    const label = `${o.id}${o.name ? ` — ${o.name}` : ''}`.toLowerCase();
    return label.includes(search.toLowerCase());
  });

  const selectedLabel = value
    ? (() => {
        const found = options.find(o => o.id === value);
        return found ? `${found.id}${found.name ? ` — ${found.name}` : ''}` : value;
      })()
    : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => { if (!open) onBlur?.(); }}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: '#1a1a2e',
          border: '1px solid #333',
          borderRadius: 6,
          color: selectedLabel ? '#e0e0ff' : '#666',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? 'Loading...' : (selectedLabel || (placeholder || '— none —'))}
        </span>
        <span style={{ color: '#666', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: '#16213e',
          border: '1px solid #444',
          borderRadius: 6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          marginTop: 4,
          maxHeight: 280,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #333' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px',
                background: '#0f0f2e',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#e0e0ff',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            <div
              onClick={() => { onChange(null); setOpen(false); onBlur?.(); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#888',
                fontSize: 13,
                borderBottom: '1px solid #222',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1a1a3e')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              — none —
            </div>
            {filtered.map(opt => (
              <div
                key={opt.id}
                onClick={() => { onChange(opt.id); setOpen(false); setSearch(''); onBlur?.(); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: opt.id === value ? '#a78bfa' : '#e0e0ff',
                  background: opt.id === value ? 'rgba(167,139,250,0.1)' : 'transparent',
                  borderBottom: '1px solid #1a1a2e',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1a1a3e')}
                onMouseLeave={e => (e.currentTarget.style.background = opt.id === value ? 'rgba(167,139,250,0.1)' : 'transparent')}
              >
                <span style={{ fontWeight: 600 }}>{opt.id}</span>
                {opt.name && <span style={{ color: '#888', marginLeft: 6 }}>— {opt.name}</span>}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', color: '#666', fontSize: 13, textAlign: 'center' }}>
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
