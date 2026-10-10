import { useState, useMemo, useEffect, useRef } from 'react';
import { COMPONENT_META, COMPONENT_GROUP_ORDER, NO_PROPS_COMPONENTS, STUB_COMPONENTS } from './screen-composer-meta';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (componentKey: string) => void;
}

export default function SectionPicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
    return COMPONENT_GROUP_ORDER.map(group => {
      const entries = Object.entries(COMPONENT_META).filter(([key, m]) => {
        if (m.group !== group) return false;
        if (!q) return true;
        return `${key} ${m.friendlyName} ${m.description}`.toLowerCase().includes(q);
      });
      return { group, entries };
    }).filter(g => g.entries.length > 0);
  }, [query]);

  if (!open) return null;

  const totalMatches = groups.reduce((acc, g) => acc + g.entries.length, 0);

  return (
    <div style={styles.backdrop}>
      <div ref={rootRef} style={styles.panel}>
        {/* Header */}
        <div style={styles.searchWrap}>
          <input
            autoFocus
            style={styles.searchInput}
            placeholder="Search components…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button type="button" onClick={onClose} style={styles.closeBtn}>Close</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {totalMatches === 0 && (
            <div style={styles.empty}>No components match "{query}".</div>
          )}
          {groups.map(({ group, entries }) => (
            <div key={group} style={styles.group}>
              <div style={styles.groupTitle}>{group}</div>
              <div style={styles.grid}>
                {entries.map(([key, m]) => {
                  const isStub = STUB_COMPONENTS.has(key);
                  const noProps = NO_PROPS_COMPONENTS.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      style={{ ...styles.card, borderColor: `${m.color}55` }}
                      onClick={() => { onPick(key); onClose(); }}
                    >
                      {/* Header row: tag + friendly name */}
                      <div style={styles.cardHdr}>
                        <span style={{ ...styles.cardTag, color: m.color, background: `${m.color}18`, borderColor: `${m.color}44` }}>
                          {key}
                        </span>
                        <div style={styles.cardBadges}>
                          {isStub && (
                            <span style={styles.stubBadge}>STUB</span>
                          )}
                          {noProps && (
                            <span style={styles.noPropsBadge}>no props</span>
                          )}
                        </div>
                      </div>
                      {/* Friendly name */}
                      <div style={styles.cardName}>{m.friendlyName}</div>
                      {/* Preview thumbnail */}
                      <div style={styles.cardPrev}>{m.preview()}</div>
                      {/* Description */}
                      <div style={styles.cardDesc}>{m.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '60px 16px 24px',
    overflowY: 'auto',
  },
  panel: {
    background: '#0f0f2e',
    border: '1px solid rgba(139,92,246,0.25)',
    borderRadius: 10,
    width: '100%',
    maxWidth: 780,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 84px)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    borderBottom: '1px solid rgba(139,92,246,0.15)',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: 6,
    padding: '7px 12px',
    color: '#e0e0ff',
    fontSize: 13,
    outline: 'none',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '6px 12px',
    color: '#aaa',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  body: {
    overflowY: 'auto',
    padding: '14px 14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  empty: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    padding: '32px 0',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#7c7fa0',
    paddingBottom: 4,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
    gap: 8,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid',
    borderRadius: 8,
    padding: '9px 10px 8px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    transition: 'background 0.12s',
  },
  cardHdr: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 5,
    flexWrap: 'wrap',
  },
  cardTag: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.04em',
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 5px',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardBadges: {
    display: 'flex',
    gap: 3,
    flexWrap: 'wrap',
    marginLeft: 'auto',
  },
  stubBadge: {
    fontSize: 8,
    fontWeight: 700,
    color: '#fb923c',
    background: 'rgba(251,146,60,0.12)',
    border: '1px solid rgba(251,146,60,0.3)',
    borderRadius: 3,
    padding: '1px 4px',
    letterSpacing: '0.05em',
  },
  noPropsBadge: {
    fontSize: 8,
    fontWeight: 600,
    color: '#64748b',
    background: 'rgba(100,116,139,0.1)',
    border: '1px solid rgba(100,116,139,0.25)',
    borderRadius: 3,
    padding: '1px 4px',
  },
  cardName: {
    fontSize: 11,
    fontWeight: 600,
    color: '#e0e0ff',
    lineHeight: 1.3,
  },
  cardPrev: {
    minHeight: 52,
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 5,
    padding: '4px 6px',
    overflow: 'hidden',
  },
  cardDesc: {
    fontSize: 10,
    color: '#7c7fa0',
    lineHeight: 1.4,
  },
};
