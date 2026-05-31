import { useState, useCallback } from 'react';
import { adminApi } from '../../admin/adminApi';
import { GodModePanel } from '../../admin/GodModePanel';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

export default function AdminV2PlayersSection({ me }: Props) {
  const canRead = me.role.permissionFlags.player_read;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div style={{ height: '100%', overflow: 'auto' }}>
        <GodModePanel
          player={player}
          onBack={() => setPlayer(null)}
          onReload={reloadPlayer}
        />
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
