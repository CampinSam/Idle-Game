import { useState } from 'react';
import { MODAL_BLOCK_TYPES, MODAL_ACTION_TYPES } from '@derp/shared';
import { BLOCK_META, ACTION_META, COMMON_TOKEN_PATHS } from './modal-editor-meta';

interface Props {
  /** Optional payload-derived dynamic paths to show in addition to the static common paths. */
  dynamicPaths?: string[];
  /** Initial open state. Defaults to false. */
  defaultOpen?: boolean;
  /** Optional class for outer wrapper. */
  className?: string;
}

type Tab = 'tokens' | 'from' | 'actions';

export default function ScriptingHelp({ dynamicPaths = [], defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<Tab>('tokens');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className={`me-help ${className ?? ''}`}>
      <button type="button" className="me-help-toggle" onClick={() => setOpen(o => !o)}>
        <span className="me-help-toggle-icon">{open ? '▼' : '▶'}</span>
        <span className="me-help-toggle-label">Scripting help</span>
        <span className="me-help-toggle-sub">tokens • from paths • action types</span>
      </button>
      {open && (
        <div className="me-help-body">
          <div className="me-help-tabs">
            <button type="button" className={`me-help-tab ${tab === 'tokens' ? 'me-help-tab-active' : ''}`} onClick={() => setTab('tokens')}>
              ${'{tokens}'}
            </button>
            <button type="button" className={`me-help-tab ${tab === 'from' ? 'me-help-tab-active' : ''}`} onClick={() => setTab('from')}>
              "from" paths
            </button>
            <button type="button" className={`me-help-tab ${tab === 'actions' ? 'me-help-tab-active' : ''}`} onClick={() => setTab('actions')}>
              Action types
            </button>
          </div>

          {tab === 'tokens' && (
            <div className="me-help-section">
              <p className="me-help-p">
                Anywhere a string field accepts text (header title, button label, rich-text body…) you can embed
                <code>{' ${path} '}</code>
                to substitute a value from the payload at render time. Paths use dot notation; arrays support numeric indices and <code>.length</code>.
              </p>
              <div className="me-help-sub">Common paths</div>
              <div className="me-help-token-list">
                {COMMON_TOKEN_PATHS.map(({ path, note }) => (
                  <div key={path} className="me-help-token-row">
                    <button
                      type="button"
                      className="me-token-chip"
                      style={{ background: copied === `\${${path}}` ? '#7c3aed33' : '#7c3aed0d', borderColor: copied === `\${${path}}` ? '#7c3aed' : '#7c3aed33', color: copied === `\${${path}}` ? '#a78bfa' : '#8b7cc8' }}
                      onClick={() => copy(`\${${path}}`)}
                    >
                      {copied === `\${${path}}` ? 'Copied!' : `\${${path}}`}
                    </button>
                    <span className="me-help-token-note">{note}</span>
                  </div>
                ))}
              </div>
              {dynamicPaths.length > 0 && (
                <>
                  <div className="me-help-sub">From the current payload sample</div>
                  <div className="me-help-token-chips">
                    {dynamicPaths.map(p => (
                      <button
                        key={p}
                        type="button"
                        className="me-token-chip"
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
            <div className="me-help-section">
              <p className="me-help-p">
                Each block can set a <code>from</code> path that pulls structured data out of the payload and reshapes the block accordingly. This is how Rewards, Meta Rows, Inventory Delta, etc., bind to a job's <code>results</code>.
              </p>
              <div className="me-help-from-list">
                {MODAL_BLOCK_TYPES.filter(t => BLOCK_META[t]?.fromHint).map(t => {
                  const m = BLOCK_META[t]!;
                  return (
                    <div key={t} className="me-help-from-row">
                      <div className="me-help-from-row-hdr">
                        <span className="me-help-from-tag" style={{ color: m.color, background: `${m.color}18`, borderColor: `${m.color}44` }}>
                          {t}
                        </span>
                        <span className="me-help-from-name">{m.friendlyName}</span>
                      </div>
                      <div className="me-help-from-hint">{m.fromHint}</div>
                      <pre className="me-help-from-shape">{m.fromShape}</pre>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'actions' && (
            <div className="me-help-section">
              <p className="me-help-p">
                Action types fire when the player taps a button. Each has its own required fields. <code>${'{token}'}</code> syntax also resolves inside action field values.
              </p>
              <div className="me-help-actions-list">
                {MODAL_ACTION_TYPES.map(t => {
                  const m = ACTION_META[t];
                  if (!m) return null;
                  return (
                    <div key={t} className="me-help-action-row">
                      <div className="me-help-action-row-hdr">
                        <span className="me-help-action-name">{m.friendlyName}</span>
                        <code className="me-help-action-code">{t}</code>
                      </div>
                      <div className="me-help-action-desc">{m.description}</div>
                      {m.fields.length > 0 && (
                        <div className="me-help-action-fields">
                          {m.fields.map(f => (
                            <span key={f.name} className="me-help-action-field">
                              <code>{f.name}{f.required ? '*' : ''}</code>
                              {f.hint && <span className="me-help-action-field-hint"> {f.hint}</span>}
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
