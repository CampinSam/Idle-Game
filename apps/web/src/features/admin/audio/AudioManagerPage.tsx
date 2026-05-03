import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import { resolveAssetUrl } from '../../../utils/iconResolver';
import '../admin.css';
import './AudioManagerPage.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

const BUS_OPTIONS = ['music', 'sfx', 'ui', 'ambient'];

const ALL_ACTION_KEYS = {
  music: [
    { key: 'music.main_menu', label: 'Main Menu', desc: 'App loads before any navigation' },
    { key: 'music.default', label: 'Default', desc: 'Fallback for any location without its own track' },
    { key: 'music.mission_active', label: 'Mission Active', desc: 'While any mission is in-progress view' },
  ],
  sfx: [
    { key: 'sfx.mission.start', label: 'Mission Start', desc: 'Mission job submitted' },
    { key: 'sfx.mission.success', label: 'Mission Success', desc: 'Mission completes with success result' },
    { key: 'sfx.mission.fail', label: 'Mission Fail', desc: 'Mission completes with failure result' },
    { key: 'sfx.craft.start', label: 'Craft Start', desc: 'Crafting job submitted' },
    { key: 'sfx.craft.complete', label: 'Craft Complete', desc: 'Crafting job resolves' },
    { key: 'sfx.lootbox.open', label: 'Lootbox Open', desc: 'Lootbox/chest open animation starts' },
    { key: 'sfx.lootbox.rare', label: 'Lootbox Rare', desc: 'A rare/legendary item revealed in lootbox' },
    { key: 'sfx.reward.checkin', label: 'Check-in Claimed', desc: 'Daily check-in claimed' },
    { key: 'sfx.reward.gift', label: 'Gift Claimed', desc: 'Gift claimed from Rewards page' },
    { key: 'sfx.reward.quest_complete', label: 'Quest Complete', desc: 'Quest reaches 100% and is claimed' },
    { key: 'sfx.economy.currency_earn', label: 'Currency Earn', desc: 'Significant currency gain (level-up, claim batch)' },
    { key: 'sfx.economy.purchase', label: 'Purchase', desc: 'Store purchase confirmed' },
    { key: 'sfx.player.level_up', label: 'Player Level Up', desc: 'Keeper level increases' },
    { key: 'sfx.player.prestige', label: 'Player Prestige', desc: 'Prestige action confirmed' },
    { key: 'sfx.entity.level_up', label: 'Entity Level Up', desc: 'Entity level increases' },
    { key: 'sfx.entity.tier_upgrade', label: 'Entity Tier Upgrade', desc: 'Entity tier advances' },
    { key: 'sfx.building.complete', label: 'Building Complete', desc: 'Building construction finishes' },
    { key: 'sfx.building.upgrade', label: 'Building Upgrade', desc: 'Building upgrade completes' },
    { key: 'sfx.building.toggle', label: 'Building Toggle', desc: 'Building enabled/disabled' },
    { key: 'sfx.location.claim', label: 'Location Claim', desc: 'Resources claimed from location' },
    { key: 'sfx.season.start', label: 'Season Start', desc: 'New season begins (SSE event received)' },
  ],
  ui: [
    { key: 'ui.button_click', label: 'Button Click (default)', desc: 'Generic button — used when no more specific variant matches' },
    { key: 'ui.button_primary', label: 'Button — Primary', desc: 'Primary CTAs: Save, Confirm, Start, Claim, Unlock, Buy' },
    { key: 'ui.button_danger', label: 'Button — Danger', desc: 'Destructive actions: Delete, Cancel, Remove' },
    { key: 'ui.button_ghost', label: 'Button — Ghost', desc: 'Subtle / tertiary buttons inside modals' },
    { key: 'ui.icon_button', label: 'Icon Button', desc: 'Small icon buttons: close (×), notification bell, avatar, gear, help (?)' },
    { key: 'ui.modal_open', label: 'Modal Open', desc: 'Any game modal opens' },
    { key: 'ui.modal_close', label: 'Modal Close', desc: 'Any game modal closes' },
    { key: 'ui.tab_switch', label: 'Tab Switch', desc: 'Tab / section navigation within a page or bottom nav' },
    { key: 'ui.notification', label: 'Notification', desc: 'In-app notification appears' },
    { key: 'ui.error', label: 'Error', desc: 'Error toast or feedback fires' },
  ],
  ambient: [
    { key: 'ambient.default', label: 'Default Ambient', desc: 'Fallback ambient loop' },
  ],
};

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

