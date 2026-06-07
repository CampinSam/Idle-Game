import { useState, useCallback, useEffect, useRef } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props { me: AdminMe }

type InstanceTab = 'entities' | 'locations';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

const STATUS_OPTIONS = ['idle', 'working', 'mission', 'injured', 'resting'];

const BTN_PRIMARY = "py-[7px] px-4 bg-[#6c63ff] border-0 rounded-[8px] text-white text-[13px] font-semibold cursor-pointer transition-colors duration-[120ms] whitespace-nowrap hover:bg-[#5a52d5] disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_GHOST = "py-[7px] px-4 bg-transparent border border-[#1a1b35] rounded-[8px] text-[#6060a0] text-[13px] font-semibold cursor-pointer transition-[border-color,color] duration-[120ms] whitespace-nowrap hover:border-[#3a3a6a] hover:text-[#a0a0c8] disabled:opacity-50 disabled:cursor-not-allowed";
const SEARCH_INPUT = "flex-1 py-2 px-3 bg-[#080918] border border-[#1a1b35] rounded-[8px] text-[#d4d4f0] text-[13px] focus:outline-none focus:border-[#6c63ff]";
const SEARCH_BTN = "py-2 px-4 bg-[#6c63ff] border-0 rounded-[8px] text-white text-[13px] font-semibold cursor-pointer hover:bg-[#5a52d5]";
const MSG_SUCCESS = "py-2 px-3 rounded-[6px] text-[12px] bg-[rgba(5,150,105,0.12)] border border-[rgba(5,150,105,0.3)] text-[#34d399]";
const MSG_ERROR = "py-2 px-3 rounded-[6px] text-[12px] bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] text-[#f87171]";
const LOADING = "flex items-center justify-center p-[60px] text-[#4a4a7a] text-[13px]";
const EMPTY = "flex items-center justify-center text-[#3a3a6a] text-[13px] italic";
const TAB_BASE = "py-[5px] px-[12px] border rounded-[6px] bg-transparent text-[12px] font-semibold cursor-pointer transition-[background,color] duration-[120ms]";
const TAB_ACTIVE = "bg-[rgba(108,99,255,0.18)] border-[rgba(108,99,255,0.3)] text-[#a89fff]";
const TAB_INACTIVE = "border-transparent text-[#5a5a8a] hover:bg-[#1a1b35] hover:text-[#9090c8]";

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
        className={SEARCH_INPUT}
        placeholder="Search name, ID, or owner…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSearch()}
        style={{ flex: 1, minWidth: 200 }}
      />
      {extraFilters}
      <button className={SEARCH_BTN} onClick={onSearch}>Search</button>
    </div>
  );
}

