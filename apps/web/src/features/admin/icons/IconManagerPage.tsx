import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import '../admin.css';
import './IconManagerPage.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

interface IconEntry {
  id: string;
  name: string;
  iconKey: string;
  type: 'item' | 'currency' | 'system';
  exists: boolean;
  url: string | null;
}

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

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={(e) => { e.preventDefault(); doLogin(key); }}>
        <h1>Derp Universe Admin</h1>
        <input type="password" placeholder="Admin Key" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        <button type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Enter'}</button>
        {error && <div className="admin-error">{error}</div>}
      </form>
    </div>
  );
}

interface IconTableProps {
  icons: IconEntry[];
  uploading: string | null;
  bustTokens: Record<string, number>;
  onUpload: (iconKey: string) => void;
  emptyMessage?: string;
}

function IconTable({ icons, uploading, bustTokens, onUpload, emptyMessage }: IconTableProps) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: 56 }}>Icon</th>
            <th>Name</th>
            <th>Icon Key</th>
            <th style={{ width: 110 }}>Status</th>
            <th style={{ width: 110 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {icons.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                {emptyMessage ?? 'No icons match the current filter.'}
              </td>
            </tr>
          )}
          {icons.map(icon => (
            <tr key={icon.id} className={icon.exists ? '' : 'icon-row-missing'}>
              <td>
                <div className="icon-thumb-cell">
                  {icon.exists && icon.url ? (
                    <img
                      src={bustTokens[icon.iconKey] ? `${icon.url}?t=${bustTokens[icon.iconKey]}` : icon.url}
                      alt={icon.name}
                      className="icon-thumb"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="icon-thumb-placeholder">?</div>
                  )}
                </div>
              </td>
              <td className="icon-name">{icon.name}</td>
              <td className="icon-key">{icon.iconKey}</td>
              <td>
                {icon.exists ? (
                  <span className="icon-status-badge icon-status-present">✓ Present</span>
                ) : (
                  <span className="icon-status-badge icon-status-missing">✗ Missing</span>
                )}
              </td>
              <td>
                <button
                  className="btn-upload"
                  onClick={() => onUpload(icon.iconKey)}
                  disabled={uploading === icon.iconKey}
                >
                  {uploading === icon.iconKey ? 'Uploading...' : icon.exists ? 'Replace' : 'Upload'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddSystemIconForm({ onAdded }: { onAdded: () => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimKey = key.trim();
    const trimName = name.trim();
    if (!trimKey || !trimName) { setError('Both fields are required.'); return; }
    if (!/^[a-z0-9_]+$/.test(trimKey)) { setError('Key must be lowercase letters, digits, and underscores only.'); return; }
    setLoading(true);
    setError('');
    try {
      await adminApi.createSystemIconDef({ id: trimKey, name: trimName });
      setKey('');
      setName('');
      setExpanded(false);
      onAdded();
    } catch (e: any) {
      setError(e.message || 'Failed to add icon key');
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button className="btn-save" style={{ marginTop: 8 }} onClick={() => setExpanded(true)}>
        + Add New Key
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#aaa' }}>Icon Key (e.g. season_xp)</label>
        <input
          type="text"
          placeholder="season_xp"
          value={key}
          onChange={e => setKey(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: '#1a1a2e', color: '#fff', fontSize: 13, width: 180 }}
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#aaa' }}>Display Name (e.g. Season XP)</label>
        <input
          type="text"
          placeholder="Season XP"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #444', background: '#1a1a2e', color: '#fff', fontSize: 13, width: 180 }}
        />
      </div>
      <button type="submit" className="btn-save" disabled={loading}>{loading ? 'Adding...' : 'Add'}</button>
      <button type="button" className="btn-upload" onClick={() => { setExpanded(false); setError(''); }}>Cancel</button>
      {error && <span style={{ color: '#f87171', fontSize: 12, alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}

function IconManagerContent() {
  const [systemIcons, setSystemIcons] = useState<IconEntry[]>([]);
  const [regularIcons, setRegularIcons] = useState<IconEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing' | 'present'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'item' | 'currency'>('all');
  const [bustTokens, setBustTokens] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingIconKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [regular, system] = await Promise.all([
        adminApi.listIcons(),
        adminApi.listSystemIcons(),
      ]);
      setSystemIcons(system);
      setRegularIcons(regular);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerUpload = (iconKey: string) => {
    pendingIconKey.current = iconKey;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    const iconKey = pendingIconKey.current;
    if (!originalFile || !iconKey) return;
    e.target.value = '';

    const renamedFile = new File([originalFile], `${iconKey}.png`, { type: 'image/png' });
    setUploading(iconKey);
    setMsg(null);
    try {
      await adminApi.uploadMedia(renamedFile, 'images/icons');
      setMsg({ text: `Uploaded ${iconKey}.png successfully`, type: 'success' });
      const token = Date.now();
      const updateEntry = (i: IconEntry) =>
        i.iconKey === iconKey
          ? { ...i, exists: true, url: `/media/images/icons/${iconKey}.png` }
          : i;
      setSystemIcons(prev => prev.map(updateEntry));
      setRegularIcons(prev => prev.map(updateEntry));
      setBustTokens(prev => ({ ...prev, [iconKey]: token }));
    } catch (e: any) {
      setMsg({ text: `Upload failed: ${e.message}`, type: 'error' });
    } finally {
      setUploading(null);
      pendingIconKey.current = null;
    }
  };

  const filteredRegular = regularIcons.filter(i => {
    if (filter === 'missing' && i.exists) return false;
    if (filter === 'present' && !i.exists) return false;
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    return true;
  });

  const allIcons = [...systemIcons, ...regularIcons];
  const total = allIcons.length;
  const present = allIcons.filter(i => i.exists).length;
  const missing = total - present;

  return (
    <div className="icon-manager">
      <div className="icon-manager-header">
        <div>
          <h1>Game Icons</h1>
          <p className="icon-manager-subtitle">Manage icon images for system rewards, items, and currencies</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/admin" className="icon-manager-back">← Admin</a>
          <button className="btn-save" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="icon-stats" style={{ marginBottom: '1.5rem' }}>
        <div className="icon-stat icon-stat-total">
          <span className="icon-stat-num">{total}</span>
          <span className="icon-stat-label">Total</span>
        </div>
        <div className="icon-stat icon-stat-present">
          <span className="icon-stat-num">{present}</span>
          <span className="icon-stat-label">Present</span>
        </div>
        <div className="icon-stat icon-stat-missing">
          <span className="icon-stat-num">{missing}</span>
          <span className="icon-stat-label">Missing</span>
        </div>
      </div>

      {msg && (
        <div className={`icon-msg icon-msg-${msg.type}`} style={{ marginBottom: '1rem' }}>{msg.text}</div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="icon-section-header">
          <h2 className="icon-section-title">System Icons</h2>
          <p className="icon-section-desc">
            Reward type icons (e.g. XP gains). Add new keys below — no code deploy required. Upload the matching PNG to activate the icon.
          </p>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: '1.5rem', textAlign: 'center' }}>Loading…</div>
        ) : (
          <IconTable
            icons={systemIcons}
            uploading={uploading}
            bustTokens={bustTokens}
            onUpload={triggerUpload}
            emptyMessage="No system icons registered."
          />
        )}

        <AddSystemIconForm onAdded={load} />

        <div className="icon-path-hint" style={{ marginTop: 12 }}>
          Stored at: <code>images/icons/&#123;iconKey&#125;.png</code> in object storage.
        </div>
      </div>

      <div className="admin-card">
        <div className="icon-section-header">
          <h2 className="icon-section-title">Item &amp; Currency Icons</h2>
          <p className="icon-section-desc">Icons for all item definitions and currencies.</p>
        </div>

        <div className="icon-filters">
          <div className="icon-filter-group">
            <label>Status:</label>
            {(['all', 'present', 'missing'] as const).map(v => (
              <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div className="icon-filter-group">
            <label>Type:</label>
            {(['all', 'item', 'currency'] as const).map(v => (
              <button key={v} className={typeFilter === v ? 'active' : ''} onClick={() => setTypeFilter(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: '1.5rem', textAlign: 'center' }}>Loading…</div>
        ) : (
          <IconTable
            icons={filteredRegular}
            uploading={uploading}
            bustTokens={bustTokens}
            onUpload={triggerUpload}
          />
        )}

        <div className="icon-path-hint">
          Icons are stored in object storage at: <code>images/icons/&#123;iconKey&#125;.png</code> (resolved from bare iconKey values).
        </div>
      </div>
    </div>
  );
}

export default function IconManagerPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <IconManagerContent />;
}
