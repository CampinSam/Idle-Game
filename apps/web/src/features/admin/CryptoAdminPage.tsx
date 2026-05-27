import { useState, useEffect, useCallback } from 'react';
import { adminApi } from './adminApi';

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  PENDING: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  PROCESSING: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  REJECTED: { bg: 'rgba(255,107,107,0.12)', color: '#ff6b6b', border: 'rgba(255,107,107,0.3)' },
  SENT: { bg: 'rgba(76,175,80,0.12)', color: '#4caf50', border: 'rgba(76,175,80,0.3)' },
  FAILED: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.3)' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] ?? { bg: 'rgba(128,128,128,0.1)', color: '#aaa', border: 'rgba(128,128,128,0.3)' };
  return (
    <span style={{
      padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
      background: style.bg, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {status}
    </span>
  );
}

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

function ConfigTab() {
  const [config, setConfig] = useState<any>(null);
  const [balance, setBalance] = useState<{ ada: string; cnt: string } | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        adminApi.getCryptoConfig(),
        adminApi.getCryptoBalance(),
      ]);
      setConfig(c);
      setBalance(b);
      setForm({
        hotWalletAddress: c.hotWalletAddress ?? '',
        blockfrostProjectId: c.blockfrostProjectId ?? '',
        cntPolicyId: c.cntPolicyId ?? '',
        cntAssetName: c.cntAssetName ?? '',
        cntPriceAda: c.cntPriceAda ?? 0,
        minWithdrawalType: c.minWithdrawalType ?? 'QUANTITY',
        minWithdrawalAmount: c.minWithdrawalAmount ?? 1,
        withdrawalFee: c.withdrawalFee ?? '0',
        autoApprovalThreshold: c.autoApprovalThreshold ?? '0',
      });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await adminApi.updateCryptoConfig({
        hotWalletAddress: form.hotWalletAddress,
        blockfrostProjectId: form.blockfrostProjectId,
        cntPolicyId: form.cntPolicyId,
        cntAssetName: form.cntAssetName,
        cntPriceAda: Number(form.cntPriceAda),
        minWithdrawalType: form.minWithdrawalType,
        minWithdrawalAmount: Number(form.minWithdrawalAmount),
        withdrawalFee: Number(form.withdrawalFee),
        autoApprovalThreshold: Number(form.autoApprovalThreshold),
      });
      setMsg({ text: 'Config saved', type: 'success' });
      load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: string, type = 'text', hint?: string) => (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.82rem', color: '#a0a0c0', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6, color: '#e0e0ff', padding: '0.45rem 0.65rem', fontSize: '0.9rem', boxSizing: 'border-box',
          fontFamily: key.includes('Address') || key.includes('Policy') || key.includes('Name') ? 'monospace' : 'inherit',
        }}
      />
      {hint && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 3 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 640 }}>
      <h3 style={{ marginBottom: '1.25rem', color: '#b8b8ff', fontSize: '1rem' }}>Wallet Configuration</h3>

      {balance && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
          marginBottom: '1.5rem', padding: '1rem',
          background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>HOT WALLET ADA</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{balance.ada} ₳</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>HOT WALLET DERP CNT</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a78bfa' }}>{Number(balance.cnt).toLocaleString()}</div>
          </div>
        </div>
      )}

      {field('Hot Wallet Address', 'hotWalletAddress', 'text', 'Cardano address that receives CNT deposits')}
      {field('Blockfrost Project ID', 'blockfrostProjectId', 'text', 'Blockfrost API key for deposit polling & balance. Falls back to BLOCKFROST_API_KEY env var if empty.')}
      {field('CNT Policy ID', 'cntPolicyId', 'text', '28-byte hex (56 chars)')}
      {field('CNT Asset Name (hex)', 'cntAssetName', 'text', 'Hex-encoded asset name portion')}
      {field('CNT Price in ADA', 'cntPriceAda', 'number', 'Used for ADA_VALUE / USD_VALUE minimum checks (e.g. 0.001 = 1 CNT is 0.001 ADA). Set 0 to disable value-based minimums.')}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', color: '#a0a0c0', marginBottom: 4 }}>Min Withdrawal Type</label>
        <select
          value={form.minWithdrawalType ?? 'QUANTITY'}
          onChange={(e) => setForm((f: any) => ({ ...f, minWithdrawalType: e.target.value }))}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#e0e0ff', padding: '0.45rem 0.65rem', fontSize: '0.9rem',
          }}
        >
          <option value="QUANTITY">Quantity (CNT units)</option>
          <option value="ADA_VALUE">ADA Value</option>
          <option value="USD_VALUE">USD Value</option>
        </select>
      </div>

      {field('Min Withdrawal Amount', 'minWithdrawalAmount', 'number')}
      {field('Withdrawal Fee (CNT units)', 'withdrawalFee', 'number', 'Flat fee deducted before sending on-chain')}
      {field('Auto-Approval Threshold (CNT units)', 'autoApprovalThreshold', 'number', 'Withdrawals ≤ this amount are auto-approved. Set 0 to disable.')}

      <button
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 4, padding: '0.55rem 1.25rem', borderRadius: 6, border: 'none',
          background: saving ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.7)',
          color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: 600,
        }}
      >
        {saving ? 'Saving…' : 'Save Config'}
      </button>
      {msg && <StatusMsg msg={msg.text} type={msg.type} />}
    </div>
  );
}

