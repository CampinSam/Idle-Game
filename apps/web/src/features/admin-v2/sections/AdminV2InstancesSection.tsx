import { useState, useCallback, useEffect, useRef } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props { me: AdminMe }

type InstanceTab = 'entities' | 'locations';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

const STATUS_OPTIONS = ['idle', 'working', 'mission', 'injured', 'resting'];

function statusColor(status: string): string {
  switch (status) {
    case 'idle': return '#8888aa';
    case 'working': return '#f59e0b';
    case 'mission': return '#34d399';
    case 'injured': return '#f87171';
    default: return '#6366f1';
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      background: 'rgba(0,0,0,0.3)', color: statusColor(status),
      border: `1px solid ${statusColor(status)}44`,
      padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
    }}>
      {status}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span style={{
      background: enabled ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
      color: enabled ? '#34d399' : '#f87171',
      border: `1px solid ${enabled ? '#34d39944' : '#f8717144'}`,
      padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>
      {enabled ? 'ENABLED' : 'DISABLED'}
    </span>
  );
}

function FilterBar({
  q, setQ, onSearch,
  extraFilters,
}: {
  q: string; setQ: (v: string) => void; onSearch: () => void;
  extraFilters?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid #1a1a3a', flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="text"
        className="av2-search-input"
        placeholder="Search name, ID, or owner…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSearch()}
        style={{ flex: 1, minWidth: 200 }}
      />
      {extraFilters}
      <button className="av2-search-btn" onClick={onSearch}>Search</button>
    </div>
  );
}

function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid #1a1a3a', fontSize: 12, color: '#6060a0' }}>
      <button
        className="av2-btn-ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={{ fontSize: 12, padding: '3px 10px' }}
      >
        ← Prev
      </button>
      <span style={{ flex: 1, textAlign: 'center' }}>Page {page} of {pages} · {total} total</span>
      <button
        className="av2-btn-ghost"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        style={{ fontSize: 12, padding: '3px 10px' }}
      >
        Next →
      </button>
    </div>
  );
}

type EntityItem = {
  id: string; name: string; definitionId: string; definitionName: string;
  level: number; status: string; ownerUserId: string | null; ownerUsername: string | null;
  nftAssetId: string | null; nftCollectionDefId: string | null; stats: any; rarity: string | null;
};

type LocationItem = {
  id: string; name: string; definitionId: string; definitionName: string;
  level: number; enabled: boolean; ownerUserId: string | null; ownerUsername: string | null;
  nftAssetId: string | null; nftCollectionDefId: string | null; storage: any;
};

