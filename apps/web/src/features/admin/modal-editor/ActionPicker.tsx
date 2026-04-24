import { useState, useMemo } from 'react';
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
    <div className="me-action-picker">
      <button
        type="button"
        className="me-action-picker-current"
        onClick={() => setOpen(o => !o)}
      >
        <span className="me-action-picker-current-name">
          {currentMeta?.friendlyName ?? current}
        </span>
        <span className="me-action-picker-current-code">{current}</span>
        <span className="me-action-picker-chev">{open ? '▲' : '▼'}</span>
      </button>
      {currentMeta && (
        <div className="me-action-picker-desc">
          {currentMeta.description}
          {currentMeta.fields.length > 0 && (
            <span className="me-action-picker-fields">
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
        <div className="me-action-picker-menu">
          <input
            autoFocus
            className="me-picker-search"
            placeholder="Search actions…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="me-action-picker-list">
            {filtered.length === 0 && (
              <div className="me-picker-empty">No actions match "{query}".</div>
            )}
            {filtered.map(t => {
              const m = ACTION_META[t];
              const isActive = t === current;
              return (
                <button
                  key={t}
                  type="button"
                  className={`me-action-picker-opt ${isActive ? 'me-action-picker-opt-active' : ''}`}
                  onClick={() => { onPick(t); setOpen(false); }}
                >
                  <div className="me-action-picker-opt-hdr">
                    <span className="me-action-picker-opt-name">{m?.friendlyName ?? t}</span>
                    <code className="me-action-picker-opt-code">{t}</code>
                  </div>
                  <div className="me-action-picker-opt-desc">{m?.description}</div>
                  {m && m.fields.length > 0 && (
                    <div className="me-action-picker-opt-fields">
                      {m.fields.map(f => (
                        <span key={f.name} className="me-action-picker-field">
                          <code>{f.name}{f.required ? '*' : ''}</code>
                          {f.hint && <span className="me-action-picker-field-hint"> — {f.hint}</span>}
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