function WithdrawalsTab() {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; txHash: string; adminNote: string }>({ status: '', txHash: '', adminNote: '' });
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await adminApi.getCryptoWithdrawals(statusFilter || undefined);
      setWithdrawals(rows);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (w: any) => {
    setEditId(w.id);
    setEditForm({ status: w.status, txHash: w.txHash ?? '', adminNote: w.adminNote ?? '' });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setMsg(null);
    try {
      await adminApi.updateCryptoWithdrawal(editId, {
        status: editForm.status,
        txHash: editForm.txHash || undefined,
        adminNote: editForm.adminNote || undefined,
      });
      setEditId(null);
      setMsg({ text: 'Withdrawal updated', type: 'success' });
      load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#e0e0ff', padding: '0.4rem 0.6rem', fontSize: '0.85rem',
          }}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PROCESSING">Processing</option>
          <option value="REJECTED">Rejected</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
        <button onClick={load} style={{ padding: '0.4rem 0.9rem', borderRadius: 6, border: '1px solid rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.15)', color: '#a78bfa', cursor: 'pointer' }}>
          Refresh
        </button>
        <span style={{ fontSize: '0.82rem', color: '#666' }}>{withdrawals.length} withdrawals</span>
      </div>

      {editId && (
        <div style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '1rem', marginBottom: '1rem',
        }}>
          <h4 style={{ margin: '0 0 0.75rem', color: '#b8b8ff' }}>Edit Withdrawal</h4>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a0a0c0', display: 'block', marginBottom: 3 }}>Status</label>
              {editForm.status === 'SENT' ? (
                <div style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)', color: '#4caf50', fontSize: '0.85rem' }}>
                  SENT — on-chain transfer completed; status is immutable.
                </div>
              ) : editForm.status === 'PROCESSING' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc', fontSize: '0.85rem' }}>
                    PROCESSING — scheduler is submitting on-chain.
                  </div>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e0e0ff', padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: '100%' }}
                  >
                    <option value="PROCESSING">PROCESSING (no change)</option>
                    <option value="FAILED">FAILED (force-fail — verify blockchain first)</option>
                  </select>
                </div>
              ) : (
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e0e0ff', padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: '100%' }}
                >
                  {editForm.status === 'PENDING' && (<>
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </>)}
                  {editForm.status === 'APPROVED' && (<>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </>)}
                  {editForm.status === 'FAILED' && (<>
                    <option value="FAILED">FAILED</option>
                    <option value="APPROVED">APPROVED (re-queue)</option>
                    <option value="REJECTED">REJECTED (refund)</option>
                  </>)}
                  {editForm.status === 'REJECTED' && (<>
                    <option value="REJECTED">REJECTED</option>
                    <option value="APPROVED">APPROVED (re-open)</option>
                  </>)}
                </select>
              )}
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a0a0c0', display: 'block', marginBottom: 3 }}>TX Hash (on-chain)</label>
              <input
                value={editForm.txHash}
                onChange={(e) => setEditForm((f) => ({ ...f, txHash: e.target.value }))}
                placeholder="cardano tx hash after sending"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e0e0ff', padding: '0.4rem 0.6rem', fontSize: '0.82rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a0a0c0', display: 'block', marginBottom: 3 }}>Admin Note</label>
              <input
                value={editForm.adminNote}
                onChange={(e) => setEditForm((f) => ({ ...f, adminNote: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e0e0ff', padding: '0.4rem 0.6rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button onClick={saveEdit} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', background: 'rgba(99,102,241,0.7)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            <button onClick={() => setEditId(null)} style={{ padding: '0.4rem 0.9rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <StatusMsg msg={msg.text} type={msg.type} />}

      {loading ? (
        <div style={{ color: '#666', padding: '1rem' }}>Loading…</div>
      ) : withdrawals.length === 0 ? (
        <div style={{ color: '#666', padding: '1.5rem', textAlign: 'center' }}>No withdrawals found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['User', 'Amount', 'Fee', 'Destination', 'Status', 'Auto?', 'TX Hash', 'Created', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: '#a0a0c0', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: '#d0d0f0' }}>
                    <div style={{ fontWeight: 600 }}>{w.user?.username ?? w.userId.slice(0, 8)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#666' }}>{w.userId}</div>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#e0e0ff' }}>{Number(w.amount).toLocaleString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem', color: '#888' }}>{Number(w.fee).toLocaleString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#a0a0c0' }} title={w.destinationAddress}>{w.destinationAddress}</span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem' }}><StatusBadge status={w.status} /></td>
                  <td style={{ padding: '0.45rem 0.6rem', color: w.autoApproved ? '#4caf50' : '#666' }}>{w.autoApproved ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '0.45rem 0.6rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.txHash ? <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#60a5fa' }} title={w.txHash}>{w.txHash.slice(0, 16)}…</span> : <span style={{ color: '#444' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: '#666', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem' }}>
                    <button
                      onClick={() => openEdit(w)}
                      style={{ padding: '0.25rem 0.6rem', borderRadius: 4, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type CryptoTab = 'config' | 'withdrawals';

export function CryptoAdminPage() {
  const [tab, setTab] = useState<CryptoTab>('config');

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 1rem', color: '#e0e0ff', fontSize: '1.15rem' }}>DERP Crypto Wallet</h2>
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
          {(['config', 'withdrawals'] as CryptoTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.4rem 1rem', borderRadius: '6px 6px 0 0',
                border: `1px solid ${tab === t ? 'rgba(99,102,241,0.5)' : 'transparent'}`,
                borderBottom: tab === t ? '1px solid #1a1a2e' : 'transparent',
                background: tab === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: tab === t ? '#a78bfa' : '#666', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {t === 'config' ? 'Config & Balance' : 'Withdrawals Queue'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'config' && <ConfigTab />}
      {tab === 'withdrawals' && <WithdrawalsTab />}
    </div>
  );
}
