import { useState, useCallback, useEffect } from 'react';
import { adminApi } from '../../admin/adminApi';
import { GodModePanel } from '../../admin/GodModePanel';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

type PlayerTab = 'tools' | 'wallet' | 'events';

function WalletTab({ playerId }: { playerId: string }) {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.listPlayerWallets(playerId)
      .then(setWallets)
      .catch((e: any) => setError(e.message || 'Failed to load wallets'))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) return <div className="av2-loading">Loading wallets…</div>;
  if (error) return <div className="av2-inline-msg error" style={{ margin: 16 }}>{error}</div>;
  if (wallets.length === 0) return <div className="av2-empty">No wallets linked to this player.</div>;

  return (
    <div style={{ padding: 16 }}>
      {wallets.map((w: any) => (
        <div key={w.id} className="av2-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="av2-draft-table">{w.chain ?? 'Unknown chain'}</span>
            {w.isPrimary && <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>PRIMARY</span>}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#c0c0e8', wordBreak: 'break-all' }}>
            {w.address}
          </div>
          {w.id && (
            <div style={{ fontSize: 11, color: '#3a3a6a', marginTop: 4 }}>ID: {w.id}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function EventsTab({ playerId }: { playerId: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.listPlayerEvents({ userId: playerId, limit: 30 })
      .then(setEvents)
      .catch((e: any) => setError(e.message || 'Failed to load events'))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) return <div className="av2-loading">Loading events…</div>;
  if (error) return <div className="av2-inline-msg error" style={{ margin: 16 }}>{error}</div>;
  if (events.length === 0) return <div className="av2-empty">No recent events for this player.</div>;

  return (
    <div style={{ padding: 16 }}>
      {events.map((e: any, i: number) => (
        <div key={e.id ?? i} className="av2-stat-row" style={{ padding: '8px 0' }}>
          <span className="av2-draft-table" style={{ flexShrink: 0 }}>{e.eventType ?? e.type ?? '?'}</span>
          <span style={{ fontSize: 11, color: '#6060a0', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {e.payload ? JSON.stringify(e.payload).slice(0, 80) : '—'}
          </span>
          <span style={{ fontSize: 11, color: '#3a3a6a', flexShrink: 0 }}>
            {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

const PLAYER_TABS: { key: PlayerTab; label: string }[] = [
  { key: 'tools', label: 'Player Tools' },
  { key: 'wallet', label: 'Wallet & NFTs' },
  { key: 'events', label: 'Recent Events' },
];

export default function AdminV2PlayersSection({ me }: Props) {
  const canRead = me.role.permissionFlags.player_read;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>('tools');

  const search = useCallback(async (q = query) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.searchPlayers(q.trim());
      setResults(data);
      if (data.length === 0) setError('No players found.');
    } catch (e: any) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const selectPlayer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getPlayer(id);
      setPlayer(data);
      setResults([]);
      setActiveTab('tools');
    } catch (e: any) {
      setError(e.message || 'Failed to load player');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadPlayer = useCallback(async () => {
    if (!player?.id) return;
    try {
      const data = await adminApi.getPlayer(player.id);
      setPlayer(data);
    } catch {}
  }, [player]);

  if (!canRead) {
    return (
      <div className="av2-access-denied">
        <div className="av2-access-denied-icon">🔒</div>
        <div>You don't have player read permissions.</div>
      </div>
    );
  }

  if (player) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="av2-system-tabs" style={{ alignItems: 'center' }}>
          <button
            style={{
              padding: '4px 10px', background: 'none', border: '1px solid #1a1b35',
              borderRadius: 6, color: '#5a5a8a', fontSize: 12, cursor: 'pointer', marginRight: 8,
            }}
            onClick={() => setPlayer(null)}
          >
            ← Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c0c0e8', marginRight: 12 }}>
            {player.username ?? player.id}
          </span>
          {PLAYER_TABS.map(t => (
            <button
              key={t.key}
              className={`av2-system-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {activeTab === 'tools' && (
            <GodModePanel
              player={player}
              onBack={() => setPlayer(null)}
              onReload={reloadPlayer}
            />
          )}
          {activeTab === 'wallet' && <WalletTab playerId={player.id} />}
          {activeTab === 'events' && <EventsTab playerId={player.id} />}
        </div>
      </div>
    );
  }

  return (
    <div className="av2-section-wrap">
      <div className="av2-search-row">
        <input
          type="text"
          className="av2-search-input"
          placeholder="Search by username, email, or player ID…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button
          className="av2-search-btn"
          onClick={() => search()}
          disabled={loading || !query.trim()}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && <div className="av2-inline-msg error">{error}</div>}

      {results.length > 0 && (
        <div>
          {results.map((p: any) => (
            <button
              key={p.id}
              className="av2-player-result"
              onClick={() => selectPlayer(p.id)}
            >
              <div>
                <div className="av2-player-name">{p.username ?? p.id}</div>
                <div className="av2-player-meta">
                  Level {p.keeperLevel} · ID: {p.id}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && !error && (
        <div className="av2-empty">
          Enter a username, email, or player ID to search.
        </div>
      )}
    </div>
  );
}
