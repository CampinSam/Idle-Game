import { useState, useMemo, useEffect, useRef } from 'react';
import { MODAL_ACTION_TYPES } from '@derp/shared';
import { ACTION_META } from './modal-editor-meta';

interface Props {
  current: string;
  onPick: (type: string) => void;
}

export default function ActionPicker({ current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const currentMeta = ACTION_META[current];
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside the picker.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MODAL_ACTION_TYPES.filter(t => {
      if (!q) return true;
      const m = ACTION_META[t];
      const hay = `${t} ${m?.friendlyName ?? ''} ${m?.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 bg-[#0f0f2e] border border-[#2a2a4e] rounded-[6px] text-[#e0e0ff] font-[inherit] text-[13px] cursor-pointer text-left min-h-[40px] hover:border-[#7c3aed] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex-1 font-bold text-[#e0e0ff]">
          {currentMeta?.friendlyName ?? current}
        </span>
        <span className="font-mono text-[11px] text-[#7c3aed] bg-[#7c3aed18] border border-[#7c3aed33] rounded-[4px] px-[6px] py-[1px]">{current}</span>
        <span className="text-[9px] text-[#4c4c7a]">{open ? '▲' : '▼'}</span>
      </button>
      {currentMeta && (
        <div className="text-[11px] text-[#94a3b8] leading-[1.5] px-1">
          {currentMeta.description}
          {currentMeta.fields.length > 0 && (
            <span className="me-action-picker-fields text-[#64748b]">
              {' '}Fields: {currentMeta.fields.map(f => (
                <code key={f.name}>{f.name}{f.required ? '*' : ''}</code>
              )).reduce<React.ReactNode[]>((acc, el, i) => {
                if (i > 0) acc.push(', ');
                acc.push(el);
                return acc;
              }, [])}
            </span>
          )}
        </div>
      )}
      {open && (
        <div className="me-action-picker-menu absolute top-full left-0 right-0 z-50 mt-1 bg-[#0a0a1e] border border-[#2a2a4e] rounded-[8px] p-2 max-h-[360px] flex flex-col gap-[6px] shadow-[0_10px_40px_rgba(0,0,0,0.6)] overflow-y-auto">
          <input
            autoFocus
            className="flex-1 px-3 py-2 bg-[#0f0f2e] border border-[#2a2a4e] rounded-[6px] text-[#e0e0ff] text-[13px] font-[inherit] min-h-[40px] focus:outline-none focus:border-[#7c3aed]"
            placeholder="Search actions…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="overflow-y-auto flex flex-col gap-1">
            {filtered.length === 0 && (
              <div className="px-4 py-4 text-center text-[#555] text-xs italic">No actions match "{query}".</div>
            )}
            {filtered.map(t => {
              const m = ACTION_META[t];
              const isActive = t === current;
              return (
                <button
                  key={t}
                  type="button"
                  className={`text-left flex flex-col gap-1 px-[10px] py-2 bg-[#0f0f2e] border border-[#1a1a3e] rounded-[6px] text-[#e0e0ff] cursor-pointer font-[inherit] transition-[background,border-color] hover:bg-[#16163a] hover:border-[#2a2a4e] w-full${isActive ? ' !bg-[#1a1140] !border-[#7c3aed]' : ''}`}
                  onClick={() => { onPick(t); setOpen(false); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold">{m?.friendlyName ?? t}</span>
                    <code className="font-mono text-[10px] text-[#7c3aed]">{t}</code>
                  </div>
                  <div className="text-[11px] text-[#94a3b8] leading-[1.4]">{m?.description}</div>
                  {m && m.fields.length > 0 && (
                    <div className="flex flex-wrap gap-[6px] text-[10px] text-[#64748b]">
                      {m.fields.map(f => (
                        <span key={f.name} className="me-action-picker-field">
                          <code>{f.name}{f.required ? '*' : ''}</code>
                          {f.hint && <span className="text-[#555] italic"> — {f.hint}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