function SoundLibraryTab() {
  const [sounds, setSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ key: '', name: '', bus: 'sfx', description: '' });
  const [editForm, setEditForm] = useState<any>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSoundId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listSoundDefs();
      setSounds(data);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.key.trim() || !form.name.trim()) {
      setMsg({ text: 'Key and Name are required', type: 'error' });
      return;
    }
    setMsg(null);
    try {
      await adminApi.createSoundDef(form);
      setMsg({ text: 'Sound created', type: 'success' });
      setCreating(false);
      setForm({ key: '', name: '', bus: 'sfx', description: '' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const startEdit = (sound: any) => {
    setEditingId(sound.id);
    setEditForm({ key: sound.key, name: sound.name, bus: sound.bus, description: sound.description || '' });
  };

  const handleUpdate = async (id: string) => {
    setMsg(null);
    try {
      await adminApi.updateSoundDef(id, editForm);
      setMsg({ text: 'Sound updated', type: 'success' });
      setEditingId(null);
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This also removes any mappings to this sound.`)) return;
    setMsg(null);
    try {
      await adminApi.deleteSoundDef(id);
      setMsg({ text: 'Sound deleted', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const triggerUpload = (soundId: string) => {
    pendingSoundId.current = soundId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const soundId = pendingSoundId.current;
    if (!file || !soundId) return;
    e.target.value = '';
    setUploadingId(soundId);
    setMsg(null);
    try {
      const result = await adminApi.uploadAudio(file);
      await adminApi.updateSoundDef(soundId, { fileKey: result.fileKey });
      setMsg({ text: `Uploaded ${file.name}`, type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: `Upload failed: ${e.message}`, type: 'error' });
    } finally {
      setUploadingId(null);
      pendingSoundId.current = null;
    }
  };

  const busColor: Record<string, string> = {
    music: '#6c63ff',
    sfx: '#ff6b6b',
    ui: '#4ecdc4',
    ambient: '#95e1a5',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Sounds Library</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-save" onClick={load} disabled={loading}>Refresh</button>
          <button className="btn-save" onClick={() => setCreating(true)}>+ New Sound</button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.85rem',
          background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
          color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
          border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
        }}>{msg.text}</div>
      )}

      {creating && (
        <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#b8b8ff' }}>New Sound Definition</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div className="form-field">
              <label>Action Key</label>
              <input type="text" placeholder="e.g. sfx.mission.success" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Name</label>
              <input type="text" placeholder="Human-readable name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Bus</label>
              <select value={form.bus} onChange={e => setForm({ ...form, bus: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.9rem', width: '100%' }}>
                {BUS_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field" style={{ marginTop: '0.5rem' }}>
            <label>Description (optional)</label>
            <input type="text" placeholder="When this sound plays" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
            <button className="btn-save" onClick={handleCreate}>Create</button>
            <button className="btn-delete" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav" style={{ display: 'none' }} onChange={handleFileChange} />

      {loading && <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading sounds...</div>}

      {!loading && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th style={{ width: 80 }}>Bus</th>
                <th>Description</th>
                <th style={{ width: 120 }}>File</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sounds.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No sounds defined yet.</td></tr>
              )}
              {sounds.map(sound => (
                <tr key={sound.id}>
                  {editingId === sound.id ? (
                    <>
                      <td><input type="text" value={editForm.key} onChange={e => setEditForm({ ...editForm, key: e.target.value })} style={{ width: '100%', padding: '0.35rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff' }} /></td>
                      <td><input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: '0.35rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff' }} /></td>
                      <td>
                        <select value={editForm.bus} onChange={e => setEditForm({ ...editForm, bus: e.target.value })} style={{ padding: '0.35rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', width: '100%' }}>
                          {BUS_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td><input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={{ width: '100%', padding: '0.35rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff' }} /></td>
                      <td style={{ fontSize: '0.75rem', color: '#888' }}>{sound.fileKey || '—'}</td>
                      <td>
                        <button className="btn-save" style={{ marginRight: 4, padding: '0.25rem 0.5rem' }} onClick={() => handleUpdate(sound.id)}>Save</button>
                        <button className="btn-delete" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#b8b8ff' }}>{sound.key}</td>
                      <td>{sound.name}</td>
                      <td>
                        <span style={{ background: busColor[sound.bus] || '#444', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>
                          {sound.bus}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#888' }}>{sound.description || '—'}</td>
                      <td>
                        {sound.fileKey ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              style={{ background: 'none', border: 'none', color: '#6c63ff', cursor: 'pointer', padding: '0.15rem 0.35rem', fontSize: '0.75rem' }}
                              onClick={() => {
                                const url = resolveAssetUrl(sound.fileKey);
                                if (!url) return;
                                setPreviewUrl(previewUrl === url ? null : url);
                              }}
                            >
                              {(() => { const url = resolveAssetUrl(sound.fileKey); return previewUrl === url ? '⏹' : '▶'; })()}
                            </button>
                            <span style={{ fontSize: '0.7rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80, whiteSpace: 'nowrap' }}>
                              {sound.fileKey.split('/').pop()}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#555', fontSize: '0.75rem' }}>No file</span>
                        )}
                      </td>
                      <td>
                        <button style={{ background: 'none', border: '1px solid #555', borderRadius: 4, color: '#aaa', cursor: 'pointer', padding: '0.2rem 0.5rem', fontSize: '0.75rem', marginRight: 4 }} onClick={() => triggerUpload(sound.id)} disabled={uploadingId === sound.id}>
                          {uploadingId === sound.id ? '...' : sound.fileKey ? 'Replace' : 'Upload'}
                        </button>
                        <button style={{ background: 'none', border: '1px solid #555', borderRadius: 4, color: '#aaa', cursor: 'pointer', padding: '0.2rem 0.5rem', fontSize: '0.75rem', marginRight: 4 }} onClick={() => startEdit(sound)}>Edit</button>
                        <button className="btn-delete" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(sound.id, sound.name)}>Del</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewUrl && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem 1rem', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#b8b8ff', fontSize: '0.85rem' }}>Preview</span>
            <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>✕</button>
          </div>
          <audio src={previewUrl} controls autoPlay style={{ width: 220 }} />
        </div>
      )}
    </div>
  );
}

const ALL_ACTION_KEY_SET = new Set(
  (Object.values(ALL_ACTION_KEYS) as any[]).flat().map((a: any) => a.key),
);

function CustomMappingRow({
  actionKey,
  mappings,
  sounds,
  onAdd,
  onRemove,
  onWeightChange,
}: {
  actionKey: string;
  mappings: any[];
  sounds: any[];
  onAdd: (actionKey: string, soundDefId: string) => void;
  onRemove: (id: string) => void;
  onWeightChange: (id: string, weight: number) => void;
}) {
  const bus = actionKey.split('.')[0] as string;
  const busSounds = sounds.filter(s => s.bus === bus);
  const busColor: Record<string, string> = { music: '#6c63ff', sfx: '#ff6b6b', ui: '#4ecdc4', ambient: '#95e1a5' };
  return (
    <div style={{ background: '#16213e', borderRadius: 8, border: '1px solid #2a2a4e', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: busColor[bus] || '#b8b8ff', marginBottom: 2 }}>{actionKey}</div>
          <div style={{ fontSize: '0.75rem', color: '#666' }}>Custom / dynamic action key</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          {mappings.length === 0 && <span style={{ fontSize: '0.75rem', color: '#555', fontStyle: 'italic' }}>No sounds mapped</span>}
          {mappings.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#e0e0ff', flex: 1 }}>{m.soundDef?.name || m.soundDefId}</span>
              <label style={{ fontSize: '0.7rem', color: '#888' }}>w:</label>
              <input
                type="number" min={1} max={100} value={m.weight}
                onChange={e => onWeightChange(m.id, parseInt(e.target.value) || 1)}
                style={{ width: 40, padding: '0.1rem 0.25rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: '0.75rem' }}
              />
              <button onClick={() => onRemove(m.id)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.75rem' }}>✕</button>
            </div>
          ))}
          {busSounds.length > 0 && (
            <select defaultValue="" onChange={e => { if (e.target.value) onAdd(actionKey, e.target.value); e.target.value = ''; }}
              style={{ padding: '0.35rem 0.5rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#888', fontSize: '0.75rem', cursor: 'pointer', width: '100%' }}>
              <option value="">+ Add sound...</option>
              {busSounds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionMappingsTab() {
  const [sounds, setSounds] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [locationDefs, setLocationDefs] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [customKeySoundId, setCustomKeySoundId] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m, locs, seas] = await Promise.all([
        adminApi.listSoundDefs(),
        adminApi.listSoundMappings(),
        adminApi.listLocationDefs().catch(() => []),
        adminApi.listSeasons().catch(() => []),
      ]);
      setSounds(s);
      setMappings(m);
      setLocationDefs(locs);
      setSeasons(seas);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getMappingsForAction = (actionKey: string) =>
    mappings.filter(m => m.actionKey === actionKey);

  const getSoundsForBus = (bus: string) =>
    sounds.filter(s => s.bus === bus);

  const addMapping = async (actionKey: string, soundDefId: string) => {
    if (!soundDefId) return;
    const existing = mappings.find(m => m.actionKey === actionKey && m.soundDefId === soundDefId);
    if (existing) { setMsg({ text: 'That sound is already mapped to this action', type: 'error' }); return; }
    setMsg(null);
    try {
      await adminApi.createSoundMapping({ actionKey, soundDefId, weight: 1 });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const removeMapping = async (id: string) => {
    setMsg(null);
    try {
      await adminApi.deleteSoundMapping(id);
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const updateWeight = async (id: string, weight: number) => {
    try {
      await adminApi.updateSoundMapping(id, { weight });
      setMappings(prev => prev.map(m => m.id === id ? { ...m, weight } : m));
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const busColor: Record<string, string> = {
    music: '#6c63ff',
    sfx: '#ff6b6b',
    ui: '#4ecdc4',
    ambient: '#95e1a5',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Action Mappings</h2>
        <button className="btn-save" onClick={load} disabled={loading}>Refresh</button>
      </div>

      {msg && (
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.85rem',
          background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
          color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
          border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
        }}>{msg.text}</div>
      )}

      {loading && <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading mappings...</div>}

      {!loading && (Object.entries(ALL_ACTION_KEYS) as [string, any[]][]).map(([bus, actions]) => (
        <div key={bus} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: busColor[bus], marginBottom: '0.5rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {bus} Bus
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {actions.map(({ key: actionKey, label, desc }) => {
              const actionMappings = getMappingsForAction(actionKey);
              const busSounds = getSoundsForBus(bus);
              return (
                <div key={actionKey} style={{ background: '#16213e', borderRadius: 8, border: '1px solid #2a2a4e', padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#b8b8ff', marginBottom: 2 }}>{actionKey}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{desc}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                      {actionMappings.length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#555', fontStyle: 'italic' }}>No sounds mapped</span>
                      )}
                      {actionMappings.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.8rem', color: '#e0e0ff', flex: 1 }}>{m.soundDef?.name || m.soundDefId}</span>
                          <label style={{ fontSize: '0.7rem', color: '#888' }}>w:</label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={m.weight}
                            onChange={e => updateWeight(m.id, parseInt(e.target.value) || 1)}
                            style={{ width: 40, padding: '0.1rem 0.25rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: '0.75rem' }}
                          />
                          <button onClick={() => removeMapping(m.id)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.75rem' }}>✕</button>
                        </div>
                      ))}
                      {busSounds.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={e => { if (e.target.value) addMapping(actionKey, e.target.value); e.target.value = ''; }}
                          style={{ padding: '0.35rem 0.5rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#888', fontSize: '0.75rem', cursor: 'pointer', width: '100%' }}
                        >
                          <option value="">+ Add sound...</option>
                          {busSounds.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!loading && locationDefs.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #2a2a4e', paddingTop: '1.5rem' }}>
          <h3 style={{ color: '#95e1a5', marginBottom: '0.25rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Per-Location Music &amp; Ambient
          </h3>
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
            Assign music and ambient tracks per location. Takes priority over the default tracks when a player is on that location.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {locationDefs.map((loc: any) => (
              <div key={loc.id} style={{ background: '#16213e', borderRadius: 8, border: '1px solid #2a2a4e', padding: '0.75rem 1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e0e0ff', marginBottom: '0.5rem' }}>
                  {loc.name || loc.id} <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#555', marginLeft: 4 }}>{loc.id}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {[`music.location.${loc.id}`, `ambient.location.${loc.id}`].map(actionKey => (
                    <CustomMappingRow
                      key={actionKey}
                      actionKey={actionKey}
                      mappings={getMappingsForAction(actionKey)}
                      sounds={sounds}
                      onAdd={addMapping}
                      onRemove={removeMapping}
                      onWeightChange={updateWeight}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && seasons.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #2a2a4e', paddingTop: '1.5rem' }}>
          <h3 style={{ color: '#6c63ff', marginBottom: '0.25rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Per-Season Music
          </h3>
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
            Assign a music track per active season. Season music overrides all other location/default music globally while that season is active.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {seasons.map((season: any) => (
              <div key={season.id} style={{ background: '#16213e', borderRadius: 8, border: '1px solid #2a2a4e', padding: '0.75rem 1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e0e0ff', marginBottom: '0.5rem' }}>
                  {season.name || season.id} <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#555', marginLeft: 4 }}>{season.id}</span>
                </div>
                <CustomMappingRow
                  actionKey={`music.season.${season.id}`}
                  mappings={getMappingsForAction(`music.season.${season.id}`)}
                  sounds={sounds}
                  onAdd={addMapping}
                  onRemove={removeMapping}
                  onWeightChange={updateWeight}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (() => {
        const knownLocationSeasonKeys = new Set([
          ...locationDefs.flatMap((loc: any) => [`music.location.${loc.id}`, `ambient.location.${loc.id}`]),
          ...seasons.map((s: any) => `music.season.${s.id}`),
        ]);
        const otherCustomKeys = [...new Set(
          mappings
            .filter(m => !ALL_ACTION_KEY_SET.has(m.actionKey) && !knownLocationSeasonKeys.has(m.actionKey))
            .map(m => m.actionKey)
        )];
        return (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #2a2a4e', paddingTop: '1.5rem' }}>
            <h3 style={{ color: '#e0c36e', marginBottom: '0.5rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Other Custom Keys
            </h3>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
              Map arbitrary action keys not covered above.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {otherCustomKeys.map(actionKey => (
                <CustomMappingRow
                  key={actionKey}
                  actionKey={actionKey}
                  mappings={getMappingsForAction(actionKey)}
                  sounds={sounds}
                  onAdd={addMapping}
                  onRemove={removeMapping}
                  onWeightChange={updateWeight}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="e.g. music.location.custom_loc"
                value={customKeyInput}
                onChange={e => setCustomKeyInput(e.target.value)}
                style={{ flex: 1, minWidth: 220, padding: '0.4rem 0.6rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: '0.8rem' }}
              />
              <select
                value={customKeySoundId}
                onChange={e => setCustomKeySoundId(e.target.value)}
                style={{ minWidth: 160, padding: '0.4rem 0.6rem', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: customKeySoundId ? '#e0e0ff' : '#666', fontSize: '0.8rem' }}
              >
                <option value="">Select sound...</option>
                {sounds.map(s => <option key={s.id} value={s.id}>{s.bus} · {s.name}</option>)}
              </select>
              <button
                className="btn-save"
                disabled={addingCustom || !customKeyInput.trim() || !customKeySoundId}
                onClick={async () => {
                  if (!customKeyInput.trim() || !customKeySoundId) return;
                  setAddingCustom(true);
                  await addMapping(customKeyInput.trim(), customKeySoundId);
                  setCustomKeyInput('');
                  setCustomKeySoundId('');
                  setAddingCustom(false);
                }}
              >
                {addingCustom ? '...' : 'Map'}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function AudioManagerContent() {
  const [tab, setTab] = useState<'library' | 'mappings'>('library');

  return (
    <div className="audio-manager">
      <div className="audio-manager-header">
        <div>
          <h1>Audio Manager</h1>
          <p className="audio-manager-subtitle">Manage sounds, music tracks, and action mappings</p>
        </div>
        <a href="/admin" className="icon-manager-back">← Admin</a>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid #2a2a4e', paddingBottom: '0.5rem' }}>
        {(['library', 'mappings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderBottom: tab === t ? '2px solid #6c63ff' : '2px solid transparent',
              background: 'none',
              color: tab === t ? '#e0e0ff' : '#888',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: tab === t ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {t === 'library' ? 'Sounds Library' : 'Action Mappings'}
          </button>
        ))}
      </div>

      {tab === 'library' && <SoundLibraryTab />}
      {tab === 'mappings' && <ActionMappingsTab />}
    </div>
  );
}

export default function AudioManagerPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <AudioManagerContent />;
}
