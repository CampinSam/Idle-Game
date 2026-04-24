import { useState, useMemo, useEffect, useRef } from 'react';
import { MODAL_BLOCK_TYPES } from '@derp/shared';
import { BLOCK_META, BLOCK_GROUP_ORDER, type BlockGroup } from './modal-editor-meta';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
}

export default function BlockPicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside the picker.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current && !rootRef.current.contains(t)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byGroup: Record<BlockGroup, string[]> = {
      Content: [], Lists: [], Status: [], Reveal: [], Layout: [], Errors: [],
    };
    for (const t of MODAL_BLOCK_TYPES) {
      const m = BLOCK_META[t];
      if (!m) continue;
      if (q) {
        const hay = `${t} ${m.friendlyName} ${m.description}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      byGroup[m.group].push(t);
    }
    return byGroup;
  }, [query]);

  if (!open) return null;

  const totalMatches = Object.values(groups).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div ref={rootRef} className="me-picker">
      <div className="me-picker-search-wrap">
        <input
          autoFocus
          className="me-picker-search"
          placeholder="Search blocks…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className="me-btn-ghost me-picker-close" onClick={onClose}>Close</button>
      </div>
      {totalMatches === 0 && (
        <div className="me-picker-empty">No blocks match "{query}".</div>
      )}
      {BLOCK_GROUP_ORDER.map(group => {
        const types = groups[group];
        if (types.length === 0) return null;
        return (
          <div key={group} className="me-picker-group">
            <div className="me-picker-group-title">{group}</div>
            <div className="me-picker-grid">
              {types.map(t => {
                const m = BLOCK_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className="me-picker-card"
                    style={{ borderColor: `${m.color}55` }}
                    onClick={() => { onPick(t); onClose(); }}
                  >
                    <div className="me-picker-card-hdr">
                      <span
                        className="me-picker-card-tag"
                        style={{ color: m.color, background: `${m.color}18`, borderColor: `${m.color}44` }}
                      >
                        {t}
                      </span>
                      <span className="me-picker-card-name">{m.friendlyName}</span>
                    </div>
                    <div className="me-picker-card-prev">{m.preview()}</div>
                    <div className="me-picker-card-desc">{m.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
