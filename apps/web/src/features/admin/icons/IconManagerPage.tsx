import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import '../admin.css';
import './IconManagerPage.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

interface IconEntry {
  id: string;
  name: string;
  iconKey: string;
  type: 'item' | 'currency';
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

function IconManagerContent() {
  const [icons, setIcons] = useState<IconEntry[]>([]);
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
      const data = await adminApi.listIcons();
      setIcons(data);
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
      setIcons(prev => prev.map(i =>
        i.iconKey === iconKey
          ? { ...i, exists: true, url: `/api/media/images/icons/${iconKey}.png` }
          : i
      ));
      setBustTokens(prev => ({ ...prev, [iconKey]: token }));
    } catch (e: any) {
      setMsg({ text: `Upload failed: ${e.message}`, type: 'error' });
    } finally {
      setUploading(null);
      pendingIconKey.current = null;
    }
  };

  const filtered = icons.filter(i => {
    if (filter === 'missing' && i.exists) return false;
    if (filter === 'present' && !i.exists) return false;
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    return true;
  });

  const total = icons.length;
  const present = icons.filter(i => i.exists).length;
  const missing = total - present;

  return (
    <div className="icon-manager">
      <div className="icon-manager-header">
        <div>
          <h1>Game Icons</h1>
          <p className="icon-manager-subtitle">Manage icon images for items and currencies</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/admin" className="icon-manager-back">← Admin</a>
          <button className="btn-save" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="icon-stats">
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
          <div className={`icon-msg icon-msg-${msg.type}`}>{msg.text}</div>
        )}

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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {loading && <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading icons...</div>}

        {!loading && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Icon</th>
                  <th>Name</th>
                  <th>Icon Key</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 110 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                      No icons match the current filter.
                    </td>
                  </tr>
                )}
                {filtered.map(icon => (
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
                      <span className={`icon-type-badge icon-type-${icon.type}`}>
                        {icon.type}
                      </span>
                    </td>
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
                        onClick={() => triggerUpload(icon.iconKey)}
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
        )}

        <div className="icon-path-hint">
          Icons are stored at: <code>public/images/icons/&#123;iconKey&#125;.png</code>
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
