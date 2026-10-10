import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '../../adminApi';
import { TABLE_API_KEYS } from '../tableSchemas';

const refCache = new Map<string, any[]>();
const inflight = new Map<string, Promise<any[]>>();

export function getCachedRefRow(refTable: string, id: string): any | undefined {
  const apiKey = TABLE_API_KEYS[refTable] ?? refTable;
  const rows = refCache.get(apiKey);
  if (!rows) return undefined;
  return rows.find((r: any) => r.id === id || r.key === id);
}

export function ensureRefCache(refTable: string): Promise<any[]> {
  const apiKey = TABLE_API_KEYS[refTable] ?? refTable;
  if (refCache.has(apiKey)) return Promise.resolve(refCache.get(apiKey)!);
  if (inflight.has(apiKey)) return inflight.get(apiKey)!;
  const p = adminApi.list(apiKey).then((data: any[]) => {
    refCache.set(apiKey, data);
    inflight.delete(apiKey);
    return data;
  }).catch(() => {
    refCache.set(apiKey, []);
    inflight.delete(apiKey);
    return [];
  });
  inflight.set(apiKey, p);
  return p;
}

export function invalidateRefCache(apiKeyOrTable?: string) {
  if (!apiKeyOrTable) {
    refCache.clear();
    return;
  }
  refCache.delete(apiKeyOrTable);
  const mapped = TABLE_API_KEYS[apiKeyOrTable];
  if (mapped) refCache.delete(mapped);
}

function optionLabel(o: any): string {
  return o.key ?? o.name ?? o.id;
}

function optionValue(o: any): string {
  return o.id ?? o.key;
}

interface Props {
  refTable: string;
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export default function RefSelect({ refTable, value, onChange, onBlur, placeholder }: Props) {
  const apiKey = TABLE_API_KEYS[refTable] ?? refTable;

  const [options, setOptions] = useState<any[]>(refCache.get(apiKey) || []);
  const [loading, setLoading] = useState(!refCache.has(apiKey));
  const [inputText, setInputText] = useState(() => {
    if (!value) return '';
    const cached = refCache.get(apiKey) || [];
    const found = cached.find((o: any) => o.id === value || o.key === value);
    return found ? optionLabel(found) : value;
  });
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (refCache.has(apiKey)) {
      const cached = refCache.get(apiKey)!;
      setOptions(cached);
      if (value) {
        const found = cached.find((o: any) => o.id === value || o.key === value);
        setInputText(found ? optionLabel(found) : value);
      }
      return;
    }
    setLoading(true);
    adminApi.list(apiKey).then(data => {
      refCache.set(apiKey, data);
      setOptions(data);
      if (value) {
        const found = data.find((o: any) => o.id === value || o.key === value);
        if (found) setInputText(optionLabel(found));
      }
    }).catch(() => {
      refCache.set(apiKey, []);
    }).finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => {
    if (!value) {
      setInputText('');
      return;
    }
    const found = options.find((o: any) => o.id === value || o.key === value);
    setInputText(found ? optionLabel(found) : value);
  }, [value, options]);

  const filtered = options.filter(o => {
    const text = inputText.toLowerCase();
    return (o.key || '').toLowerCase().includes(text)
      || (o.name || '').toLowerCase().includes(text)
      || (o.id || '').toLowerCase().includes(text);
  });

  const allItems = [null, ...filtered];

  const revertToValue = useCallback(() => {
    if (value) {
      const found = options.find((o: any) => o.id === value || o.key === value);
      setInputText(found ? optionLabel(found) : value);
    } else {
      setInputText('');
    }
  }, [value, options]);

  const commit = useCallback((text: string, allowRaw = false) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(null);
      setInputText('');
    } else {
      const match = options.find(o =>
        o.key === trimmed || o.id === trimmed || (o.name || '').trim() === trimmed
      );
      if (match) {
        onChange(optionValue(match));
        setInputText(optionLabel(match));
      } else if (allowRaw) {
        onChange(trimmed);
        setInputText(trimmed);
      } else {
        revertToValue();
      }
    }
  }, [options, onChange, revertToValue]);

  const handleFocus = () => {
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => (i + 1) % allItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => (i - 1 + allItems.length) % allItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlightedIndex >= 0) {
        const item = allItems[highlightedIndex];
        if (item === null) {
          onChange(null);
          setInputText('');
        } else {
          onChange(optionValue(item));
          setInputText(optionLabel(item));
        }
      } else {
        commit(inputText, true);
      }
      setOpen(false);
      onBlur?.();
    } else if (e.key === 'Escape') {
      setOpen(false);
      revertToValue();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    commit(inputText);
    setOpen(false);
    onBlur?.();
  };

  const handleOptionClick = (item: any | null) => {
    if (item === null) {
      onChange(null);
      setInputText('');
    } else {
      onChange(optionValue(item));
      setInputText(optionLabel(item));
    }
    setOpen(false);
    onBlur?.();
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={loading ? '' : inputText}
          placeholder={loading ? 'Loading...' : (placeholder || '— none —')}
          disabled={loading}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '6px 28px 6px 10px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 6,
            color: inputText ? '#e0e0ff' : '#666',
            fontSize: 13,
            fontFamily: 'monospace',
            boxSizing: 'border-box',
            cursor: loading ? 'not-allowed' : 'text',
            outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute',
          right: 8,
          color: '#666',
          pointerEvents: 'none',
          fontSize: 12,
        }}>▾</span>
      </div>

      {open && !loading && (
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
          overflowY: 'auto',
        }}>
          <div
            ref={listRef}
            role="listbox"
          >
            <div
              onMouseDown={e => { e.preventDefault(); handleOptionClick(null); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: highlightedIndex === 0 ? '#e0e0ff' : '#888',
                fontSize: 13,
                borderBottom: '1px solid #222',
                background: highlightedIndex === 0 ? '#1a1a3e' : 'transparent',
              }}
              onMouseEnter={() => setHighlightedIndex(0)}
              onMouseLeave={() => setHighlightedIndex(-1)}
            >
              — none —
            </div>
            {filtered.map((opt, idx) => {
              const listIdx = idx + 1;
              const isHighlighted = highlightedIndex === listIdx;
              const isSelected = opt.id === value || opt.key === value;
              return (
                <div
                  key={opt.id ?? opt.key}
                  onMouseDown={e => { e.preventDefault(); handleOptionClick(opt); }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: isSelected ? '#a78bfa' : '#e0e0ff',
                    background: isHighlighted ? '#1a1a3e' : (isSelected ? 'rgba(167,139,250,0.1)' : 'transparent'),
                    borderBottom: '1px solid #1a1a2e',
                    fontFamily: 'monospace',
                  }}
                  onMouseEnter={() => setHighlightedIndex(listIdx)}
                  onMouseLeave={() => setHighlightedIndex(-1)}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{opt.key ?? opt.id}</span>
                    {refTable === 'BundleDef' && Array.isArray(opt.bundle) && (
                      <span style={{ color: '#a78bfa', fontSize: 11, fontFamily: 'sans-serif' }}>
                        · {opt.bundle.length} {opt.bundle.length === 1 ? 'entry' : 'entries'}
                        {(opt.pickMin != null || opt.pickMax != null) && (
                          <> · pick {opt.pickMin ?? 1}–{opt.pickMax ?? opt.pickMin ?? 1}</>
                        )}
                        {opt.enabled === false && <> · disabled</>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && inputText && (
              <div style={{ padding: '12px', color: '#666', fontSize: 13, textAlign: 'center' }}>
                No matches — press Enter to use "{inputText}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