function EntityDetailPanel({
  entity,
  canWrite,
  onRefresh,
  onClose,
}: {
  entity: EntityItem;
  canWrite: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const stats = (entity.stats as any) || {};
  const [edits, setEdits] = useState<Record<string, string>>(() => ({
    name: entity.name || '',
    level: String(entity.level || 1),
    ...STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: String(stats[k] ?? 0) }), {}),
  }));
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const hasOwner = !!entity.ownerUserId;

  const save = async () => {
    if (!hasOwner) return;
    setSaving(true); setMsg(null);
    try {
      const newStats = { ...stats, ...STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: Number(edits[k] ?? stats[k] ?? 0) }), {}) };
      await adminApi.updatePlayerEntity(entity.ownerUserId!, entity.id, {
        stats: newStats,
        level: Number(edits.level) || entity.level,
        name: edits.name || undefined,
      });
      setMsg({ text: 'Entity updated', type: 'success' });
      onRefresh();
    } catch (e: any) {
      setMsg({ text: e.message || 'Save failed', type: 'error' });
    } finally { setSaving(false); }
  };

  const reconcile = async () => {
    if (!hasOwner) return;
    setReconciling(true); setMsg(null);
    try {
      const result = await adminApi.reconcileEntityStatus(entity.ownerUserId!, entity.id);
      setMsg({ text: result.changed ? `${result.previousStatus} → ${result.newStatus}` : `Already correct: ${result.newStatus}`, type: 'success' });
      if (result.changed) onRefresh();
    } catch (e: any) {
      setMsg({ text: e.message || 'Reconcile failed', type: 'error' });
    } finally { setReconciling(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1a1a3a' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {entity.name || entity.id.slice(0, 12)}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a4a7a', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
          <StatusBadge status={entity.status} />
          <span style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '1px 7px', borderRadius: 4, fontSize: 11 }}>
            Lv.{entity.level}
          </span>
          {entity.rarity && (
            <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 7px', borderRadius: 4, fontSize: 11 }}>
              {entity.rarity}
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>Owner</span>
            <span style={{ color: hasOwner ? '#c0c0e8' : '#3a3a6a', fontFamily: hasOwner ? 'inherit' : 'inherit' }}>
              {entity.ownerUsername ?? (hasOwner ? entity.ownerUserId!.slice(0, 12) : '— Unowned')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>Definition</span>
            <span style={{ color: '#c0c0e8' }}>{entity.definitionName}</span>
          </div>
          {entity.nftAssetId && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6060a0' }}>NFT</span>
              <span style={{ color: '#c084fc', fontFamily: 'monospace', fontSize: 11 }}>
                {entity.nftAssetId.length > 20 ? entity.nftAssetId.slice(0, 20) + '…' : entity.nftAssetId}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>ID</span>
            <span style={{ color: '#3a3a6a', fontFamily: 'monospace', fontSize: 11 }}>{entity.id.slice(0, 16)}…</span>
          </div>
        </div>

        {canWrite && (
          <>
            <div style={{ borderTop: '1px solid #1a1a3a', paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: '#4a4a7a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Stats &amp; Level</div>
              {!hasOwner && (
                <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                  Actions unavailable — entity has no owner
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div className="form-field">
                  <label>Name</label>
                  <input type="text" value={edits.name ?? ''} onChange={e => setEdits(p => ({ ...p, name: e.target.value }))} disabled={!hasOwner} />
                </div>
                <div className="form-field">
                  <label>Level</label>
                  <input type="number" min="1" max="100" value={edits.level ?? '1'} onChange={e => setEdits(p => ({ ...p, level: e.target.value }))} disabled={!hasOwner} />
                </div>
                {STAT_KEYS.map(k => (
                  <div key={k} className="form-field">
                    <label>{k}</label>
                    <input type="number" value={edits[k] ?? '0'} onChange={e => setEdits(p => ({ ...p, [k]: e.target.value }))} disabled={!hasOwner} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="av2-btn-primary"
                  onClick={save}
                  disabled={!hasOwner || saving}
                  style={{ fontSize: 12 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="av2-btn-ghost"
                  onClick={reconcile}
                  disabled={!hasOwner || reconciling}
                  title={!hasOwner ? 'No owner — cannot reconcile' : 'Check active jobs and correct entity status'}
                  style={{ fontSize: 12 }}
                >
                  {reconciling ? '…' : '⚙ Reconcile'}
                </button>
              </div>
            </div>
          </>
        )}

        {msg && (
          <div className={`av2-inline-msg ${msg.type === 'success' ? 'success' : 'error'}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function LocationDetailPanel({
  location,
  canWrite,
  onRefresh,
  onClose,
}: {
  location: LocationItem;
  canWrite: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [settling, setSettling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const storage = (location.storage as any) || {};
  const stored = storage.stored || {};
  const capacity = storage.capacity || {};
  const hasOwner = !!location.ownerUserId;

  const settle = async () => {
    if (!hasOwner) return;
    setSettling(true); setMsg(null);
    try {
      await adminApi.forceSettleLocation(location.ownerUserId!, location.id);
      setMsg({ text: 'Production settled', type: 'success' });
      onRefresh();
    } catch (e: any) {
      setMsg({ text: e.message || 'Force settle failed', type: 'error' });
    } finally { setSettling(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1a1a3a' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#c0c0e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {location.name || location.id.slice(0, 12)}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a4a7a', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
          <EnabledBadge enabled={location.enabled} />
          <span style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '1px 7px', borderRadius: 4, fontSize: 11 }}>
            Lv.{location.level}
          </span>
        </div>

        <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>Owner</span>
            <span style={{ color: hasOwner ? '#c0c0e8' : '#3a3a6a' }}>
              {location.ownerUsername ?? (hasOwner ? location.ownerUserId!.slice(0, 12) : '— Unowned')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>Definition</span>
            <span style={{ color: '#c0c0e8' }}>{location.definitionId}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>Kind</span>
            <span style={{ color: '#b0b0d0' }}>{location.definitionName}</span>
          </div>
          {location.nftAssetId && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6060a0' }}>NFT</span>
              <span style={{ color: '#34d399', fontFamily: 'monospace', fontSize: 11 }}>
                {location.nftAssetId.length > 20 ? location.nftAssetId.slice(0, 20) + '…' : location.nftAssetId}
              </span>
            </div>
          )}
          {location.nftCollectionDefId && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6060a0' }}>Collection</span>
              <span style={{ color: '#6060a0', fontFamily: 'monospace', fontSize: 11 }}>
                {location.nftCollectionDefId.length > 20 ? location.nftCollectionDefId.slice(0, 20) + '…' : location.nftCollectionDefId}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6060a0' }}>ID</span>
            <span style={{ color: '#3a3a6a', fontFamily: 'monospace', fontSize: 11 }}>{location.id.slice(0, 16)}…</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1a1a3a', paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: '#4a4a7a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Storage</div>
          {Object.keys(stored).length === 0 ? (
            <div style={{ fontSize: 12, color: '#3a3a6a', fontStyle: 'italic' }}>Empty</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(stored).map(([resource, amount]) => {
                const cap = (capacity as any)[resource];
                const pct = cap ? Math.round((Number(amount) / Number(cap)) * 100) : null;
                return (
                  <div key={resource} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#8888aa', minWidth: 80 }}>{resource}</span>
                    <div style={{ flex: 1, background: '#1a1a3a', borderRadius: 3, height: 4 }}>
                      {pct !== null && (
                        <div style={{ width: `${Math.min(pct, 100)}%`, background: '#6366f1', borderRadius: 3, height: 4 }} />
                      )}
                    </div>
                    <span style={{ color: '#c0c0e8', fontFamily: 'monospace', flexShrink: 0 }}>
                      {String(amount)}{cap ? ` / ${cap}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canWrite && (
          <div style={{ borderTop: '1px solid #1a1a3a', paddingTop: 12 }}>
            {!hasOwner && (
              <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                Actions unavailable — location has no owner
              </div>
            )}
            <button
              className="av2-btn-ghost"
              onClick={settle}
              disabled={!hasOwner || settling}
              title={!hasOwner ? 'No owner — cannot settle' : 'Recalculate production for this location'}
              style={{ fontSize: 12 }}
            >
              {settling ? '…' : '⚡ Force Settle'}
            </button>
          </div>
        )}

        {msg && (
          <div className={`av2-inline-msg ${msg.type === 'success' ? 'success' : 'error'}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityInstancesTab({ me }: { me: AdminMe }) {
  const canWrite = !!(me.effectivePermissions ?? me.role.permissionFlags).player_write;
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDef, setFilterDef] = useState('');
  const [filterNft, setFilterNft] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: EntityItem[]; total: number; page: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EntityItem | null>(null);
  const pendingParams = useRef({ q: '', filterStatus: '', filterDef: '', filterNft: '', page: 1 });

  const fetch = useCallback(async (params: { q: string; filterStatus: string; filterDef: string; filterNft: string; page: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listEntityInstances({
        q: params.q || undefined,
        page: params.page,
        limit: 50,
        status: params.filterStatus || undefined,
        definitionId: params.filterDef || undefined,
        nftCollectionDefId: params.filterNft || undefined,
      });
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch({ q: '', filterStatus: '', filterDef: '', filterNft: '', page: 1 }); }, [fetch]);

  const search = () => {
    setPage(1);
    setSelected(null);
    pendingParams.current = { q, filterStatus, filterDef, filterNft, page: 1 };
    fetch({ q, filterStatus, filterDef, filterNft, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelected(null);
    fetch({ q, filterStatus, filterDef, filterNft, page: p });
  };

  const refresh = () => {
    fetch({ q, filterStatus, filterDef, filterNft, page });
    setSelected(null);
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid #1a1a3a' : 'none' }}>
        <FilterBar
          q={q} setQ={setQ} onSearch={search}
          extraFilters={
            <>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px' }}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                placeholder="Definition ID"
                value={filterDef}
                onChange={e => setFilterDef(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px', width: 120 }}
              />
              <input
                type="text"
                placeholder="NFT collection"
                value={filterNft}
                onChange={e => setFilterNft(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px', width: 140 }}
              />
            </>
          }
        />

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div className="av2-loading" style={{ padding: 24 }}>Loading…</div>}
          {!loading && error && <div className="av2-inline-msg error" style={{ margin: 16 }}>{error}</div>}
          {!loading && !error && data && data.items.length === 0 && (
            <div className="av2-empty" style={{ padding: 32 }}>No entity instances found.</div>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a3a' }}>
                  {['Name', 'Owner', 'Definition', 'Level', 'Status'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: '#4a4a7a', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(selected?.id === item.id ? null : item)}
                    style={{
                      borderBottom: '1px solid #12122a',
                      cursor: 'pointer',
                      background: selected?.id === item.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (selected?.id !== item.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected?.id === item.id ? 'rgba(99,102,241,0.1)' : 'transparent'; }}
                  >
                    <td style={{ padding: '8px 12px', color: '#c0c0e8', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name || <span style={{ color: '#3a3a6a' }}>{item.id.slice(0, 12)}</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: item.ownerUsername ? '#a0a0c0' : '#3a3a6a', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.ownerUsername ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6060a0', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.definitionName}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#b8b8ff', fontWeight: 700 }}>{item.level}</td>
                    <td style={{ padding: '8px 12px' }}><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && <Pager page={page} total={data.total} limit={data.limit} onPage={goPage} />}
      </div>

      {selected && (
        <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <EntityDetailPanel
            entity={selected}
            canWrite={canWrite}
            onRefresh={refresh}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}

function LocationInstancesTab({ me }: { me: AdminMe }) {
  const canWrite = !!(me.effectivePermissions ?? me.role.permissionFlags).player_write;
  const [q, setQ] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [filterDef, setFilterDef] = useState('');
  const [filterNft, setFilterNft] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LocationItem[]; total: number; page: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LocationItem | null>(null);

  const fetch = useCallback(async (params: { q: string; filterEnabled: string; filterDef: string; filterNft: string; page: number }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listLocationInstances({
        q: params.q || undefined,
        page: params.page,
        limit: 50,
        enabled: params.filterEnabled === 'true' ? true : params.filterEnabled === 'false' ? false : undefined,
        definitionId: params.filterDef || undefined,
        nftCollectionDefId: params.filterNft || undefined,
      });
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch({ q: '', filterEnabled: '', filterDef: '', filterNft: '', page: 1 }); }, [fetch]);

  const search = () => {
    setPage(1);
    setSelected(null);
    fetch({ q, filterEnabled, filterDef, filterNft, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelected(null);
    fetch({ q, filterEnabled, filterDef, filterNft, page: p });
  };

  const refresh = () => {
    fetch({ q, filterEnabled, filterDef, filterNft, page });
    setSelected(null);
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid #1a1a3a' : 'none' }}>
        <FilterBar
          q={q} setQ={setQ} onSearch={search}
          extraFilters={
            <>
              <select
                value={filterEnabled}
                onChange={e => setFilterEnabled(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px' }}
              >
                <option value="">All (enabled/disabled)</option>
                <option value="true">Enabled only</option>
                <option value="false">Disabled only</option>
              </select>
              <input
                type="text"
                placeholder="Definition ID"
                value={filterDef}
                onChange={e => setFilterDef(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px', width: 120 }}
              />
              <input
                type="text"
                placeholder="NFT collection"
                value={filterNft}
                onChange={e => setFilterNft(e.target.value)}
                style={{ background: '#0d0d1f', border: '1px solid #2a2a4a', borderRadius: 6, color: '#c0c0e8', fontSize: 12, padding: '5px 8px', width: 140 }}
              />
            </>
          }
        />

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div className="av2-loading" style={{ padding: 24 }}>Loading…</div>}
          {!loading && error && <div className="av2-inline-msg error" style={{ margin: 16 }}>{error}</div>}
          {!loading && !error && data && data.items.length === 0 && (
            <div className="av2-empty" style={{ padding: 32 }}>No location instances found.</div>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a3a' }}>
                  {['Name', 'Owner', 'Definition', 'Level', 'Enabled', 'NFT'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: '#4a4a7a', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(selected?.id === item.id ? null : item)}
                    style={{
                      borderBottom: '1px solid #12122a',
                      cursor: 'pointer',
                      background: selected?.id === item.id ? 'rgba(52,211,153,0.08)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (selected?.id !== item.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected?.id === item.id ? 'rgba(52,211,153,0.08)' : 'transparent'; }}
                  >
                    <td style={{ padding: '8px 12px', color: '#c0c0e8', fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name || <span style={{ color: '#3a3a6a' }}>{item.id.slice(0, 12)}</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: item.ownerUsername ? '#a0a0c0' : '#3a3a6a', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.ownerUsername ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6060a0', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.definitionId}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#b8b8ff', fontWeight: 700 }}>{item.level}</td>
                    <td style={{ padding: '8px 12px' }}><EnabledBadge enabled={item.enabled} /></td>
                    <td style={{ padding: '8px 12px', color: item.nftAssetId ? '#34d399' : '#2a2a4a', fontSize: 11 }}>
                      {item.nftAssetId ? '✓' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && <Pager page={page} total={data.total} limit={data.limit} onPage={goPage} />}
      </div>

      {selected && (
        <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <LocationDetailPanel
            location={selected}
            canWrite={canWrite}
            onRefresh={refresh}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}

const TABS: { key: InstanceTab; label: string; emoji: string }[] = [
  { key: 'entities', label: 'Entities', emoji: '🧬' },
  { key: 'locations', label: 'Locations', emoji: '🏰' },
];

export default function AdminV2InstancesSection({ me }: Props) {
  const canRead = !!(me.effectivePermissions ?? me.role.permissionFlags).player_read;
  const [tab, setTab] = useState<InstanceTab>('entities');

  if (!canRead) {
    return (
      <div className="av2-access-denied">
        <div className="av2-access-denied-icon">🔒</div>
        <div>You don't have player read permissions.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="av2-system-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`av2-system-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {tab === 'entities' && <EntityInstancesTab me={me} />}
        {tab === 'locations' && <LocationInstancesTab me={me} />}
      </div>
    </div>
  );
}
