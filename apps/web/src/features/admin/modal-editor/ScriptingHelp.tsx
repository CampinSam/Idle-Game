import { useEffect, useRef, useState } from 'react';
import { MODAL_BLOCK_TYPES, MODAL_ACTION_TYPES } from '@derp/shared';
import { BLOCK_META, ACTION_META, COMMON_TOKEN_PATHS } from './modal-editor-meta';

interface Props {
  /** Optional payload-derived dynamic paths to show in addition to the static common paths. */
  dynamicPaths?: string[];
  /** Initial open state. Defaults to false per spec; a compact chip strip stays visible while collapsed. */
  defaultOpen?: boolean;
  /** Optional class for outer wrapper. */
  className?: string;
}

type Tab = 'tokens' | 'from' | 'actions';

export default function ScriptingHelp({ dynamicPaths = [], defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  // Allow Escape to collapse the panel when focus is inside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as Node | null;
      if (!target || (rootRef.current && rootRef.current.contains(target))) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const [tab, setTab] = useState<Tab>('tokens');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1200);
  };

  const STATIC_COUNT = 3;
  const DYNAMIC_COUNT = 3;
  const previewStatic = COMMON_TOKEN_PATHS.slice(0, STATIC_COUNT).map(p => p.path);
  const previewDynamic = dynamicPaths.slice(0, DYNAMIC_COUNT);

  return (
    <div ref={rootRef} className={`border border-[#1a1a3e] rounded-[10px] bg-gradient-to-br from-[#100935] to-[#0a0a1e] overflow-hidden ${className ?? ''}`}>
      <button type="button" className="me-help-toggle flex items-center gap-[10px] w-full px-4 py-3 bg-transparent border-none text-[#c4b5fd] font-[inherit] text-[13px] cursor-pointer text-left min-h-[44px] hover:bg-[rgba(167,139,250,0.06)] transition-colors" onClick={() => setOpen(o => !o)}>
        <span className="text-[10px] text-[#7c3aed] shrink-0">{open ? '▼' : '▶'}</span>
        <span className="font-[800] tracking-[0.05em]">Scripting help</span>
        <span className="me-help-toggle-sub ml-auto text-[11px] text-[#64748b] font-normal">tokens • from paths • action types</span>
      </button>
      {!open && (
        <div className="flex flex-wrap items-center gap-[6px] px-4 pb-3 border-t border-dashed border-[#1a1a3e] pt-[10px]">
          <span className="text-[10px] font-[700] tracking-[0.08em] uppercase text-[#4c4c7a] mr-[2px]">Common tokens:</span>
          {previewStatic.map(path => {
            const tk = `\${${path}}`;
            return (
              <button
                key={`s-${path}`}
                type="button"
                className="me-token-chip px-2 py-[2px] rounded-[10px] text-[11px] font-mono cursor-pointer border border-solid transition-[background,color,border-color] whitespace-nowrap"
                onClick={() => copy(tk)}
                title="Click to copy"
                style={{ background: copied === tk ? '#7c3aed33' : '#7c3aed0d', borderColor: copied === tk ? '#7c3aed' : '#7c3aed33', color: copied === tk ? '#a78bfa' : '#8b7cc8' }}
              >
                {copied === tk ? 'Copied!' : tk}
              </button>
            );
          })}
          {previewDynamic.length > 0 && (
            <>
              <span className="text-[10px] font-[700] tracking-[0.08em] uppercase text-[#4c4c7a] mr-[2px]" style={{ marginLeft: 6 }}>From payload:</span>
              {previewDynamic.map(path => {
                const tk = `\${${path}}`;
                return (
                  <button
                    key={`d-${path}`}
                    type="button"
                    className="me-token-chip px-2 py-[2px] rounded-[10px] text-[11px] font-mono cursor-pointer border border-solid transition-[background,color,border-color] whitespace-nowrap"
                    onClick={() => copy(tk)}
                    title="Click to copy"
                    style={{ background: copied === tk ? '#10b98133' : '#10b9810d', borderColor: copied === tk ? '#10b981' : '#10b98133', color: copied === tk ? '#34d399' : '#6ee7b7' }}
                  >
                    {copied === tk ? 'Copied!' : tk}
                  </button>
                );
              })}
            </>
          )}
          <button type="button" className="bg-transparent border-none text-[#94a3b8] font-[inherit] text-[11px] cursor-pointer px-[6px] py-1 underline hover:text-[#a78bfa] transition-colors" onClick={() => setOpen(true)}>
            more…
          </button>
        </div>
      )}
      {open && (
        <div className="px-4 pb-4">
          <div className="flex gap-1 border-b border-[#1a1a3e] mb-3">
            <button type="button" className={`px-[14px] py-2 bg-transparent border-0 border-b-2 text-[#64748b] font-[inherit] text-xs font-bold tracking-[0.04em] cursor-pointer min-h-[36px] hover:text-[#a78bfa] transition-colors${tab === 'tokens' ? ' !text-[#a78bfa] border-b-[#a78bfa]' : ' border-b-transparent'}`} onClick={() => setTab('tokens')}>
              ${'{tokens}'}
            </button>
            <button type="button" className={`px-[14px] py-2 bg-transparent border-0 border-b-2 text-[#64748b] font-[inherit] text-xs font-bold tracking-[0.04em] cursor-pointer min-h-[36px] hover:text-[#a78bfa] transition-colors${tab === 'from' ? ' !text-[#a78bfa] border-b-[#a78bfa]' : ' border-b-transparent'}`} onClick={() => setTab('from')}>
              "from" paths
            </button>
            <button type="button" className={`px-[14px] py-2 bg-transparent border-0 border-b-2 text-[#64748b] font-[inherit] text-xs font-bold tracking-[0.04em] cursor-pointer min-h-[36px] hover:text-[#a78bfa] transition-colors${tab === 'actions' ? ' !text-[#a78bfa] border-b-[#a78bfa]' : ' border-b-transparent'}`} onClick={() => setTab('actions')}>
              Action types
            </button>
          </div>

          {tab === 'tokens' && (
            <div className="flex flex-col gap-[10px]">
              <p className="me-help-p m-0 text-xs leading-[1.5] text-[#94a3b8]">
                Anywhere a string field accepts text (header title, button label, rich-text body…) you can embed
                <code>{' ${path} '}</code>
                to substitute a value from the payload at render time. Paths use dot notation; arrays support numeric indices and <code>.length</code>.
              </p>
              <div className="text-[10px] font-[800] tracking-[0.12em] uppercase text-[#4c4c7a] mt-[6px]">Common paths</div>
              <div className="flex flex-col gap-1">
                {COMMON_TOKEN_PATHS.map(({ path, note }) => (
                  <div key={path} className="flex items-center gap-[10px] flex-wrap">
                    <button
                      type="button"
                      className="me-token-chip px-2 py-[2px] rounded-[10px] text-[11px] font-mono cursor-pointer border border-solid transition-[background,color,border-color] whitespace-nowrap"
                      style={{ background: copied === `\${${path}}` ? '#7c3aed33' : '#7c3aed0d', borderColor: copied === `\${${path}}` ? '#7c3aed' : '#7c3aed33', color: copied === `\${${path}}` ? '#a78bfa' : '#8b7cc8' }}
                      onClick={() => copy(`\${${path}}`)}
                    >
                      {copied === `\${${path}}` ? 'Copied!' : `\${${path}}`}
                    </button>
                    <span className="text-[11px] text-[#94a3b8] flex-1 min-w-[200px]">{note}</span>
                  </div>
                ))}
              </div>
              {dynamicPaths.length > 0 && (
                <>
                  <div className="text-[10px] font-[800] tracking-[0.12em] uppercase text-[#4c4c7a] mt-[6px]">From the current payload sample</div>
                  <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto touch-pan-y">
                    {dynamicPaths.map(p => (
                      <button
                        key={p}
                        type="button"
                        className="me-token-chip px-2 py-[2px] rounded-[10px] text-[11px] font-mono cursor-pointer border border-solid transition-[background,color,border-color] whitespace-nowrap"
                        onClick={() => copy(`\${${p}}`)}
                        style={{ background: copied === `\${${p}}` ? '#7c3aed33' : '#7c3aed0d', borderColor: copied === `\${${p}}` ? '#7c3aed' : '#7c3aed33', color: copied === `\${${p}}` ? '#a78bfa' : '#8b7cc8' }}
                      >
                        {copied === `\${${p}}` ? 'Copied!' : `\${${p}}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'from' && (
            <div className="flex flex-col gap-[10px]">
              <p className="me-help-p m-0 text-xs leading-[1.5] text-[#94a3b8]">
                Each block can set a <code>from</code> path that pulls structured data out of the payload and reshapes the block accordingly. This is how Rewards, Meta Rows, Inventory Delta, etc., bind to a job's <code>results</code>.
              </p>
              <div className="flex flex-col gap-2">
                {MODAL_BLOCK_TYPES.filter(t => BLOCK_META[t]?.fromHint).map(t => {
                  const m = BLOCK_META[t]!;
                  return (
                    <div key={t} className="bg-[#0f0f2e] border border-[#1a1a3e] rounded-[8px] px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] font-[700] rounded-[4px] px-[6px] py-[1px] tracking-[0.04em] uppercase border border-solid" style={{ color: m.color, background: `${m.color}18`, borderColor: `${m.color}44` }}>
                          {t}
                        </span>
                        <span className="text-[13px] font-bold text-[#e0e0ff]">{m.friendlyName}</span>
                      </div>
                      <div className="text-[11px] text-[#94a3b8] mb-1">{m.fromHint}</div>
                      <pre className="m-0 px-2 py-[6px] bg-[#06061a] border border-[#1a1a3e] rounded-[4px] text-[11px] text-[#c4b5fd] font-[ui-monospace,monospace] whitespace-pre-wrap leading-[1.5]">{m.fromShape}</pre>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'actions' && (
            <div className="flex flex-col gap-[10px]">
              <p className="me-help-p m-0 text-xs leading-[1.5] text-[#94a3b8]">
                Action types fire when the player taps a button. Each has its own required fields. <code>${'{token}'}</code> syntax also resolves inside action field values.
              </p>
              <div className="flex flex-col gap-2">
                {MODAL_ACTION_TYPES.map(t => {
                  const m = ACTION_META[t];
                  if (!m) return null;
                  return (
                    <div key={t} className="bg-[#0f0f2e] border border-[#1a1a3e] rounded-[8px] px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-bold text-[#e0e0ff]">{m.friendlyName}</span>
                        <code className="font-mono text-[10px] text-[#7c3aed] bg-[#7c3aed18] border border-[#7c3aed33] rounded-[4px] px-[6px] py-[1px]">{t}</code>
                      </div>
                      <div className="text-[11px] text-[#94a3b8] mb-1">{m.description}</div>
                      {m.fields.length > 0 && (
                        <div className="me-help-action-fields flex flex-wrap gap-2 text-[10px] text-[#64748b]">
                          {m.fields.map(f => (
                            <span key={f.name} className="me-help-action-field">
                              <code>{f.name}{f.required ? '*' : ''}</code>
                              {f.hint && <span className="text-[#555] italic"> {f.hint}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
