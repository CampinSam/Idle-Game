import { useState, useEffect, useCallback } from 'react';
import { adminApi } from './adminApi';

type GodTab = 'profile' | 'items' | 'jobs' | 'entities' | 'locations' | 'effects' | 'telemetry';

function StatusMsg({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem', borderRadius: 6, marginTop: '0.75rem', fontSize: '0.85rem',
      background: type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
      color: type === 'success' ? '#4caf50' : '#ff6b6b',
      border: `1px solid ${type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
    }}>{msg}</div>
  );
}

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

function ProfileTab({ player, onReload }: { player: any; onReload: () => void }) {
  const [editFields, setEditFields] = useState({
    keeperLevel: player.keeperLevel,
    keeperXp: String(player.keeperXp || '0'),
    prestigeTokens: player.prestigeTokens || 0,
    flags: JSON.stringify(player.flags || {}, null, 2),
  });
  const [currencyEdits, setCurrencyEdits] = useState<Record<string, string>>(() => {
    const ce: Record<string, string> = {};
    (player.currencyBalances || []).forEach((cb: any) => { ce[cb.currencyId] = String(cb.balance); });
    return ce;
  });
  const [maxAmount, setMaxAmount] = useState('999999');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [devWalletChain, setDevWalletChain] = useState('ETH');
  const [devWalletAddress, setDevWalletAddress] = useState('');
  const [devWalletSubmitting, setDevWalletSubmitting] = useState(false);

  const savePlayer = async () => {
    setSaving(true); setMsg(null);
    try {
      let flags = player.flags;
      try { flags = JSON.parse(editFields.flags); } catch {}
      await adminApi.updatePlayer(player.id, {
        keeperLevel: Number(editFields.keeperLevel),
        keeperXp: editFields.keeperXp,
        prestigeTokens: Number(editFields.prestigeTokens),
        flags,
      });
      setMsg({ text: 'Player updated', type: 'success' });
      onReload();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const saveCurrency = async (currencyId: string) => {
    setMsg(null);
    try {
      await adminApi.setPlayerCurrency(player.id, currencyId, currencyEdits[currencyId] || '0');
      setMsg({ text: `${currencyId} updated`, type: 'success' });
      onReload();
    } catch (e: any) { setMsg({ text: e.message, type: 'error' }); }
  };

  const maxAllCurrencies = async () => {
    setMsg(null);
    const amount = maxAmount || '999999';
    try {
      for (const cb of (player.currencyBalances || [])) {
        await adminApi.setPlayerCurrency(player.id, cb.currencyId, amount);
      }
      setMsg({ text: `All currencies set to ${amount}`, type: 'success' });
      onReload();
    } catch (e: any) { setMsg({ text: e.message, type: 'error' }); }
  };

  const resetPlayer = async () => {
    if (!confirm(`Reset ${player.username}? Deletes ALL game data. Account stays.`)) return;
    setMsg(null);
    try {
      await adminApi.resetPlayer(player.id);
      setMsg({ text: 'Player reset to fresh state', type: 'success' });
      onReload();
    } catch (e: any) { setMsg({ text: e.message, type: 'error' }); }
  };

  const addDevWallet = async () => {
    const trimmed = devWalletAddress.trim();
    if (!trimmed) { setMsg({ text: 'Wallet address is required', type: 'error' }); return; }
    setDevWalletSubmitting(true); setMsg(null);
    try {
      await adminApi.addPlayerWallet(player.id, devWalletChain, trimmed);
      setMsg({ text: `Wallet added (${devWalletChain})`, type: 'success' });
      setDevWalletAddress('');
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setDevWalletSubmitting(false); }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="form-field">
          <label>Keeper Level</label>
          <input type="number" value={editFields.keeperLevel || ''} onChange={(e) => setEditFields({ ...editFields, keeperLevel: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Keeper XP</label>
          <input type="text" value={editFields.keeperXp || ''} onChange={(e) => setEditFields({ ...editFields, keeperXp: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Prestige Tokens</label>
          <input type="number" value={editFields.prestigeTokens || ''} onChange={(e) => setEditFields({ ...editFields, prestigeTokens: e.target.value })} />
        </div>
      </div>

      <div className="form-field" style={{ marginBottom: '1rem' }}>
        <label>Flags (JSON)</label>
        <textarea
          rows={4}
          value={editFields.flags || '{}'}
          onChange={(e) => setEditFields({ ...editFields, flags: e.target.value })}
          style={{ width: '100%', padding: '0.6rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#a0e0a0', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        <button onClick={savePlayer} className="btn-save" disabled={saving}>Save Profile</button>
        <button onClick={resetPlayer} style={{
          padding: '0.5rem 1rem', border: '1px solid #ff6b6b', borderRadius: 6,
          background: 'rgba(255,107,107,0.1)', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
        }}>Reset Account</button>
      </div>

      <h4 style={{ margin: '0 0 0.75rem', color: '#b8b8ff', borderTop: '1px solid #2a2a4e', paddingTop: '1rem' }}>Currencies</h4>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          style={{ width: 120, padding: '0.4rem', border: '1px solid #333', borderRadius: 4, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem' }}
        />
        <button onClick={maxAllCurrencies} style={{
          padding: '0.4rem 0.9rem', border: '1px solid #6c63ff', borderRadius: 6,
          background: 'rgba(108,99,255,0.2)', color: '#b8b0ff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
        }}>⚡ Max All Currencies</button>
      </div>
      {(player.currencyBalances || []).length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No currencies</div>}
      {(player.currencyBalances || []).map((cb: any) => (
        <div key={cb.currencyId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ minWidth: 160, fontSize: '0.85rem', color: '#b0b0d0' }}>{cb.currencyId}</span>
          <input
            type="text"
            value={currencyEdits[cb.currencyId] || ''}
            onChange={(e) => setCurrencyEdits({ ...currencyEdits, [cb.currencyId]: e.target.value })}
            style={{ flex: 1, padding: '0.4rem', border: '1px solid #333', borderRadius: 4, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem' }}
          />
          <button onClick={() => saveCurrency(cb.currencyId)} className="btn-edit" style={{ padding: '0.35rem 0.6rem' }}>Set</button>
        </div>
      ))}

      <div style={{ marginTop: '1.5rem', borderTop: '1px dashed #2a2a4e', paddingTop: '1rem' }}>
        <button
          onClick={() => setDevToolsOpen((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#555',
            fontSize: '0.8rem', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>{devToolsOpen ? '▼' : '▶'}</span>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dev Tools</span>
        </button>

        {devToolsOpen && (
          <div style={{ marginTop: '0.75rem', background: '#0a1020', border: '1px solid #1e2a3e', borderRadius: 8, padding: '0.85rem' }}>
            <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.6rem', fontStyle: 'italic' }}>
              Add wallet address without verification (admin only)
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <select
                value={devWalletChain}
                onChange={(e) => setDevWalletChain(e.target.value)}
                disabled={devWalletSubmitting}
                style={{ padding: '0.4rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem', minWidth: 110 }}
              >
                <option value="ETH">Ethereum</option>
                <option value="BASE">Base</option>
                <option value="MATIC">Polygon</option>
                <option value="CARDANO">Cardano</option>
              </select>
              <input
                type="text"
                placeholder="Wallet address"
                value={devWalletAddress}
                onChange={(e) => setDevWalletAddress(e.target.value)}
                disabled={devWalletSubmitting}
                style={{ flex: 1, minWidth: 160, padding: '0.4rem', border: '1px solid #333', borderRadius: 6, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.85rem', fontFamily: 'monospace' }}
              />
              <button
                onClick={addDevWallet}
                disabled={devWalletSubmitting}
                style={{
                  padding: '0.4rem 0.85rem', border: '1px solid #4a4a7e', borderRadius: 6,
                  background: 'rgba(108,99,255,0.15)', color: '#b8b0ff', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                {devWalletSubmitting ? '...' : 'Add Wallet'}
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function ItemsTab({ player }: { player: any }) {
  const [itemDefs, setItemDefs] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [playerItems, setPlayerItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [defs, items] = await Promise.all([adminApi.listItemDefs(), adminApi.getPlayerItems(player.id)]);
      setItemDefs(defs);
      setPlayerItems(items as any[]);
      if (defs.length > 0 && !selectedItem) setSelectedItem(defs[0].id);
    } catch {}
  }, [player.id, selectedItem]);

  useEffect(() => { load(); }, [load]);

  const grant = async () => {
    if (!selectedItem) return;
    setLoading(true); setMsg(null);
    try {
      const result = await adminApi.grantItems(player.id, selectedItem, Number(quantity) || 1);
      setMsg({ text: `Granted ${quantity}x ${selectedItem}. New qty: ${result.newQty}`, type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setLoading(false); }
  };

  const filteredDefs = search ? itemDefs.filter(d => d.id.toLowerCase().includes(search.toLowerCase()) || d.name?.toLowerCase().includes(search.toLowerCase())) : itemDefs;

  return (
    <div>
      <div style={{ background: '#0f1a30', padding: '1rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.75rem', color: '#b8b8ff', fontSize: '0.95rem' }}>Spawn Item</h4>
        <input
          type="text"
          placeholder="Filter items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', border: '1px solid #333', borderRadius: 6, background: '#0a1020', color: '#e0e0ff', fontSize: '0.85rem', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
            style={{ flex: 1, padding: '0.5rem', border: '1px solid #333', borderRadius: 6, background: '#0a1020', color: '#e0e0ff', fontSize: '0.85rem' }}
          >
            {filteredDefs.map((d) => (
              <option key={d.id} value={d.id}>{d.name || d.id} ({d.id})</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="9999"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: 80, padding: '0.5rem', border: '1px solid #333', borderRadius: 6, background: '#0a1020', color: '#e0e0ff', fontSize: '0.85rem' }}
          />
          <button onClick={grant} className="btn-save" disabled={loading}>Give</button>
        </div>
      </div>

      <h4 style={{ margin: '0 0 0.5rem', color: '#b8b8ff', fontSize: '0.9rem' }}>Player Inventory ({playerItems.length} items)</h4>
      {playerItems.length === 0 && <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.85rem' }}>No items</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
        {playerItems.map((item: any) => (
          <div key={item.itemId} style={{ background: '#0f1a30', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #2a2a4e', fontSize: '0.85rem' }}>
            <span style={{ color: '#e0e0ff', fontWeight: 600 }}>{(item as any).item?.name || item.itemId}</span>
            <span style={{ color: '#888', marginLeft: 8 }}>×{item.quantity}</span>
          </div>
        ))}
      </div>

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function JobsTab({ player }: { player: any }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await adminApi.getPlayerJobs(player.id);
      setJobs(j);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setLoading(false); }
  }, [player.id]);

  useEffect(() => { load(); }, [load]);

  const forceComplete = async (jobId: string) => {
    setCompleting(jobId); setMsg(null);
    try {
      await adminApi.forceCompleteJob(player.id, jobId);
      setMsg({ text: 'Job force-completed!', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setCompleting(null); }
  };

  const STATUS_COLORS: Record<string, string> = {
    active: '#4fc3f7', ready_notified: '#81c784', completed: '#4caf50', failed: '#e57373', pending: '#ffb74d',
  };

  if (loading) return <div style={{ color: '#888' }}>Loading jobs...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ color: '#b8b8ff', fontSize: '0.9rem' }}>{jobs.length} total jobs</span>
        <button onClick={load} className="btn-edit" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Refresh</button>
      </div>
      {jobs.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No jobs found</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((job) => {
          const isActive = job.status === 'active' || job.status === 'pending';
          return (
            <div key={job.id} style={{
              background: '#0f1a30', padding: '0.6rem 0.75rem', borderRadius: 8,
              border: '1px solid #2a2a4e', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: 'rgba(108,99,255,0.2)', color: '#9d96ff' }}>{job.type}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e0e0ff' }}>{job.defId || job.id.slice(0, 8)}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: STATUS_COLORS[job.status] || '#aaa' }}>{job.status}</span>
                {job.updatedAt && <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 8 }}>{new Date(job.updatedAt).toLocaleString()}</span>}
              </div>
              {isActive && (
                <button
                  onClick={() => forceComplete(job.id)}
                  disabled={completing === job.id}
                  style={{
                    padding: '0.35rem 0.75rem', border: '1px solid #6c63ff', borderRadius: 6,
                    background: 'rgba(108,99,255,0.2)', color: '#b8b0ff', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  {completing === job.id ? '...' : '⚡ Force Complete'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function EntityPowerUsageSection({ playerId, entityId }: { playerId: string; entityId: string }) {
  const [usages, setUsages] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const data = await adminApi.getEntityPowerUsage(playerId, entityId);
      setUsages(data);
    } catch (e: any) {
      setUsages([]);
      setLoadError(e.message || 'Failed to load power usage');
    }
  };

  useEffect(() => { load(); }, [playerId, entityId]);

  const handleReset = async (powerKey: string) => {
    if (!window.confirm(`Reset power usage for "${powerKey}"? This will allow the power to be used again immediately.`)) return;
    setResetting(powerKey); setMsg(null);
    try {
      await adminApi.resetEntityPowerUsage(playerId, entityId, powerKey);
      setMsg({ text: `Reset "${powerKey}" successfully`, type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setResetting(null); }
  };

  if (usages === null) return <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.75rem' }}>Loading power usage...</div>;
  if (loadError) return (
    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #2a2a4e', paddingTop: '0.75rem' }}>
      <div style={{ color: '#b8b0ff', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>Power Usage</div>
      <StatusMsg msg={`Failed to load: ${loadError}`} type="error" />
    </div>
  );
  if (usages.length === 0) return null;

  return (
    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #2a2a4e', paddingTop: '0.75rem' }}>
      <div style={{ color: '#b8b0ff', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>Power Usage</div>
      {usages.map((usage) => (
        <div key={usage.powerKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.8rem' }}>
          <span style={{ color: '#e0e0ff', flex: 1 }}>{usage.powerKey}</span>
          <span style={{ color: '#888' }}>uses: {usage.usageCount ?? 1}</span>
          {usage.resetAt && (
            <span style={{ color: '#666' }}>resets: {new Date(usage.resetAt).toLocaleString()}</span>
          )}
          <button
            onClick={() => handleReset(usage.powerKey)}
            disabled={resetting === usage.powerKey}
            style={{
              padding: '0.2rem 0.6rem', border: '1px solid #c0392b', borderRadius: 4,
              background: 'rgba(192,57,43,0.15)', color: '#e74c3c', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600,
            }}
          >
            {resetting === usage.powerKey ? '...' : 'Reset'}
          </button>
        </div>
      ))}
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

const STATUS_BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  idle:     { bg: 'rgba(76,175,80,0.15)',   color: '#81c784', border: 'rgba(76,175,80,0.3)' },
  mission:  { bg: 'rgba(79,195,247,0.15)',  color: '#4fc3f7', border: 'rgba(79,195,247,0.3)' },
  crafting: { bg: 'rgba(255,183,77,0.15)',  color: '#ffb74d', border: 'rgba(255,183,77,0.3)' },
  working:  { bg: 'rgba(206,147,216,0.15)', color: '#ce93d8', border: 'rgba(206,147,216,0.3)' },
  injured:  { bg: 'rgba(229,115,115,0.15)', color: '#e57373', border: 'rgba(229,115,115,0.3)' },
};

function EntityStatusBadge({ status }: { status: string }) {
  const colors = STATUS_BADGE_COLORS[status] ?? { bg: 'rgba(136,136,136,0.15)', color: '#aaa', border: 'rgba(136,136,136,0.3)' };
  return (
    <span style={{
      fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: 4, fontWeight: 600,
      background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
      textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>{status}</span>
  );
}

function EntitiesTab({ player, onReload }: { player: any; onReload: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entityEdits, setEntityEdits] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [entityMsgs, setEntityMsgs] = useState<Record<string, { text: string; type: 'success' | 'error' }>>({});
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const initEdit = (entity: any) => {
    const stats = (entity.stats as any) || {};
    setEntityEdits((prev) => ({
      ...prev,
      [entity.id]: {
        name: (entity.display as any)?.name || '',
        level: entity.level || 1,
        ...STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: String(stats[k] ?? 0) }), {}),
      },
    }));
  };

  const toggle = (entity: any) => {
    if (expanded === entity.id) {
      setExpanded(null);
    } else {
      setExpanded(entity.id);
      if (!entityEdits[entity.id]) initEdit(entity);
    }
  };

  const saveEntity = async (entity: any) => {
    setSaving(entity.id); setMsg(null);
    try {
      const edit = entityEdits[entity.id] || {};
      const existingStats = (entity.stats as any) || {};
      const newStats = {
        ...existingStats,
        ...STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: Number(edit[k] ?? existingStats[k] ?? 0) }), {}),
      };
      await adminApi.updatePlayerEntity(player.id, entity.id, {
        stats: newStats,
        level: Number(edit.level) || entity.level,
        name: edit.name || undefined,
      });
      setMsg({ text: `Entity ${entity.id.slice(0, 8)} saved`, type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setSaving(null); }
  };

  const reconcileEntity = async (entity: any) => {
    setReconciling(entity.id);
    setEntityMsgs((prev) => { const n = { ...prev }; delete n[entity.id]; return n; });
    try {
      const result = await adminApi.reconcileEntityStatus(player.id, entity.id);
      if (result.changed) {
        setEntityMsgs((prev) => ({
          ...prev,
          [entity.id]: { text: `Status: ${result.previousStatus} → ${result.newStatus}${result.jobId ? ` (job ${result.jobId.slice(0, 8)})` : ''}`, type: 'success' },
        }));
        onReload();
      } else {
        setEntityMsgs((prev) => ({
          ...prev,
          [entity.id]: { text: `Already correct: ${result.newStatus}${result.jobId ? ` (job ${result.jobId.slice(0, 8)})` : ''}`, type: 'success' },
        }));
      }
    } catch (e: any) {
      setEntityMsgs((prev) => ({ ...prev, [entity.id]: { text: e.message, type: 'error' } }));
    } finally { setReconciling(null); }
  };

  const entities = player.entities || [];

  return (
    <div>
      {entities.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No entities</div>}
      {entities.map((entity: any) => {
        const display = (entity.display as any) || {};
        const stats = (entity.stats as any) || {};
        const isOpen = expanded === entity.id;
        const edit = entityEdits[entity.id] || {};
        return (
          <div key={entity.id} style={{ marginBottom: 8, background: '#0f1a30', borderRadius: 8, border: '1px solid #2a2a4e', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => toggle(entity)}
                style={{
                  flex: 1, padding: '0.65rem 0.9rem', background: 'transparent', border: 'none',
                  color: '#e0e0ff', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: '1rem' }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display.name || entity.id.slice(0, 12)}</span>
                <span style={{ color: '#888', fontSize: '0.8rem', flexShrink: 0 }}>{entity.definitionId}</span>
                <EntityStatusBadge status={(entity.state as any)?.status || 'idle'} />
                <span style={{ marginLeft: 'auto', color: '#b8b8ff', fontSize: '0.8rem', flexShrink: 0 }}>Lv.{entity.level}</span>
                <span style={{ color: '#666', fontSize: '0.75rem', marginLeft: 8, flexShrink: 0 }}>{entity.rarity}</span>
              </button>
              <button
                onClick={() => reconcileEntity(entity)}
                disabled={reconciling === entity.id}
                title="Check active jobs and set correct status"
                style={{
                  padding: '0.35rem 0.65rem', margin: '0 0.5rem', border: '1px solid #444', borderRadius: 6,
                  background: 'rgba(255,255,255,0.05)', color: '#888', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {reconciling === entity.id ? '...' : '⚙ Reconcile'}
              </button>
            </div>

            {entityMsgs[entity.id] && (
              <div style={{ margin: '0 0.9rem 0.5rem' }}>
                <StatusMsg msg={entityMsgs[entity.id].text} type={entityMsgs[entity.id].type} />
              </div>
            )}

            {isOpen && (
              <div style={{ padding: '0 0.9rem 0.9rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div className="form-field">
                    <label>Name</label>
                    <input type="text" value={edit.name ?? display.name ?? ''} onChange={(e) => setEntityEdits((prev) => ({ ...prev, [entity.id]: { ...prev[entity.id], name: e.target.value } }))} />
                  </div>
                  <div className="form-field">
                    <label>Level</label>
                    <input type="number" min="1" max="100" value={edit.level ?? entity.level ?? 1} onChange={(e) => setEntityEdits((prev) => ({ ...prev, [entity.id]: { ...prev[entity.id], level: e.target.value } }))} />
                  </div>
                  {STAT_KEYS.map((k) => (
                    <div key={k} className="form-field">
                      <label>{k}</label>
                      <input type="number" value={edit[k] ?? String(stats[k] ?? 0)} onChange={(e) => setEntityEdits((prev) => ({ ...prev, [entity.id]: { ...prev[entity.id], [k]: e.target.value } }))} />
                    </div>
                  ))}
                </div>
                <button onClick={() => saveEntity(entity)} className="btn-save" disabled={saving === entity.id}>
                  {saving === entity.id ? 'Saving...' : 'Save Entity'}
                </button>
                <EntityPowerUsageSection playerId={player.id} entityId={entity.id} />
              </div>
            )}
          </div>
        );
      })}
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function LocationsTab({ player }: { player: any }) {
  const [settling, setSettling] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const settle = async (locationId: string) => {
    setSettling(locationId); setMsg(null);
    try {
      await adminApi.forceSettleLocation(player.id, locationId);
      setMsg({ text: 'Location settled (production recalculated)', type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setSettling(null); }
  };

  const locations = player.locationInstances || [];

  return (
    <div>
      {locations.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No locations</div>}
      {locations.map((loc: any) => {
        const storage = (loc.storage as any) || {};
        const stored = storage.stored || {};
        const capacity = storage.capacity || {};
        return (
          <div key={loc.id} style={{ background: '#0f1a30', padding: '0.75rem', borderRadius: 8, border: '1px solid #2a2a4e', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#e0e0ff' }}>{loc.definitionId}</span>
              <span style={{ color: '#b8b8ff', fontSize: '0.8rem' }}>Lv.{loc.level}</span>
              <span style={{ color: '#666', fontSize: '0.75rem' }}>{loc.regionId}</span>
              <button
                onClick={() => settle(loc.id)}
                disabled={settling === loc.id}
                style={{
                  marginLeft: 'auto', padding: '0.3rem 0.75rem', border: '1px solid #6c63ff', borderRadius: 6,
                  background: 'rgba(108,99,255,0.2)', color: '#b8b0ff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                }}
              >
                {settling === loc.id ? '...' : '⚡ Force Settle'}
              </button>
            </div>
            {Object.keys(stored).length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(stored).map(([resource, amount]) => (
                  <div key={resource} style={{ fontSize: '0.8rem', color: '#b0b0d0', background: '#0a1020', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                    {resource}: {String(amount)} / {String((capacity as any)[resource] ?? '?')}
                  </div>
                ))}
              </div>
            )}
            {Object.keys(stored).length === 0 && <div style={{ fontSize: '0.8rem', color: '#555' }}>No stored resources</div>}
          </div>
        );
      })}
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function EffectsTab({ player }: { player: any }) {
  const [effects, setEffects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await adminApi.getPlayerEffects(player.id);
      setEffects(e);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setLoading(false); }
  }, [player.id]);

  useEffect(() => { load(); }, [load]);

  const removeEffect = async (effectId: string) => {
    setRemoving(effectId); setMsg(null);
    try {
      await adminApi.deletePlayerEffect(player.id, effectId);
      setMsg({ text: 'Effect removed', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setRemoving(null); }
  };

  if (loading) return <div style={{ color: '#888' }}>Loading effects...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ color: '#b8b8ff', fontSize: '0.9rem' }}>{effects.length} active effects</span>
        <button onClick={load} className="btn-edit" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Refresh</button>
      </div>
      {effects.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No active effects</div>}
      {effects.map((effect) => (
        <div key={effect.id} style={{
          background: '#0f1a30', padding: '0.6rem 0.75rem', borderRadius: 8,
          border: '1px solid #2a2a4e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e0e0ff' }}>{effect.effectDefId}</span>
              <span style={{ fontSize: '0.75rem', color: '#9d96ff', padding: '0.1rem 0.4rem', borderRadius: 4, background: 'rgba(108,99,255,0.15)' }}>{effect.category}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>
              {effect.valueMode}: {effect.value ?? JSON.stringify(effect.stats)}
              {effect.currentStacks > 1 && <span style={{ color: '#ffb74d', marginLeft: 6 }}>×{effect.currentStacks} stacks</span>}
              {effect.expiresAt && <span style={{ marginLeft: 8 }}>expires {new Date(effect.expiresAt).toLocaleString()}</span>}
            </div>
          </div>
          <button
            onClick={() => removeEffect(effect.id)}
            disabled={removing === effect.id}
            className="btn-delete"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
          >
            {removing === effect.id ? '...' : 'Remove'}
          </button>
        </div>
      ))}
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function TelemetryTab({ player }: { player: any }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await adminApi.getPlayerTelemetry(player.id, limit);
      setEvents(e);
    } catch {}
    finally { setLoading(false); }
  }, [player.id, limit]);

  useEffect(() => { load(); }, [load]);

  const EVENT_COLORS: Record<string, string> = {
    mission_complete: '#81c784', mission_failed: '#e57373', gift_claimed: '#ffb74d',
    shop_purchase: '#4fc3f7', lootbox_open: '#ce93d8', checkin: '#80deea',
  };

  if (loading) return <div style={{ color: '#888' }}>Loading telemetry...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ color: '#b8b8ff', fontSize: '0.9rem' }}>{events.length} events</span>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ padding: '0.3rem', border: '1px solid #333', borderRadius: 4, background: '#0f0f2e', color: '#e0e0ff', fontSize: '0.8rem' }}>
          <option value={20}>Last 20</option>
          <option value={30}>Last 30</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
        </select>
        <button onClick={load} className="btn-edit" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Refresh</button>
      </div>
      {events.length === 0 && <div style={{ color: '#666', fontStyle: 'italic' }}>No telemetry events</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((ev) => (
          <div key={ev.id} style={{
            background: '#0f1a30', padding: '0.5rem 0.75rem', borderRadius: 6,
            border: '1px solid #1e2a40', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: 4, whiteSpace: 'nowrap',
              background: 'rgba(108,99,255,0.15)',
              color: EVENT_COLORS[ev.eventType] || '#9d96ff',
            }}>{ev.eventType}</span>
            {ev.targetId && <span style={{ fontSize: '0.8rem', color: '#b0b0d0' }}>{ev.targetId}</span>}
            {ev.value != null && ev.value !== 1 && <span style={{ fontSize: '0.8rem', color: '#ffb74d' }}>×{ev.value}</span>}
            <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 'auto' }}>{new Date(ev.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const GOD_TABS: { key: GodTab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'items', label: '📦 Items' },
  { key: 'jobs', label: '⚡ Jobs' },
  { key: 'entities', label: '🧬 Entities' },
  { key: 'locations', label: '🏰 Locations' },
  { key: 'effects', label: '✨ Effects' },
  { key: 'telemetry', label: '📋 Telemetry' },
];

interface GodModePanelProps {
  player: any;
  onBack: () => void;
  onReload: () => void;
}

export function GodModePanel({ player, onBack, onReload }: GodModePanelProps) {
  const [tab, setTab] = useState<GodTab>('profile');

  return (
    <div style={{ background: '#16213e', padding: '1.25rem', borderRadius: 8, border: '1px solid #2a2a4e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#e0e0ff' }}>{player.username}</h3>
          <div style={{ color: '#888', fontSize: '0.8rem' }}>{player.email} | ID: {player.id}</div>
        </div>
        <button onClick={onBack} className="btn-cancel" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>← Back</button>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {GOD_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.4rem 0.8rem', border: '1px solid #2a2a4e', borderRadius: 6,
              background: tab === t.key ? 'rgba(108,99,255,0.25)' : '#0f1a30',
              color: tab === t.key ? '#b8b0ff' : '#888',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? '2px solid #6c63ff' : '1px solid #2a2a4e',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div>
        {tab === 'profile' && <ProfileTab player={player} onReload={onReload} />}
        {tab === 'items' && <ItemsTab player={player} />}
        {tab === 'jobs' && <JobsTab player={player} />}
        {tab === 'entities' && <EntitiesTab player={player} onReload={onReload} />}
        {tab === 'locations' && <LocationsTab player={player} />}
        {tab === 'effects' && <EffectsTab player={player} />}
        {tab === 'telemetry' && <TelemetryTab player={player} />}
      </div>
    </div>
  );
}
