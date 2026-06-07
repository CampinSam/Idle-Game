import { useState, useCallback, useEffect, useRef } from 'react';
import { adminApi } from '../../admin/adminApi';
import { GodModePanel } from '../../admin/GodModePanel';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

type PlayerTab = 'tools' | 'wallet' | 'events';

const SUPPORTED_CHAINS = ['CARDANO', 'ETH', 'SOL'];
const PAGE_SIZE = 20;

function WalletTab({ playerId, canWrite }: { playerId: string; canWrite: boolean }) {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chain, setChain] = useState('CARDANO');
  const [address, setAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const [removing, setRemoving] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.listPlayerWallets(playerId)
      .then(setWallets)
      .catch((e: any) => setError(e.message || 'Failed to load wallets'))
      .finally(() => setLoading(false));
  }, [playerId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setAdding(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      await adminApi.addPlayerWallet(playerId, chain, address.trim());
      setAddress('');
      setAddSuccess(`${chain} wallet added successfully.`);
      reload();
    } catch (e: any) {
      setAddError(e.message || 'Failed to add wallet');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (walletId: string) => {
    if (!window.confirm('Remove this wallet from the player?')) return;
    setRemoving(walletId);
    try {
      await adminApi.removePlayerWallet(playerId, walletId);
      reload();
    } catch (e: any) {
      setError(e.message || 'Failed to remove wallet');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {loading && <div className="av2-loading">Loading wallets…</div>}
      {!loading && error && <div className="av2-inline-msg error" style={{ marginBottom: 12 }}>{error}</div>}
      {!loading && wallets.length === 0 && !error && (
        <div className="av2-empty" style={{ marginBottom: 16 }}>No wallets linked to this player.</div>
      )}

      {wallets.map((w: any) => (
        <div key={w.id} className="av2-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="av2-draft-table">{w.chain ?? 'Unknown chain'}</span>
            {w.isPrimary && <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>PRIMARY</span>}
            {canWrite && (
              <button
                style={{
                  marginLeft: 'auto', padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: 4, color: '#f87171',
                  opacity: removing === w.id ? 0.5 : 1,
                }}
                disabled={removing === w.id}
                onClick={() => handleRemove(w.id)}
              >
                {removing === w.id ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#c0c0e8', wordBreak: 'break-all' }}>
            {w.address}
          </div>
          {w.id && (
            <div style={{ fontSize: 11, color: '#3a3a6a', marginTop: 4 }}>ID: {w.id}</div>
          )}
        </div>
      ))}

      {canWrite && (
        <div className="av2-card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 10 }}>
            Add Wallet / Staking Address
          </div>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={chain}
                onChange={e => setChain(e.target.value)}
                style={{
                  background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 4,
                  color: '#c0c0e8', fontSize: 12, padding: '5px 8px', flexShrink: 0,
                }}
              >
                {SUPPORTED_CHAINS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder={chain === 'CARDANO' ? 'addr1… or stake1…' : '0x…'}
                style={{
                  flex: 1, background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 4,
                  color: '#c0c0e8', fontSize: 12, padding: '5px 8px', fontFamily: 'monospace',
                }}
              />
              <button
                type="submit"
                disabled={adding || !address.trim()}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: adding || !address.trim() ? 'rgba(124,58,237,0.2)' : 'rgba(124,58,237,0.5)',
                  border: '1px solid rgba(124,58,237,0.6)', borderRadius: 4, color: '#c4b5fd',
                  flexShrink: 0,
                }}
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
            {addError && <div className="av2-inline-msg error">{addError}</div>}
            {addSuccess && <div className="av2-inline-msg success">{addSuccess}</div>}
          </form>
        </div>
      )}
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

function truncateAddress(addr: string, chars = 8): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export default function AdminV2PlayersSection({ me }: Props) {
  const canRead = me.role.permissionFlags.player_read;
  const canWrite = me.role.permissionFlags.player_write;

  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [player, setPlayer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>('tools');

  // Tracks last page visited in unfiltered browse mode so clearing a search restores it
  const browsePageRef = useRef(1);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listPlayers({ q: q || undefined, page: p, limit: PAGE_SIZE });
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      // Only update the browse-position tracker when not filtering
      if (!q) browsePageRef.current = data.page;
    } catch (e: any) {
      setError(e.message || 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }, []);

  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;

    const params = new URLSearchParams(window.location.search);
    const playerId = params.get('playerId');
    if (playerId && canRead) {
      window.history.replaceState(null, '', window.location.pathname + '#players');
      adminApi.getPlayer(playerId)
        .then(data => { setPlayer(data); setActiveTab('tools'); })
        .catch((e: any) => setError(e.message || 'Failed to load player'));
    }

    if (canRead) fetchPage('', 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    const q = query.trim();
    setCommittedQuery(q);
    fetchPage(q, 1);
  }, [query, fetchPage]);

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (val === '') {
      setCommittedQuery('');
      // Restore the browse page the admin was on before searching
      fetchPage('', browsePageRef.current);
    }
  }, [fetchPage]);

  const goToPage = useCallback((p: number) => {
    fetchPage(committedQuery, p);
  }, [committedQuery, fetchPage]);

  const selectPlayer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getPlayer(id);
      setPlayer(data);
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
          {activeTab === 'wallet' && <WalletTab playerId={player.id} canWrite={!!canWrite} />}
          {activeTab === 'events' && <EventsTab playerId={player.id} />}
        </div>
      </div>
    );
  }

  return (
    <div className="av2-section-wrap" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="av2-search-row">
        <input
          type="text"
          className="av2-search-input"
          placeholder="Filter by username, email, or player ID…"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button
          className="av2-search-btn"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && <div className="av2-inline-msg error">{error}</div>}

      <div style={{ fontSize: 11, color: '#3a3a6a', padding: '4px 0 6px', flexShrink: 0 }}>
        {total > 0 ? `${total} player${total !== 1 ? 's' : ''}${committedQuery ? ' matching' : ''}` : (!loading ? 'No players found.' : '')}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && items.length === 0 && (
          <div className="av2-loading">Loading players…</div>
        )}
        {items.map((p: any) => (
          <button
            key={p.id}
            className="av2-player-result"
            onClick={() => selectPlayer(p.id)}
            style={{ width: '100%', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="av2-player-name">{p.username ?? <span style={{ color: '#4a4a7a' }}>(no username)</span>}</span>
                <span style={{ fontSize: 10, color: '#4a4a7a' }}>Lv {p.keeperLevel ?? 0}</span>
              </div>
              {p.email && (
                <div style={{ fontSize: 11, color: '#5a5a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.email}
                </div>
              )}
              {p.primaryWallet && (
                <div style={{ fontSize: 11, color: '#4a4a7a', fontFamily: 'monospace', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 9, color: '#6060a0', fontFamily: 'sans-serif', fontWeight: 700,
                    background: 'rgba(96,96,160,0.12)', borderRadius: 3, padding: '1px 4px', flexShrink: 0,
                  }}>
                    {p.primaryWallet.chain}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncateAddress(p.primaryWallet.address)}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 10, color: '#2a2a4a', marginTop: 1 }}>
                ID: {p.id}
              </div>
            </div>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '10px 0 4px', flexShrink: 0, borderTop: '1px solid #0f0f22',
        }}>
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            style={{
              padding: '3px 10px', fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer',
              background: 'none', border: '1px solid #1a1b35', borderRadius: 4,
              color: page <= 1 ? '#2a2a4a' : '#7070b0',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 11, color: '#5a5a8a' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading}
            style={{
              padding: '3px 10px', fontSize: 12, cursor: page >= totalPages ? 'default' : 'pointer',
              background: 'none', border: '1px solid #1a1b35', borderRadius: 4,
              color: page >= totalPages ? '#2a2a4a' : '#7070b0',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
