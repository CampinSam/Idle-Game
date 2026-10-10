import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../adminApi';
import type { TelemetryDefWithCountsDto } from '@derp/shared';

const PANEL_BG = '#0d1526';
const CARD_BG = '#0a1020';
const BORDER = '#1e2a3a';
const GREEN = '#059669';
const RED = '#dc2626';

function formatCount(count: string): string {
  const n = BigInt(count);
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`;
  return n.toString();
}

function StatusBadge({
  enabled,
  startDate,
  endDate,
}: {
  enabled: boolean;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const now = new Date();
  const started = !startDate || now >= new Date(startDate);
  const notEnded = !endDate || now <= new Date(endDate);
  const live = enabled && started && notEnded;

  let label = 'Disabled';
  let color = '#6b7280';

  if (enabled && !started) { label = 'Scheduled'; color = '#f59e0b'; }
  else if (enabled && !notEnded) { label = 'Ended'; color = '#6b7280'; }
  else if (live) { label = 'Live'; color = GREEN; }

  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      background: color + '22', color, border: `1px solid ${color}55`,
      padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

interface CounterRowProps {
  subEventKey: string;
  eventType: string;
  count: string;
  lastIncrementedAt: string;
}

function CounterRow({ subEventKey, eventType, count, lastIncrementedAt }: CounterRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: 12,
    }}>
      <span style={{
        fontFamily: 'monospace', background: '#1a1a3a',
        padding: '1px 6px', borderRadius: 3, color: '#c0c8ff', minWidth: 120,
      }}>{subEventKey}</span>
      <span style={{
        fontSize: 10, background: '#1a2e1a', color: '#6adc6a',
        padding: '1px 6px', borderRadius: 3, minWidth: 110,
      }}>{eventType}</span>
      <span style={{
        fontFamily: 'monospace', fontWeight: 700, fontSize: 18,
        color: '#f0f4ff', minWidth: 70, textAlign: 'right',
      }}>{formatCount(count)}</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: '#555', fontSize: 10 }}>
        Last: {new Date(lastIncrementedAt).toLocaleString()}
      </span>
    </div>
  );
}

interface DefCardProps {
  def: TelemetryDefWithCountsDto;
  onResetCounts: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
}

function DefCard({ def, onResetCounts, onEdit, onDelete }: DefCardProps) {
  const [expanded, setExpanded] = useState(false);
  const countMap = new Map(def.counts.map((c) => [c.subEventKey, c]));

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span style={{ color: '#6366f1', fontSize: 11 }}>{expanded ? '▾' : '▸'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: '#f0f4ff', fontSize: 14 }}>{def.name}</span>
            <StatusBadge enabled={def.enabled} startDate={def.startDate} endDate={def.endDate} />
            <span style={{ fontSize: 10, color: '#555' }}>
              {def.subEvents.length} counter{def.subEvents.length !== 1 ? 's' : ''}
            </span>
          </div>
          {def.description && (
            <div style={{ color: '#8896aa', fontSize: 11, marginTop: 2 }}>{def.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(def.id); }}
            style={{ ...btnStyle, background: '#1a2a4a', color: '#93c5fd', borderColor: '#234' }}
          >Edit</button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Reset all counts for "${def.name}"?`)) onResetCounts(def.id);
            }}
            style={{ ...btnStyle, background: '#2a1a0a', color: '#f59e0b', borderColor: '#432' }}
          >Reset</button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${def.name}"? This cannot be undone.`)) onDelete(def.id);
            }}
            style={{ ...btnStyle, background: '#2a0a0a', color: '#f87171', borderColor: '#422' }}
          >Delete</button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${BORDER}` }}>
          {def.subEvents.length === 0 ? (
            <div style={{ padding: '12px 14px', color: '#555', fontSize: 12, fontStyle: 'italic' }}>
              No sub-event counters configured.
            </div>
          ) : (
            def.subEvents.map((se) => {
              const cnt = countMap.get(se.key);
              return (
                <CounterRow
                  key={se.key}
                  subEventKey={se.key}
                  eventType={se.eventType}
                  count={cnt?.count ?? '0'}
                  lastIncrementedAt={cnt?.lastIncrementedAt ?? new Date().toISOString()}
                />
              );
            })
          )}
          {(def.startDate || def.endDate) && (
            <div style={{ padding: '6px 14px', color: '#555', fontSize: 10, borderTop: `1px solid ${BORDER}` }}>
              {def.startDate && <span>Start: {new Date(def.startDate).toLocaleString()} </span>}
              {def.endDate && <span>End: {new Date(def.endDate).toLocaleString()}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  border: '1px solid', borderRadius: 4,
};

async function fetchTelemetryDefs(): Promise<TelemetryDefWithCountsDto[]> {
  const list: any[] = await (adminApi as any).telemetryList();
  const withCounts: TelemetryDefWithCountsDto[] = await Promise.all(
    list.map((d: any) => (adminApi as any).telemetryGet(d.id)),
  );
  return withCounts;
}

interface TelemetryAdminPageProps {
  embedded?: boolean;
}

export default function TelemetryAdminPage({ embedded }: TelemetryAdminPageProps = {}) {
  const navigate = useNavigate();
  const [defs, setDefs] = useState<TelemetryDefWithCountsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadDefs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTelemetryDefs();
      setDefs(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load telemetry definitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDefs(); }, [loadDefs]);

  const handleResetCounts = async (id: string) => {
    try {
      await (adminApi as any).telemetryResetCounts(id);
      await loadDefs();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await (adminApi as any).telemetryDelete(id);
      await loadDefs();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const filtered = defs.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.description ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div style={{
      minHeight: '100vh', background: PANEL_BG, color: '#d0d8e8',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          {!embedded && (
            <button
              onClick={() => navigate('/admin')}
              style={{ ...btnStyle, background: 'transparent', color: '#6b7280', borderColor: '#1e2a3a', fontSize: 13 }}
            >← Admin</button>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0f4ff', margin: 0 }}>
              Telemetry Definitions
            </h1>
            <p style={{ fontSize: 12, color: '#8896aa', margin: '4px 0 0' }}>
              Data-driven aggregate event counters with RichSelection filters
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/def/TelemetryDef/new')}
            style={{ ...btnStyle, background: GREEN, color: '#fff', borderColor: GREEN, fontSize: 12, padding: '6px 14px' }}
          >+ New Definition</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search telemetry definitions…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', background: '#060d1a',
              border: `1px solid ${BORDER}`, borderRadius: 6, color: '#d0d8e8',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>Loading…</div>
        )}
        {error && (
          <div style={{
            padding: '12px 16px', background: '#2a0a0a', border: `1px solid ${RED}55`,
            borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16,
          }}>
            {error}
            <button
              onClick={loadDefs}
              style={{ ...btnStyle, marginLeft: 12, borderColor: '#422', color: '#f87171', background: 'transparent' }}
            >Retry</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 60, color: '#555', fontSize: 14,
            border: `1px dashed ${BORDER}`, borderRadius: 8,
          }}>
            {searchQuery
              ? 'No definitions match your search.'
              : 'No telemetry definitions yet. Create one to start tracking events.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((def) => (
            <DefCard
              key={def.id}
              def={def}
              onResetCounts={handleResetCounts}
              onEdit={(id) => navigate(`/admin/def/TelemetryDef/${id}`)}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {!loading && defs.length > 0 && (
          <div style={{ marginTop: 20, textAlign: 'right', color: '#555', fontSize: 11 }}>
            {filtered.length} of {defs.length} definition{defs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
