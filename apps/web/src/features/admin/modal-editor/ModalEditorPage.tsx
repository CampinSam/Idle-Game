import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminToken } from '../adminApi';
import ModalSpecEditor, { DEFAULT_SPEC } from './ModalSpecEditor';
import type { ModalSpecV1 } from '@derp/shared';

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!autoSubmitted.current) {
      autoSubmitted.current = true;
      adminApi.getTables().then(() => onLogin()).catch(() => {});
    }
  }, [onLogin]);
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#06060f]">
      <div className="bg-[#0f0f2e] border border-[#1a1a3e] rounded-xl p-8 max-w-sm w-full" style={{ textAlign: 'center' }}>
        <h1>Derp Universe Admin</h1>
        <p style={{ color: '#888', fontSize: '0.9rem', marginTop: 8 }}>
          Please <a href="/admin" style={{ color: '#7c3aed' }}>sign in</a> to access this page.
        </p>
      </div>
    </div>
  );
}

const DEFAULT_DB = { id: '', name: '', description: '', enabled: true, version: 1 };

const inp: React.CSSProperties = {
  width: '100%', padding: '6px 10px', background: '#0a0a1e', border: '1px solid #2a2a4e',
  borderRadius: 6, color: '#e0e0ff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModalEditorPage() {
  const [authed, setAuthed] = useState(!!(getAdminToken() || import.meta.env.DEV));
  const [modalList, setModalList] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dbRecord, setDbRecord] = useState({ ...DEFAULT_DB });
  const [spec, setSpec] = useState<ModalSpecV1>({ ...DEFAULT_SPEC });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await adminApi.list('modalDef');
      setModalList(list);
    } catch {
      setModalList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadList();
  }, [authed, loadList]);

  const loadModal = async (id: string) => {
    const rec = await adminApi.get('modalDef', id);
    setDbRecord({ id: rec.id, name: rec.name || '', description: rec.description || '', enabled: rec.enabled ?? true, version: rec.version || 1 });
    setSpec(rec.spec as ModalSpecV1 || { ...DEFAULT_SPEC, id: rec.id });
    setSelectedId(id);
    setDirty(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setDbRecord({ ...DEFAULT_DB });
    setSpec({ ...DEFAULT_SPEC });
    setDirty(false);
  };

  const handleSave = async () => {
    if (!dbRecord.id.trim()) { setSaveMsg('⚠ ID is required'); return; }
    if (!dbRecord.name.trim()) { setSaveMsg('⚠ Name is required'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        id: dbRecord.id.trim(),
        name: dbRecord.name.trim(),
        description: dbRecord.description || null,
        enabled: dbRecord.enabled,
        version: dbRecord.version || 1,
        spec: { ...spec, id: dbRecord.id.trim() },
      };
      if (!selectedId) {
        await adminApi.create('modalDef', payload);
      } else {
        await adminApi.update('modalDef', selectedId, payload);
      }
      setSelectedId(dbRecord.id.trim());
      setSpec(s => ({ ...s, id: dbRecord.id.trim() }));
      setDirty(false);
      setSaveMsg('✓ Saved');
      await loadList();
    } catch (err: any) {
      setSaveMsg(`✗ ${err.message || 'Save failed'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-[#06060f] text-[#e0e0ff] flex flex-col">
      {/* ── Topbar ── */}
      <div className="sticky top-0 z-[100] flex items-center justify-between px-4 py-[10px] bg-[rgba(6,6,15,0.95)] border-b border-[#1a1a3e] backdrop-blur-[8px] gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/admin" className="text-[#64748b] text-xs no-underline px-2 py-1 rounded-md border border-[#2a2a4e] bg-transparent transition-colors whitespace-nowrap hover:text-[#a78bfa] hover:border-[#a78bfa44]">← Admin</a>
          <span className="text-[15px] font-bold text-[#e0e0ff] tracking-[0.05em] whitespace-nowrap overflow-hidden text-ellipsis">Modal Editor</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveMsg && (
            <span className={`text-xs font-semibold ${saveMsg.startsWith('✓') ? 'text-[#34d399]' : 'text-[#ef4444]'}`}>{saveMsg}</span>
          )}
          {dirty && !saving && <span style={{ fontSize: 11, color: '#f59e0b' }}>● unsaved</span>}
          <button type="button" onClick={handleNew} className="me-btn-ghost">New</button>
          <button type="button" onClick={handleSave} disabled={saving} className="me-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Load bar ── */}
      <div className="flex gap-2 px-4 py-[10px] border-b border-[#1a1a3e] bg-[#0a0a1e]">
        <select
          style={{ flex: 1, minWidth: 0, padding: '6px 10px', background: '#0a0a1e', border: '1px solid #2a2a4e', borderRadius: 6, color: '#e0e0ff', fontSize: 13, fontFamily: 'inherit' }}
          value={selectedId || ''}
          onChange={e => e.target.value ? loadModal(e.target.value) : handleNew()}
        >
          <option value="">— New modal —</option>
          {modalList.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
          ))}
        </select>
        <button type="button" onClick={loadList} className="me-btn-ghost" disabled={listLoading} style={{ flexShrink: 0 }}>
          {listLoading ? '…' : '↻'}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 flex flex-col gap-0 p-0 overflow-y-auto">
        {/* ── Database Record ── */}
        <div style={{ borderBottom: '1px solid #1a1a3e' }}>
          <div style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #0e0e28 0%, #0a0a1e 100%)', borderBottom: '1px solid #1a1a3e' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa' }}>
              Database Record
            </span>
            {selectedId && <span style={{ marginLeft: 10, fontSize: 10, color: '#64748b', background: '#1a1a3e', border: '1px solid #2a2a4e', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>{selectedId}</span>}
          </div>
          <div style={{ padding: '12px 16px', background: '#0a0a1e', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="me-card">
              <Row>
                <div style={{ flex: 1 }}>
                  <Field label="ID (slug, e.g. mission_complete)">
                    <input style={inp} value={dbRecord.id} onChange={e => { setDbRecord(d => ({ ...d, id: e.target.value })); setDirty(true); }} />
                  </Field>
                </div>
                <div style={{ flex: 2 }}>
                  <Field label="Name (display)">
                    <input style={inp} value={dbRecord.name} onChange={e => { setDbRecord(d => ({ ...d, name: e.target.value })); setDirty(true); }} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Version">
                    <input type="number" style={inp} value={dbRecord.version} onChange={e => { setDbRecord(d => ({ ...d, version: Number(e.target.value) })); setDirty(true); }} />
                  </Field>
                </div>
              </Row>
              <Row>
                <div style={{ flex: 3 }}>
                  <Field label="Description (internal note)">
                    <input style={inp} value={dbRecord.description} onChange={e => { setDbRecord(d => ({ ...d, description: e.target.value })); setDirty(true); }} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Enabled">
                    <div style={{ padding: '7px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={dbRecord.enabled} onChange={e => { setDbRecord(d => ({ ...d, enabled: e.target.checked })); setDirty(true); }} />
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{dbRecord.enabled ? 'Yes' : 'No'}</span>
                    </div>
                  </Field>
                </div>
              </Row>
            </div>
          </div>
        </div>

        {/* ── Modal Spec Editor ── */}
        <ModalSpecEditor
          value={spec}
          onChange={s => { setSpec(s); setDirty(true); }}
        />
      </div>
    </div>
  );
}