function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid #1a1a3a', fontSize: 12, color: '#6060a0' }}>
      <button
        className={BTN_GHOST}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        style={{ fontSize: 12, padding: '3px 10px' }}
      >
        ← Prev
      </button>
      <span style={{ flex: 1, textAlign: 'center' }}>Page {page} of {pages} · {total} total</span>
      <button
        className={BTN_GHOST}
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
            <span style={{ color: hasOwner ? '#c0c0e8' : '#3a3a6a' }}>
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
                {[{ key: 'name', label: 'Name', type: 'text', min: undefined, max: undefined }, { key: 'level', label: 'Level', type: 'number', min: 1, max: 100 }].map(f => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 10, color: '#4a4a7a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{f.label}</label>
                    <input
                      type={f.type}
                      min={f.min}
                      max={f.max}
                      value={edits[f.key] ?? ''}
                      onChange={e => setEdits(p => ({ ...p, [f.key]: e.target.value }))}
                      disabled={!hasOwner}
                      style={{ padding: '4px 6px', background: '#0a0b1c', border: '1px solid #1a1a3a', borderRadius: 4, color: '#c0c0e8', fontSize: 12 }}
                    />
                  </div>
                ))}
                {STAT_KEYS.map(k => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: 10, color: '#4a4a7a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</label>
                    <input
                      type="number"
                      value={edits[k] ?? '0'}
                      onChange={e => setEdits(p => ({ ...p, [k]: e.target.value }))}
                      disabled={!hasOwner}
                      style={{ padding: '4px 6px', background: '#0a0b1c', border: '1px solid #1a1a3a', borderRadius: 4, color: '#c0c0e8', fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={BTN_PRIMARY}
                  onClick={save}
                  disabled={!hasOwner || saving}
                  style={{ fontSize: 12 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className={BTN_GHOST}
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
          <div className={msg.type === 'success' ? MSG_SUCCESS : MSG_ERROR}>
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
              className={BTN_GHOST}
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
          <div className={msg.type === 'success' ? MSG_SUCCESS : MSG_ERROR}>
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

  const fetchData = useCallback(async (params: { q: string; filterStatus: string; filterDef: string; filterNft: string; page: number }) => {
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

  useEffect(() => { fetchData({ q: '', filterStatus: '', filterDef: '', filterNft: '', page: 1 }); }, [fetchData]);

  const search = () => {
    setPage(1);
    setSelected(null);
    pendingParams.current = { q, filterStatus, filterDef, filterNft, page: 1 };
    fetchData({ q, filterStatus, filterDef, filterNft, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelected(null);
    fetchData({ q, filterStatus, filterDef, filterNft, page: p });
  };

  const refresh = () => {
    fetchData({ q, filterStatus, filterDef, filterNft, page });
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
          {loading && <div className={LOADING} style={{ padding: 24 }}>Loading…</div>}
          {!loading && error && <div className={`${MSG_ERROR} m-4`}>{error}</div>}
          {!loading && !error && data && data.items.length === 0 && (
            <div className={EMPTY} style={{ padding: 32 }}>No entity instances found.</div>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a3a' }}>
                  {['Name', 'Owner', 'Definition', 'Level', 'Status', 'Collection'].map(h => (
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
                    <td style={{ padding: '8px 12px', color: item.ownerUsername ? '#a0a0c0' : '#3a3a6a', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.ownerUsername ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6060a0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.definitionName}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#b8b8ff', fontWeight: 700 }}>{item.level}</td>
                    <td style={{ padding: '8px 12px' }}><StatusBadge status={item.status} /></td>
                    <td style={{ padding: '8px 12px', color: item.nftCollectionDefId ? '#c084fc' : '#2a2a4a', fontFamily: 'monospace', fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.nftCollectionDefId ? (item.nftCollectionDefId.length > 14 ? item.nftCollectionDefId.slice(0, 14) + '…' : item.nftCollectionDefId) : '—'}
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

  const fetchData = useCallback(async (params: { q: string; filterEnabled: string; filterDef: string; filterNft: string; page: number }) => {
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

  useEffect(() => { fetchData({ q: '', filterEnabled: '', filterDef: '', filterNft: '', page: 1 }); }, [fetchData]);

  const search = () => {
    setPage(1);
    setSelected(null);
    fetchData({ q, filterEnabled, filterDef, filterNft, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    setSelected(null);
    fetchData({ q, filterEnabled, filterDef, filterNft, page: p });
  };

  const refresh = () => {
    fetchData({ q, filterEnabled, filterDef, filterNft, page });
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
          {loading && <div className={LOADING} style={{ padding: 24 }}>Loading…</div>}
          {!loading && error && <div className={`${MSG_ERROR} m-4`}>{error}</div>}
          {!loading && !error && data && data.items.length === 0 && (
            <div className={EMPTY} style={{ padding: 32 }}>No location instances found.</div>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a3a' }}>
                  {['Name', 'Owner', 'Definition', 'Level', 'Enabled', 'Collection'].map(h => (
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
                    <td style={{ padding: '8px 12px', color: '#c0c0e8', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name || <span style={{ color: '#3a3a6a' }}>{item.id.slice(0, 12)}</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: item.ownerUsername ? '#a0a0c0' : '#3a3a6a', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.ownerUsername ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6060a0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.definitionId}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#b8b8ff', fontWeight: 700 }}>{item.level}</td>
                    <td style={{ padding: '8px 12px' }}><EnabledBadge enabled={item.enabled} /></td>
                    <td style={{ padding: '8px 12px', color: item.nftCollectionDefId ? '#34d399' : '#2a2a4a', fontFamily: 'monospace', fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.nftCollectionDefId ? (item.nftCollectionDefId.length > 14 ? item.nftCollectionDefId.slice(0, 14) + '…' : item.nftCollectionDefId) : '—'}
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
      <div className="flex flex-col items-center justify-center py-[60px] px-6 text-center text-[#4a4a7a]">
        <div className="text-[36px] mb-3 opacity-40">🔒</div>
        <div>You don't have player read permissions.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="flex gap-1 py-2 px-3 border-b border-[#1a1b35] bg-[#0a0b1c] flex-wrap flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`${TAB_BASE} ${tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}`}
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
