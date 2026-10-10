import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '../../admin/adminApi';

interface GlobalPower {
  id: string;
  label: string;
  effectDefId: string | null;
  effectOverrides?: Record<string, any>;
  selection?: Record<string, any>;
  durationMinutes: number;
  status: string;
  scheduledFor?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  triggeredByUserId?: string | null;
  createdAt: string;
}

interface EffectDef {
  id: string;
  name?: string;
  key?: string;
}

type ViewMode = 'list' | 'create';

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active:    { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
    scheduled: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    expired:   { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
    cancelled: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
  };
  const s = map[status] ?? { bg: 'rgba(167,139,250,0.1)', color: '#a78bfa' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}

function SearchableEffectSelect({
  effectDefs,
  value,
  onChange,
}: {
  effectDefs: EffectDef[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLabel = value
    ? (() => {
        const ef = effectDefs.find(e => e.id === value);
        return ef ? (ef.name || ef.key || ef.id) : value;
      })()
    : '';

  const filtered = effectDefs.filter(ef => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      ef.id.toLowerCase().includes(q) ||
      (ef.name || '').toLowerCase().includes(q) ||
      (ef.key || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    background: '#111128', border: '1px solid #2a2a4e', borderRadius: 6,
    color: '#e0e0ff', fontSize: 13, outline: 'none',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {open ? (
        <input
          autoFocus
          style={{ ...inputStyle, borderColor: 'rgba(167,139,250,0.6)' }}
          placeholder="Search effect definitions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      ) : (
        <div
          style={{ ...inputStyle, cursor: 'pointer', color: value ? '#e0e0ff' : '#4a4a7a' }}
          onClick={() => { setOpen(true); setQuery(''); }}
        >
          {value ? displayLabel : '— none / manual effect —'}
        </div>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#111128', border: '1px solid #2a2a4e', borderRadius: 6,
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div
            style={{ padding: '8px 12px', fontSize: 13, color: '#6060a0', cursor: 'pointer' }}
            onMouseDown={() => { onChange(''); setOpen(false); setQuery(''); }}
          >
            — none / manual effect —
          </div>
          {filtered.map(ef => (
            <div
              key={ef.id}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                color: ef.id === value ? '#a78bfa' : '#e0e0ff',
                background: ef.id === value ? 'rgba(167,139,250,0.1)' : 'transparent',
              }}
              onMouseDown={() => { onChange(ef.id); setOpen(false); setQuery(''); }}
              onMouseEnter={e => { if (ef.id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (ef.id !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 600 }}>{ef.name || ef.key || ef.id}</span>
              {ef.id !== (ef.name || ef.key) && (
                <span style={{ marginLeft: 8, color: '#4a4a7a', fontSize: 11 }}>{ef.id}</span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#4a4a7a' }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

interface CreateFormProps {
  effectDefs: EffectDef[];
  onCreated: () => void;
  onCancel: () => void;
}

function CreateForm({ effectDefs, onCreated, onCancel }: CreateFormProps) {
  const [label, setLabel] = useState('');
  const [effectDefId, setEffectDefId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { setError('Label is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await adminApi.createGlobalPower({
        label: label.trim(),
        effectDefId: effectDefId || null,
        durationMinutes,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create global power');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    background: '#111128', border: '1px solid #2a2a4e', borderRadius: 6,
    color: '#e0e0ff', fontSize: 13, outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#6060a0',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
  };

  const durationDisplay = durationMinutes < 60
    ? `${durationMinutes}m`
    : durationMinutes % 60 === 0
      ? `${durationMinutes / 60}h`
      : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 540 }}>
      <div>
        <label style={labelStyle}>Label *</label>
        <input
          style={inputStyle}
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Double XP Weekend"
          autoFocus
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; }}
        />
      </div>

      <div>
        <label style={labelStyle}>Effect Definition</label>
        <SearchableEffectSelect
          effectDefs={effectDefs}
          value={effectDefId}
          onChange={setEffectDefId}
        />
        <div style={{ fontSize: 11, color: '#4a4a7a', marginTop: 4 }}>
          Leave blank to create a global power without a linked effect definition.
        </div>
      </div>

      <div>
        <label style={labelStyle}>Duration (minutes) *</label>
        <input
          type="number"
          style={inputStyle}
          value={durationMinutes}
          min={1}
          max={10080}
          onChange={e => setDurationMinutes(Number(e.target.value))}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; }}
        />
        <div style={{ fontSize: 11, color: '#4a4a7a', marginTop: 4 }}>{durationDisplay}</div>
      </div>

      <div>
        <label style={labelStyle}>Schedule For (optional)</label>
        <input
          type="datetime-local"
          style={{ ...inputStyle, colorScheme: 'dark' }}
          value={scheduledFor}
          onChange={e => setScheduledFor(e.target.value)}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; }}
        />
        <div style={{ fontSize: 11, color: '#4a4a7a', marginTop: 4 }}>
          Leave blank to activate immediately. Set a future time to schedule.
        </div>
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: 12, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 6, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 20px', background: saving ? '#333' : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
            border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Creating…' : scheduledFor ? 'Schedule Global Power' : 'Activate Global Power'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 20px', background: 'transparent', border: '1px solid #2a2a4e',
            borderRadius: 6, color: '#6060a0', fontSize: 13, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminV2LiveOpsSection() {
  const [powers, setPowers] = useState<GlobalPower[]>([]);
  const [effectDefs, setEffectDefs] = useState<EffectDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ps, eds] = await Promise.all([
        adminApi.getGlobalPowers(showAll),
        adminApi.getEffectDefs(),
      ]);
      setPowers(Array.isArray(ps) ? ps : []);
      setEffectDefs(Array.isArray(eds) ? eds : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load global powers');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this global power? It will end immediately.')) return;
    setCancelling(id);
    try {
      await adminApi.cancelGlobalPower(id);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const handleCreated = () => {
    setViewMode('list');
    load();
  };

  if (viewMode === 'create') {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            style={{ background: 'none', border: 'none', color: '#6060a0', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >
            ← Back
          </button>
          <span style={{ color: '#3a3a5a', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#d4d4f0' }}>Create Global Power</span>
        </div>
        <CreateForm
          effectDefs={effectDefs}
          onCreated={handleCreated}
          onCancel={() => setViewMode('list')}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#d4d4f0', marginBottom: 2 }}>Global Powers</div>
          <div style={{ fontSize: 12, color: '#4a4a7a' }}>
            Server-wide effects applied to all or a segment of players for a fixed duration.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6060a0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show expired
        </label>
        <button
          type="button"
          onClick={() => setViewMode('create')}
          style={{
            padding: '8px 16px', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
            border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Global Power
        </button>
      </div>

      {error && (
        <div style={{ color: '#f87171', fontSize: 12, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ color: '#4a4a7a', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Loading…</div>
      )}

      {!loading && powers.length === 0 && (
        <div style={{ color: '#4a4a7a', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No global powers{showAll ? '' : ' active'}. Create one to get started.
        </div>
      )}

      {!loading && powers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #1a1b35', borderRadius: 8, overflow: 'hidden' }}>
          {powers.map((p, i) => (
            <div
              key={p.id}
              style={{
                padding: '14px 18px',
                borderBottom: i < powers.length - 1 ? '1px solid #1a1b35' : 'none',
                background: i % 2 === 0 ? '#0d0e1f' : '#0a0b1c',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#d4d4f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: '#4a4a7a' }}>
                  {p.effectDefId && (
                    <span>Effect: <span style={{ color: '#8080c8' }}>{p.effectDefId}</span></span>
                  )}
                  <span>Duration: <span style={{ color: '#8080c8' }}>{p.durationMinutes}m</span></span>
                  {p.startedAt && <span>Started: <span style={{ color: '#8080c8' }}>{formatDate(p.startedAt)}</span></span>}
                  {p.endsAt && <span>Ends: <span style={{ color: '#8080c8' }}>{formatDate(p.endsAt)}</span></span>}
                  {p.scheduledFor && !p.startedAt && <span>Scheduled: <span style={{ color: '#fbbf24' }}>{formatDate(p.scheduledFor)}</span></span>}
                  <span style={{ color: '#2a2a4e' }}>Created: {formatDate(p.createdAt)}</span>
                </div>
              </div>
              {(p.status === 'active' || p.status === 'scheduled') && (
                <button
                  type="button"
                  disabled={cancelling === p.id}
                  onClick={() => handleCancel(p.id)}
                  style={{
                    padding: '5px 12px', background: 'transparent',
                    border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6,
                    color: '#f87171', cursor: cancelling === p.id ? 'not-allowed' : 'pointer',
                    fontSize: 12, flexShrink: 0, opacity: cancelling === p.id ? 0.5 : 1,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.7)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                >
                  {cancelling === p.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
