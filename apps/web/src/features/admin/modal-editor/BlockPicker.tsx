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
    <div ref={rootRef} className="border border-[#1a1a3e] rounded-[10px] p-[14px] bg-[#0a0a1e] overflow-y-auto touch-pan-y max-h-[600px]">
      <div className="flex gap-2 mb-3">
        <input
          autoFocus
          className="flex-1 px-3 py-2 bg-[#0f0f2e] border border-[#2a2a4e] rounded-[6px] text-[#e0e0ff] text-[13px] font-[inherit] min-h-[40px] focus:outline-none focus:border-[#7c3aed]"
          placeholder="Search blocks…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className="me-btn-ghost shrink-0" onClick={onClose}>Close</button>
      </div>
      {totalMatches === 0 && (
        <div className="px-4 py-4 text-center text-[#555] text-xs italic">No blocks match "{query}".</div>
      )}
      {BLOCK_GROUP_ORDER.map(group => {
        const types = groups[group];
        if (types.length === 0) return null;
        return (
          <div key={group} className="mb-[14px]">
            <div className="text-[10px] font-[800] tracking-[0.12em] uppercase text-[#4c4c7a] my-1 mb-2">{group}</div>
            <div className="me-picker-grid grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
              {types.map(t => {
                const m = BLOCK_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className="me-picker-card flex flex-col gap-[6px] text-left p-[10px_12px] bg-[#0f0f2e] border border-solid rounded-[8px] text-[#e0e0ff] cursor-pointer font-[inherit] transition-[background,transform] min-h-[96px] hover:bg-[#12123a] hover:translate-y-[-2px]"
                    style={{ borderColor: `${m.color}55` }}
                    onClick={() => { onPick(t); onClose(); }}
                  >
                    <div className="flex items-center gap-[6px] flex-wrap">
                      <span
                        className="text-[9px] font-[700] rounded-[4px] px-[6px] py-[1px] tracking-[0.04em] uppercase border border-solid font-mono"
                        style={{ color: m.color, background: `${m.color}18`, borderColor: `${m.color}44` }}
                      >
                        {t}
                      </span>
                      <span className="text-[13px] font-bold text-[#e0e0ff]">{m.friendlyName}</span>
                    </div>
                    <div className="bg-[rgba(0,0,0,0.35)] rounded-[6px] px-2 py-[6px] text-[11px] text-[#cbd5e1] min-h-[36px] flex items-center overflow-hidden">{m.preview()}</div>
                    <div className="text-[11px] text-[#94a3b8] leading-[1.4]">{m.description}</div>
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
