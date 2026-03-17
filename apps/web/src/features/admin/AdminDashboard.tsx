import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Zap, Bell, Gift, Database, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
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

type Tab = 'players' | 'boosts' | 'notifications' | 'events';

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

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'players', label: 'Player Editor', icon: Users },
  { key: 'boosts', label: 'Tick Boosts', icon: Zap },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'events', label: 'Events & Gifts', icon: Gift },
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
        <button onClick={() => { setAdminKey(''); sessionStorage.removeItem('adminKey'); window.location.reload(); }} className="btn-logout" title="Logout">
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
      <div className="admin-content">
        {tab === 'players' && <PlayerPanel />}
        {tab === 'boosts' && <BoostPanel />}
        {tab === 'notifications' && <NotificationPanel />}
        {tab === 'events' && <EventGiftPanel />}
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
