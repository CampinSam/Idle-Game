import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminToken } from '../adminApi';

const BTN_SAVE = "py-[0.6rem] px-6 border-0 rounded-md bg-[#6c63ff] text-white cursor-pointer font-semibold text-[0.95rem] hover:bg-[#5a52d5] disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_UPLOAD = "inline-block py-[0.3rem] px-[0.7rem] border border-[#6c63ff] rounded bg-transparent text-[#6c63ff] cursor-pointer text-[0.8rem] hover:bg-[#6c63ff] hover:text-white disabled:opacity-60 disabled:cursor-not-allowed";

interface IconEntry {
  id: string;
  name: string;
  iconKey: string;
  type: 'item' | 'currency' | 'system';
  exists: boolean;
  url: string | null;
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!autoSubmitted.current) {
      autoSubmitted.current = true;
      adminApi.getTables().then(() => onLogin()).catch(() => {});
    }
  }, [onLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f2e]">
      <div className="bg-[#16213e] border border-[#2a2a4e] rounded-xl p-10 max-w-[480px] w-[90%]" style={{ textAlign: 'center' }}>
        <h1>Derp Universe Admin</h1>
        <p style={{ color: '#888', fontSize: '0.9rem', marginTop: 8 }}>
          Please <a href="/admin" style={{ color: '#7c3aed' }}>sign in</a> to access this page.
        </p>
      </div>
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
    <div className="overflow-x-auto">
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
            <tr key={icon.id} className={icon.exists ? '' : 'opacity-60'}>
              <td>
                <div className="flex items-center justify-center w-9 h-9">
                  {icon.exists && icon.url ? (
                    <img
                      src={bustTokens[icon.iconKey] ? `${icon.url}?t=${bustTokens[icon.iconKey]}` : icon.url}
                      alt={icon.name}
                      className="w-9 h-9 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded border border-dashed border-[#333] flex items-center justify-center text-[#555] text-[0.7rem]">?</div>
                  )}
                </div>
              </td>
              <td>{icon.name}</td>
              <td className="font-mono text-[0.8rem] text-[#8888ff]">{icon.iconKey}</td>
              <td>
                {icon.exists ? (
                  <span className="inline-block px-2 py-[3px] rounded text-[0.75rem] font-semibold bg-[rgba(76,175,80,0.15)] text-[#4caf50]">✓ Present</span>
                ) : (
                  <span className="inline-block px-2 py-[3px] rounded text-[0.75rem] font-semibold bg-[rgba(255,107,107,0.15)] text-[#ff6b6b]">✗ Missing</span>
                )}
              </td>
              <td>
                <button
                  className={BTN_UPLOAD}
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
      <button className={BTN_SAVE} style={{ marginTop: 8 }} onClick={() => setExpanded(true)}>
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
      <button type="submit" className={BTN_SAVE} disabled={loading}>{loading ? 'Adding...' : 'Add'}</button>
      <button type="button" className={BTN_UPLOAD} onClick={() => { setExpanded(false); setError(''); }}>Cancel</button>
      {error && <span style={{ color: '#f87171', fontSize: 12, alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}

export function IconManagerContent() {
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
    <div className="max-w-[1100px] mx-auto px-6 py-6 min-h-screen bg-[#0f0f2e] text-[#e0e0ff]">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1
            className="m-0 text-[2rem] font-bold"
            style={{ backgroundImage: 'linear-gradient(135deg,#6c63ff,#b8b8ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            Game Icons
          </h1>
          <p className="m-0 text-[#888] text-[0.85rem]">Manage icon images for system rewards, items, and currencies</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="/admin"
            className="inline-block py-2 px-4 border border-[#2a2a4e] rounded text-[#a0a0c0] no-underline text-[0.85rem] transition-colors hover:text-[#e0e0ff] hover:border-[#5b4fcf]"
          >
            ← Admin
          </a>
          <button className={BTN_SAVE} onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex flex-col items-center bg-[#16213e] border border-[#2a2a4e] rounded-xl p-4 min-w-[80px]">
          <span className="text-2xl font-bold text-white">{total}</span>
          <span className="text-[11px] text-[#888] uppercase tracking-[0.05em] mt-1">Total</span>
        </div>
        <div className="flex flex-col items-center bg-[#16213e] border border-[rgba(100,200,100,0.3)] rounded-xl p-4 min-w-[80px]">
          <span className="text-2xl font-bold text-white">{present}</span>
          <span className="text-[11px] text-[#888] uppercase tracking-[0.05em] mt-1">Present</span>
        </div>
        <div className="flex flex-col items-center bg-[#16213e] border border-[rgba(255,100,100,0.3)] rounded-xl p-4 min-w-[80px]">
          <span className="text-2xl font-bold text-white">{missing}</span>
          <span className="text-[11px] text-[#888] uppercase tracking-[0.05em] mt-1">Missing</span>
        </div>
      </div>

      {msg && (
        <div
          className={`px-4 py-3 rounded-lg text-[0.9rem] mb-4 border ${
            msg.type === 'success'
              ? 'bg-[rgba(76,175,80,0.15)] border-[rgba(76,175,80,0.3)] text-[#4caf50]'
              : 'bg-[rgba(255,107,107,0.15)] border-[rgba(255,107,107,0.3)] text-[#ff6b6b]'
          }`}
        >
          {msg.text}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="bg-[#0f0f2e] border border-[#1a1a3e] rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.4)] mb-6">
        <div className="mb-4">
          <h2 className="m-0 mb-1 text-[1rem] font-semibold text-[#b8b8ff]">System Icons</h2>
          <p className="m-0 text-[#888] text-[0.85rem]">
            Reward type icons (e.g. XP gains). Add new keys below — no code deploy required. Upload the matching PNG to activate the icon.
          </p>
        </div>

        {loading ? (
          <div className="text-[#888] text-center p-6">Loading…</div>
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

        <div className="text-[0.8rem] text-[#666] mt-3">
          Stored at: <code>images/icons/&#123;iconKey&#125;.png</code> in object storage.
        </div>
      </div>

      <div className="bg-[#0f0f2e] border border-[#1a1a3e] rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
        <div className="mb-4">
          <h2 className="m-0 mb-1 text-[1rem] font-semibold text-[#b8b8ff]">Item &amp; Currency Icons</h2>
          <p className="m-0 text-[#888] text-[0.85rem]">Icons for all item definitions and currencies.</p>
        </div>

        <div className="flex gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2 text-[0.85rem]">
            <label className="text-[#888]">Status:</label>
            {(['all', 'present', 'missing'] as const).map(v => (
              <button
                key={v}
                className={`py-[0.25rem] px-[0.6rem] border rounded bg-transparent cursor-pointer text-[0.8rem] transition-colors ${
                  filter === v
                    ? 'border-[#6c63ff] bg-[#6c63ff] text-white'
                    : 'border-[#333] text-[#888] hover:border-[#6c63ff] hover:text-[#6c63ff]'
                }`}
                onClick={() => setFilter(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[0.85rem]">
            <label className="text-[#888]">Type:</label>
            {(['all', 'item', 'currency'] as const).map(v => (
              <button
                key={v}
                className={`py-[0.25rem] px-[0.6rem] border rounded bg-transparent cursor-pointer text-[0.8rem] transition-colors ${
                  typeFilter === v
                    ? 'border-[#6c63ff] bg-[#6c63ff] text-white'
                    : 'border-[#333] text-[#888] hover:border-[#6c63ff] hover:text-[#6c63ff]'
                }`}
                onClick={() => setTypeFilter(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-[#888] text-center p-6">Loading…</div>
        ) : (
          <IconTable
            icons={filteredRegular}
            uploading={uploading}
            bustTokens={bustTokens}
            onUpload={triggerUpload}
          />
        )}

        <div className="text-[0.8rem] text-[#666] mt-3">
          Icons are stored in object storage at: <code>images/icons/&#123;iconKey&#125;.png</code> (resolved from bare iconKey values).
        </div>
      </div>
    </div>
  );
}

export default function IconManagerPage() {
  const [authed, setAuthed] = useState(!!(getAdminToken() || import.meta.env.DEV));

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <IconManagerContent />;
}
