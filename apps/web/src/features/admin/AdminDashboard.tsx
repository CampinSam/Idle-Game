import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Zap, Bell, Gift, Database, LogOut, PanelLeftClose, PanelLeft, Image, Music, BarChart3, Tag as TagIcon, Wrench, Flame } from 'lucide-react';
import { adminApi, getAdminKey, setAdminKey } from './adminApi';
import { GodModePanel } from './GodModePanel';
import './admin.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (loginKey: string) => {
    setLoading(true);
    setError('');
    setAdminKey(loginKey);
    try {
      await adminApi.getTables();
      onLogin();
    } catch {
      setError('Invalid admin key');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  useEffect(() => {
    if (import.meta.env.DEV && DEV_ADMIN_KEY && !autoSubmitted.current) {
      autoSubmitted.current = true;
      doLogin(DEV_ADMIN_KEY);
    }
  }, [doLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(key);
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1>Derp Universe Admin</h1>
        <input
          type="password"
          placeholder="Admin Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Enter'}
        </button>
        {error && <div className="admin-error">{error}</div>}
      </form>
    </div>
  );
}

function StatusMsg({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      borderRadius: 6,
      marginTop: '0.75rem',
      fontSize: '0.85rem',
      background: type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
      color: type === 'success' ? '#4caf50' : '#ff6b6b',
      border: `1px solid ${type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
    }}>{msg}</div>
  );
}

function PlayerPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const search = useCallback(async (q = query) => {
    setLoading(true);
    setMsg(null);
    try {
      const r = await adminApi.searchPlayers(q);
      setResults(r);
      if (r.length === 0) setMsg({ text: 'No players found', type: 'error' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { search(''); }, []);

  const loadPlayer = async (id: string) => {
    setLoading(true);
    setMsg(null);
    try {
      const p = await adminApi.getPlayer(id);
      setPlayer(p);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Player Editor</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by username or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(query)}
          style={{ flex: 1, padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem' }}
        />
        <button onClick={() => search(query)} disabled={loading} className="btn-save" style={{ padding: '0.6rem 1.25rem' }}>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && !player && (
        <div style={{ marginBottom: '1rem' }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => loadPlayer(r.id)}
              style={{
                display: 'block', width: '100%', padding: '0.6rem 0.75rem', marginBottom: 4,
                border: '1px solid #2a2a4e', borderRadius: 6, background: '#16213e', color: '#e0e0ff',
                cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem',
              }}
            >
              <strong>{r.username}</strong> <span style={{ color: '#888', marginLeft: 8 }}>{r.email}</span>
              <span style={{ color: '#666', marginLeft: 8, fontSize: '0.75rem' }}>Lv.{r.keeperLevel}</span>
            </button>
          ))}
        </div>
      )}

      {player && (
        <GodModePanel
          player={player}
          onBack={() => { setPlayer(null); setMsg(null); search(''); }}
          onReload={() => loadPlayer(player.id)}
        />
      )}

      {msg && !player && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function BoostPanel() {
  const [boosts, setBoosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({ name: '', description: '', multiplier: '2', durationMinutes: '30' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await adminApi.listBoosts();
      setBoosts(b);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setMsg(null);
    try {
      await adminApi.createBoost({
        name: form.name || 'Admin Boost',
        description: form.description || undefined,
        multiplier: Number(form.multiplier),
        durationMinutes: Number(form.durationMinutes),
      });
      setMsg({ text: 'Boost created', type: 'success' });
      setForm({ name: '', description: '', multiplier: '2', durationMinutes: '30' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this boost?')) return;
    setMsg(null);
    try {
      await adminApi.cancelBoost(id);
      setMsg({ text: 'Boost cancelled', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Tick Boosts</h2>

      <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#b8b8ff' }}>Create Boost</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div className="form-field">
            <label>Name</label>
            <input type="text" placeholder="Boost name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Multiplier</label>
            <input type="number" step="0.1" min="0.1" max="10" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Duration (min)</label>
            <input type="number" min="1" max="1440" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          </div>
        </div>
        <div className="form-field" style={{ marginTop: '0.5rem' }}>
          <label>Description (optional)</label>
          <input type="text" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <button onClick={create} className="btn-save" style={{ marginTop: '0.75rem' }}>Create Boost</button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {boosts.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Multiplier</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {boosts.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.multiplier}x</td>
                  <td><span className={`boost-status boost-${b.status}`}>{b.status}</span></td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(b.startTime).toLocaleString()}</td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(b.endTime).toLocaleString()}</td>
                  <td>
                    {b.status === 'active' && (
                      <button onClick={() => cancel(b.id)} className="btn-delete">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function NotificationPanel() {
  const [playerQuery, setPlayerQuery] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [form, setForm] = useState({ type: 'admin_test', category: 'general', priority: 'normal', title: '', body: '' });
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const searchPlayer = async (q = playerQuery) => {
    try {
      const r = await adminApi.searchPlayers(q);
      setPlayers(r);
    } catch {}
  };

  useEffect(() => { searchPlayer(''); }, []);

  const send = async () => {
    if (!selectedPlayer) return;
    if (!form.title.trim()) { setMsg({ text: 'Title is required', type: 'error' }); return; }
    setMsg(null);
    try {
      await adminApi.sendNotification({
        userId: selectedPlayer.id,
        type: form.type,
        category: form.category,
        priority: form.priority,
        title: form.title,
        body: form.body,
      });
      setMsg({ text: `Notification sent to ${selectedPlayer.username}`, type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Test Notifications</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.9rem', color: '#b8b8ff' }}>Target Player</label>
        {selectedPlayer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#e0e0ff' }}>{selectedPlayer.username}</span>
            <span style={{ color: '#666', fontSize: '0.8rem' }}>{selectedPlayer.email}</span>
            <button onClick={() => { setSelectedPlayer(null); setPlayerQuery(''); searchPlayer(''); }} style={{ padding: '0.2rem 0.5rem', border: '1px solid #555', borderRadius: 4, background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.75rem' }}>Change</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Search player..."
              value={playerQuery}
              onChange={(e) => setPlayerQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchPlayer(playerQuery)}
              style={{ flex: 1, padding: '0.5rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem' }}
            />
            <button onClick={() => searchPlayer(playerQuery)} className="btn-save" style={{ padding: '0.5rem 1rem' }}>Find</button>
          </div>
        )}
        {players.length > 0 && !selectedPlayer && (
          <div style={{ marginTop: 4 }}>
            {players.map((p) => (
              <button key={p.id} onClick={() => { setSelectedPlayer(p); setPlayers([]); }} style={{
                display: 'block', width: '100%', padding: '0.5rem', marginBottom: 2, border: '1px solid #2a2a4e',
                borderRadius: 4, background: '#16213e', color: '#e0e0ff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
              }}>
                {p.username} <span style={{ color: '#888' }}>{p.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlayer && (
        <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-field">
              <label>Type</label>
              <input type="text" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem', width: '100%' }}>
                <option value="general">general</option>
                <option value="reward">reward</option>
                <option value="system">system</option>
                <option value="social">social</option>
              </select>
            </div>
            <div className="form-field">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem', width: '100%' }}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
          </div>
          <div className="form-field">
            <label>Title</label>
            <input type="text" placeholder="Notification title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Body</label>
            <textarea
              rows={3}
              placeholder="Notification body text"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <button onClick={send} className="btn-save">Send Notification</button>
        </div>
      )}

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function EventGiftPanel() {
  const [playerQuery, setPlayerQuery] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [mode, setMode] = useState<'event' | 'gift'>('event');
  const [eventForm, setEventForm] = useState({ defId: '', payload: '{ "giftDefId": "" }' });
  const [giftForm, setGiftForm] = useState({ giftDefId: '' });
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const searchPlayer = async (q = playerQuery) => {
    try {
      const r = await adminApi.searchPlayers(q);
      setPlayers(r);
    } catch {}
  };

  useEffect(() => { searchPlayer(''); }, []);

  const dispatchEvent = async () => {
    if (!selectedPlayer) return;
    if (!eventForm.defId.trim()) { setMsg({ text: 'Event Def ID is required', type: 'error' }); return; }
    setMsg(null);
    try {
      let payload = {};
      try { payload = JSON.parse(eventForm.payload); } catch { setMsg({ text: 'Invalid payload JSON', type: 'error' }); return; }
      await adminApi.dispatchEvent({
        userId: selectedPlayer.id,
        defId: eventForm.defId,
        payload,
      });
      setMsg({ text: 'Event dispatched', type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const sendGift = async () => {
    if (!selectedPlayer) return;
    if (!giftForm.giftDefId.trim()) { setMsg({ text: 'Gift Def ID is required', type: 'error' }); return; }
    setMsg(null);
    try {
      await adminApi.sendGift({
        userId: selectedPlayer.id,
        giftDefId: giftForm.giftDefId,
      });
      setMsg({ text: 'Gift sent', type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Events & Gifts</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.9rem', color: '#b8b8ff' }}>Target Player</label>
        {selectedPlayer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#e0e0ff' }}>{selectedPlayer.username}</span>
            <span style={{ color: '#666', fontSize: '0.8rem' }}>{selectedPlayer.email}</span>
            <button onClick={() => { setSelectedPlayer(null); setPlayerQuery(''); searchPlayer(''); }} style={{ padding: '0.2rem 0.5rem', border: '1px solid #555', borderRadius: 4, background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.75rem' }}>Change</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Search player..."
              value={playerQuery}
              onChange={(e) => setPlayerQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchPlayer(playerQuery)}
              style={{ flex: 1, padding: '0.5rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem' }}
            />
            <button onClick={() => searchPlayer(playerQuery)} className="btn-save" style={{ padding: '0.5rem 1rem' }}>Find</button>
          </div>
        )}
        {players.length > 0 && !selectedPlayer && (
          <div style={{ marginTop: 4 }}>
            {players.map((p) => (
              <button key={p.id} onClick={() => { setSelectedPlayer(p); setPlayers([]); }} style={{
                display: 'block', width: '100%', padding: '0.5rem', marginBottom: 2, border: '1px solid #2a2a4e',
                borderRadius: 4, background: '#16213e', color: '#e0e0ff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
              }}>
                {p.username} <span style={{ color: '#888' }}>{p.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlayer && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: '1rem' }}>
            <button
              onClick={() => setMode('event')}
              style={{
                padding: '0.5rem 1rem', border: '1px solid #2a2a4e', borderRadius: '6px 6px 0 0',
                background: mode === 'event' ? '#16213e' : 'transparent', color: mode === 'event' ? '#e0e0ff' : '#888',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: mode === 'event' ? 600 : 400,
                borderBottom: mode === 'event' ? '2px solid #6c63ff' : '1px solid #2a2a4e',
              }}
            >Dispatch Event</button>
            <button
              onClick={() => setMode('gift')}
              style={{
                padding: '0.5rem 1rem', border: '1px solid #2a2a4e', borderRadius: '6px 6px 0 0',
                background: mode === 'gift' ? '#16213e' : 'transparent', color: mode === 'gift' ? '#e0e0ff' : '#888',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: mode === 'gift' ? 600 : 400,
                borderBottom: mode === 'gift' ? '2px solid #6c63ff' : '1px solid #2a2a4e',
              }}
            >Send Gift</button>
          </div>

          <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: '0 8px 8px 8px', border: '1px solid #2a2a4e' }}>
            {mode === 'event' ? (
              <>
                <div className="form-field">
                  <label>Event Definition ID</label>
                  <input type="text" placeholder="e.g. evt_welcome_gift" value={eventForm.defId} onChange={(e) => setEventForm({ ...eventForm, defId: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Payload (JSON)</label>
                  <textarea
                    rows={4}
                    value={eventForm.payload}
                    onChange={(e) => setEventForm({ ...eventForm, payload: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#a0e0a0', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
                <button onClick={dispatchEvent} className="btn-save">Dispatch Event</button>
              </>
            ) : (
              <>
                <div className="form-field">
                  <label>Gift Definition ID</label>
                  <input type="text" placeholder="e.g. gift_welcome_gems" value={giftForm.giftDefId} onChange={(e) => setGiftForm({ ...giftForm, giftDefId: e.target.value })} />
                </div>
                <button onClick={sendGift} className="btn-save">Send Gift</button>
              </>
            )}
          </div>
        </>
      )}

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function ToolsPanel() {
  const [statResult, setStatResult] = useState<{ total: number; updated: number; skipped: number; failed: number } | null>(null);
  const [statLoading, setStatLoading] = useState(false);
  const [statMsg, setStatMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const runStatBackfill = async () => {
    if (!confirm('Raise any stat below 10 to exactly 10 for all entities, and fill in missing scaling/compositRarity? Existing stats above 10 and all progression data are preserved. Safe to re-run.')) return;
    setStatLoading(true);
    setStatMsg(null);
    setStatResult(null);
    try {
      const result = await adminApi.backfillEntityStats();
      setStatResult(result);
      setStatMsg({ text: `Done — ${result.updated} updated, ${result.skipped} already up-to-date, ${result.failed} failed`, type: 'success' });
    } catch (e: any) {
      setStatMsg({ text: e.message, type: 'error' });
    } finally {
      setStatLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Admin Tools</h2>

      <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#b8b8ff' }}>Apply Stat Floor to Existing Entities</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#888', lineHeight: 1.5 }}>
          Raises any stat currently below 10 up to exactly 10. Stats already at or above 10 are left untouched.
          Also fills in missing <code>scaling</code> and <code>compositRarity</code> fields for older entities that pre-date those fields.
          XP, level, levelHistory, and all other progression data are never modified.
          Safe to run multiple times — entities already meeting the baseline are skipped.
        </p>
        <button onClick={runStatBackfill} disabled={statLoading} className="btn-save">
          {statLoading ? 'Running...' : 'Apply Stat Floor'}
        </button>

        {statResult && !statLoading && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', fontSize: '0.875rem', color: '#e0e0ff' }}>
            <span>Total: <strong>{statResult.total}</strong></span>
            <span style={{ color: '#4caf50' }}>Updated: <strong>{statResult.updated}</strong></span>
            <span style={{ color: '#888' }}>Skipped: <strong>{statResult.skipped}</strong></span>
            {statResult.failed > 0 && <span style={{ color: '#ff6b6b' }}>Failed: <strong>{statResult.failed}</strong></span>}
          </div>
        )}

        {statMsg && <StatusMsg msg={statMsg.text} type={statMsg.type} />}
      </div>
    </div>
  );
}

const POWER_TYPE_LABELS: Record<string, string> = {
  keeper_xp_boost: 'Keeper XP Boost',
  entity_xp_boost: 'Entity XP Boost',
  mission_power_boost: 'Mission Power Boost',
  mission_duration_reduction: 'Mission Speed',
  crafting_duration_reduction: 'Crafting Speed',
  building_build_duration_reduction: 'Build Speed',
  building_upgrade_duration_reduction: 'Upgrade Speed',
  injury_recovery_boost: 'Injury Recovery',
};

const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

function GlobalPowerPanel() {
  const [powers, setPowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({
    label: '',
    powerType: 'entity_xp_boost',
    value: '50',
    valueMode: 'percent_add',
    durationMinutes: '60',
    scheduledFor: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await adminApi.getGlobalPowers(showAll);
      setPowers(p);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setMsg(null);
    try {
      await adminApi.createGlobalPower({
        label: form.label || 'Admin Power',
        powerType: form.powerType,
        value: Number(form.value),
        valueMode: form.valueMode,
        durationMinutes: Number(form.durationMinutes),
        ...(form.scheduledFor ? { scheduledFor: new Date(form.scheduledFor).toISOString() } : {}),
      });
      const isScheduled = !!form.scheduledFor && new Date(form.scheduledFor) > new Date();
      setMsg({ text: isScheduled ? 'Global power scheduled!' : 'Global power activated!', type: 'success' });
      setForm({ label: '', powerType: 'entity_xp_boost', value: '50', valueMode: 'percent_add', durationMinutes: '60', scheduledFor: '' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this global power?')) return;
    setMsg(null);
    try {
      await adminApi.cancelGlobalPower(id);
      setMsg({ text: 'Power cancelled', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const formatTimeLeft = (endTime: string) => {
    const ms = new Date(endTime).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatTimeUntil = (scheduledFor: string) => {
    const ms = new Date(scheduledFor).getTime() - Date.now();
    if (ms <= 0) return 'starting soon';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  };

  const activePowers = powers.filter((p) => p.status === 'active');
  const scheduledPowers = powers.filter((p) => p.status === 'scheduled');

  const presetBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.6rem',
    border: `1px solid ${active ? '#7c3aed' : '#444'}`,
    borderRadius: 5,
    background: active ? '#4c1d95' : 'transparent',
    color: active ? '#e0d4ff' : '#aaa',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem' }}>Global Active Powers</h2>

      <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#b8b8ff' }}>Activate New Power</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div className="form-field">
            <label>Label</label>
            <input type="text" placeholder="Power label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Power Type</label>
            <select value={form.powerType} onChange={(e) => setForm({ ...form, powerType: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem', width: '100%' }}>
              {Object.entries(POWER_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Value</label>
            <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Value Mode</label>
            <select value={form.valueMode} onChange={(e) => setForm({ ...form, valueMode: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem', width: '100%' }}>
              <option value="percent_add">% Add (e.g. +50%)</option>
              <option value="flat_add">Flat Add</option>
              <option value="multiplier">Multiplier (e.g. ×1.5)</option>
            </select>
          </div>
          <div className="form-field" style={{ gridColumn: 'span 2' }}>
            <label>Duration</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  type="button"
                  style={presetBtnStyle(form.durationMinutes === String(p.minutes))}
                  onClick={() => setForm({ ...form, durationMinutes: String(p.minutes) })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              placeholder="Custom minutes"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Start At <span style={{ color: '#888', fontWeight: 400 }}>(optional — leave blank to start now)</span></label>
            <input
              type="datetime-local"
              value={form.scheduledFor}
              onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>
        <button onClick={create} className="btn-save" style={{ marginTop: '0.75rem' }}>
          {form.scheduledFor && new Date(form.scheduledFor) > new Date() ? 'Schedule Power' : 'Activate Power'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#b8b8ff' }}>
          {showAll
            ? 'All Powers (recent 100)'
            : `Active (${activePowers.length})${scheduledPowers.length > 0 ? ` · Scheduled (${scheduledPowers.length})` : ''}`}
        </h3>
        <button onClick={() => setShowAll(!showAll)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #555', borderRadius: 5, background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}>
          {showAll ? 'Show Active + Scheduled' : 'Show History'}
        </button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {powers.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Starts</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {powers.map((p) => {
                const isActive = p.status === 'active';
                const isScheduled = p.status === 'scheduled';
                const valueFmt = p.valueMode === 'percent_add' ? `+${p.value}%` : p.valueMode === 'multiplier' ? `×${p.value}` : `+${p.value}`;
                return (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td style={{ fontSize: '0.8rem' }}>{POWER_TYPE_LABELS[p.powerType] ?? p.powerType}</td>
                    <td style={{ fontWeight: 600, color: isActive ? '#4caf50' : isScheduled ? '#60a5fa' : '#888' }}>{valueFmt}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {new Date(p.startTime).toLocaleString()}
                      {isScheduled && <div style={{ color: '#60a5fa', fontSize: '0.7rem' }}>{formatTimeUntil(p.startTime)}</div>}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {new Date(p.endTime).toLocaleString()}
                      {isActive && <div style={{ color: '#F59E0B', fontSize: '0.7rem' }}>{formatTimeLeft(p.endTime)} left</div>}
                    </td>
                    <td>
                      <span className={`boost-status boost-${p.status}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {(isActive || isScheduled) && (
                        <button onClick={() => cancel(p.id)} className="btn-delete">Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {powers.length === 0 && !loading && (
        <div style={{ color: '#888', padding: '1rem 0', textAlign: 'center', fontSize: '0.9rem' }}>
          No {showAll ? '' : 'active '}global powers
        </div>
      )}

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

type Tab = 'players' | 'boosts' | 'powers' | 'notifications' | 'events' | 'tools';

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'players', label: 'Player Editor', icon: Users },
  { key: 'boosts', label: 'Tick Boosts', icon: Zap },
  { key: 'powers', label: 'Global Powers', icon: Flame },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'events', label: 'Events & Gifts', icon: Gift },
  { key: 'tools', label: 'Tools', icon: Wrench },
];

function Dashboard() {
  const [tab, setTab] = useState<Tab>('players');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="admin-panel">
      <div className={`admin-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          {!collapsed && <h2>Admin Tools</h2>}
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)} title={t.label}>
                <Icon size={16} />
                {!collapsed && <span>{t.label}</span>}
              </button>
            );
          })}
        </nav>
        <a href="/admin/def" className="sidebar-link" title="Definition Editor">
          <Database size={16} />
          {!collapsed && <span>Definition Editor</span>}
        </a>
        <a href="/admin/icons" className="sidebar-link" title="Game Icons">
          <Image size={16} />
          {!collapsed && <span>Game Icons</span>}
        </a>
        <a href="/admin/audio" className="sidebar-link" title="Audio Manager">
          <Music size={16} />
          {!collapsed && <span>Audio Manager</span>}
        </a>
        <a href="/admin/tag-editor" className="sidebar-link" title="Visual Tag Editor">
          <TagIcon size={16} />
          {!collapsed && <span>Tag Editor</span>}
        </a>
        <a href="/admin/balance" className="sidebar-link" title="Entity Progress Simulator">
          <BarChart3 size={16} />
          {!collapsed && <span>Entity Progress Simulator</span>}
        </a>
        <button onClick={() => { setAdminKey(''); sessionStorage.removeItem('adminKey'); window.location.reload(); }} className="btn-logout" title="Logout">
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
      <div className="admin-content">
        {tab === 'players' && <PlayerPanel />}
        {tab === 'boosts' && <BoostPanel />}
        {tab === 'powers' && <GlobalPowerPanel />}
        {tab === 'notifications' && <NotificationPanel />}
        {tab === 'events' && <EventGiftPanel />}
        {tab === 'tools' && <ToolsPanel />}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return <Dashboard />;
}
