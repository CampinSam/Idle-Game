import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../adminApi';
import { TELEMETRY_EVENT_TYPES } from '@derp/shared';

const PANEL_BG = '#0d1526';
const CARD_BG = '#0a1020';
const BORDER = '#1e2a3a';
const RED = '#dc2626';

const btnStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  border: '1px solid', borderRadius: 4,
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', background: '#060d1a', border: `1px solid ${BORDER}`,
  borderRadius: 5, color: '#d0d8e8', fontSize: 12, outline: 'none',
};

interface PlayerEvent {
  id: string;
  userId: string;
  eventType: string;
  key: string | null;
  amount: number;
  data: Record<string, unknown>;
  createdAt: string;
}

function EventRow({ ev }: { ev: PlayerEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = ev.data && Object.keys(ev.data).length > 0;

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden',
    }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr 1fr 80px 80px 160px',
          alignItems: 'center', gap: 8, padding: '7px 12px',
          fontSize: 12, cursor: hasData ? 'pointer' : 'default',
        }}
        onClick={() => hasData && setExpanded((e) => !e)}
      >
        <span style={{ fontFamily: 'monospace', color: '#9d96ff', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.id}>
          {ev.id}
        </span>
        <span style={{ fontFamily: 'monospace', color: '#7dd3fc', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.userId}>
          {ev.userId}
        </span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 3,
          background: 'rgba(99,102,241,0.15)', color: '#818cf8',
          fontSize: 11, whiteSpace: 'nowrap',
        }}>
          {ev.eventType}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.key ?? '—'}
        </span>
        <span style={{ color: '#fbbf24', fontSize: 12, textAlign: 'right' }}>
          {ev.amount}
        </span>
        <span style={{ color: '#475569', fontSize: 10, textAlign: 'right' }}>
          {new Date(ev.createdAt).toLocaleString()}
        </span>
      </div>
      {expanded && hasData && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 12px' }}>
          <pre style={{
            margin: 0, fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', fontFamily: 'monospace',
          }}>
            {JSON.stringify(ev.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function PlayerEventsAdminPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [eventType, setEventType] = useState('');
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listPlayerEvents({ userId: userId || undefined, eventType: eventType || undefined, limit });
      setEvents(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load player events');
    } finally {
      setLoading(false);
    }
  }, [userId, eventType, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: PANEL_BG, color: '#d0d8e8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate('/admin')}
            style={{ ...btnStyle, background: 'transparent', color: '#6b7280', borderColor: BORDER, fontSize: 13 }}
          >← Admin</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0f4ff', margin: 0 }}>Player Events</h1>
            <p style={{ fontSize: 12, color: '#8896aa', margin: '4px 0 0' }}>
              Read-only telemetry event history — filter by player or event type
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Filter by userId…"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ ...inputStyle, minWidth: 260, flex: 1 }}
          />
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            style={{ ...inputStyle, minWidth: 200 }}
          >
            <option value="">All event types</option>
            {TELEMETRY_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ ...inputStyle, minWidth: 100 }}
          >
            <option value={25}>Last 25</option>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
          </select>
          <button
            onClick={load}
            style={{ ...btnStyle, background: '#1e3a5f', color: '#93c5fd', borderColor: '#234', padding: '6px 14px', fontSize: 12 }}
          >Refresh</button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', background: '#2a0a0a', border: `1px solid ${RED}55`,
            borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16,
          }}>
            {error}
            <button onClick={load} style={{ ...btnStyle, marginLeft: 12, borderColor: '#422', color: '#f87171', background: 'transparent' }}>Retry</button>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr 1fr 80px 80px 160px',
            gap: 8, padding: '4px 12px', marginBottom: 4, fontSize: 10,
            color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>ID</span>
            <span>User ID</span>
            <span>Event Type</span>
            <span>Key</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span style={{ textAlign: 'right' }}>Created At</span>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>Loading…</div>
        )}

        {!loading && !error && events.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 60, color: '#555', fontSize: 14,
            border: `1px dashed ${BORDER}`, borderRadius: 8,
          }}>
            No events found. Try adjusting your filters.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>

        {!loading && events.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'right', color: '#555', fontSize: 11 }}>
            Showing {events.length} event{events.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
