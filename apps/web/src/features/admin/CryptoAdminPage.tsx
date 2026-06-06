import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from './adminApi';

type OracleStatus = {
  lovelacePerUsd: number;
  usdPerAda: number;
  sampleCount: number;
  twaWindowSeconds: number;
  oldestSampleAt: string | null;
  newestSampleAt: string | null;
  usingFallback: boolean;
};

type OracleHealth = 'green' | 'yellow' | 'red';

function getOracleHealth(status: OracleStatus): OracleHealth {
  if (status.usingFallback || !status.newestSampleAt) return 'red';
  const ageMs = Date.now() - new Date(status.newestSampleAt).getTime();
  const ageMin = ageMs / 60_000;
  if (ageMin < 10) return 'green';
  if (ageMin < 30) return 'yellow';
  return 'red';
}

const HEALTH_STYLES: Record<OracleHealth, { dot: string; border: string; label: string; labelColor: string }> = {
  green:  { dot: '#4caf50', border: 'rgba(76,175,80,0.35)',   label: 'Healthy',  labelColor: '#4caf50' },
  yellow: { dot: '#fbbf24', border: 'rgba(251,191,36,0.35)', label: 'Lagging',  labelColor: '#fbbf24' },
  red:    { dot: '#ff6b6b', border: 'rgba(255,107,107,0.35)', label: 'Stale',    labelColor: '#ff6b6b' },
};

function formatAge(isoString: string | null): string {
  if (!isoString) return '—';
  const ageMs = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ageMs / 1_000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function AdaOracleWidget() {
  const [status, setStatus] = useState<OracleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getAdaOracleStatus();
      setStatus(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch oracle status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  void now;

  const health: OracleHealth = status ? getOracleHealth(status) : 'red';
  const hs = HEALTH_STYLES[health];

  return (
    <div style={{
      background: '#16213e',
      border: `1px solid ${status ? hs.border : 'rgba(255,107,107,0.3)'}`,
      borderRadius: 8,
      padding: '1rem 1.25rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#b8b8ff', fontWeight: 600 }}>ADA Oracle</h3>
          {status && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '2px 8px', borderRadius: 20,
              background: `${hs.dot}22`, border: `1px solid ${hs.border}`,
              fontSize: '0.72rem', fontWeight: 700, color: hs.labelColor, letterSpacing: '0.04em',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: hs.dot, display: 'inline-block',
                boxShadow: health === 'green' ? `0 0 5px ${hs.dot}` : undefined,
              }} />
              {hs.label}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '0.2rem 0.55rem', fontSize: '0.75rem', border: '1px solid #333',
            borderRadius: 5, background: 'transparent', color: '#888', cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>{error}</div>
      )}

      {!error && status && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <div>
            <div style={{ color: '#666', fontSize: '0.72rem', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate (USD/ADA)</div>
            <div style={{ color: '#e0e0ff', fontWeight: 700, fontSize: '1.05rem' }}>
              ${status.usdPerAda.toFixed(4)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.72rem', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Sample</div>
            <div style={{ color: health === 'red' ? '#ff6b6b' : health === 'yellow' ? '#fbbf24' : '#e0e0ff', fontWeight: 600 }}>
              {formatAge(status.newestSampleAt)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.72rem', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Samples in Window</div>
            <div style={{ color: '#e0e0ff', fontWeight: 600 }}>
              {status.sampleCount}
              <span style={{ color: '#555', fontSize: '0.78rem', marginLeft: 4 }}>/ {Math.round(status.twaWindowSeconds / 60)}m TWA</span>
            </div>
          </div>
          {status.usingFallback && (
            <div style={{
              alignSelf: 'center', padding: '0.2rem 0.65rem', borderRadius: 5, fontSize: '0.78rem',
              background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b',
            }}>
              Using fallback rate
            </div>
          )}
        </div>
      )}

      {!error && loading && !status && (
        <div style={{ color: '#555', fontSize: '0.85rem' }}>Loading oracle status…</div>
      )}
    </div>
  );
}

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

const ADA_WARNING_THRESHOLD = 5;

function KeyDownloadModal({
  skeyHex,
  address,
  onDone,
}: {
  skeyHex: string;
  address: string;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const handleSaveFile = () => {
    const prefix = address ? address.slice(0, 16) : 'wallet';
    const filename = `hot-wallet-skey-${prefix}.txt`;
    const blob = new Blob([skeyHex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0f1629', border: '1px solid rgba(251,191,36,0.4)',
        borderRadius: 12, padding: '1.5rem', maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🔑</span>
          <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1rem', fontWeight: 700 }}>
            Private Key — One-Time Download
          </h3>
        </div>
        <p style={{ fontSize: '0.82rem', color: '#a0a0c0', marginBottom: '1rem', lineHeight: 1.5 }}>
          This key will <strong style={{ color: '#ff6b6b' }}>never be shown again</strong>.
          Save it in a secure location (password manager, encrypted storage) before closing this dialog.
        </p>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: 4 }}>
            WALLET ADDRESS (auto-populated in config)
          </label>
          <div style={{
            fontFamily: 'monospace', fontSize: '0.78rem', color: '#60a5fa',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '0.5rem 0.65rem', wordBreak: 'break-all',
          }}>
            {address}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: 4 }}>
            PRIVATE SIGNING KEY (Ed25519 extended, hex)
          </label>
          <textarea
            readOnly
            value={skeyHex}
            rows={4}
            style={{
              width: '100%', fontFamily: 'monospace', fontSize: '0.75rem',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, color: '#e0e0ff', padding: '0.5rem 0.65rem',
              resize: 'vertical', boxSizing: 'border-box', wordBreak: 'break-all',
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>

        <button
          onClick={handleSaveFile}
          style={{
            width: '100%', padding: '0.6rem', borderRadius: 6, border: 'none',
            background: 'rgba(99,102,241,0.7)', color: '#fff', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem',
          }}
        >
          ↓ Save as File
        </button>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <span style={{ fontSize: '0.82rem', color: '#a0a0c0', lineHeight: 1.4 }}>
            I have saved the private key in a secure location and understand it cannot be retrieved again.
          </span>
        </label>

        <button
          onClick={onDone}
          disabled={!confirmed}
          style={{
            width: '100%', padding: '0.6rem', borderRadius: 6, border: 'none',
            background: confirmed ? 'rgba(76,175,80,0.7)' : 'rgba(76,175,80,0.2)',
            color: confirmed ? '#fff' : '#666', cursor: confirmed ? 'pointer' : 'default',
            fontWeight: 600, fontSize: '0.9rem',
          }}
        >
          Done — I've Saved the Key
        </button>
      </div>
    </div>
  );
}

function CycleWalletDialog({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [cycling, setCycling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText === 'CYCLE';

  const handleCycle = async () => {
    setCycling(true); setError(null);
    try {
      await adminApi.generateHotWallet(true);
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to cycle wallet');
    } finally {
      setCycling(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0f1629', border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <h3 style={{ margin: 0, color: '#f87171', fontSize: '1rem', fontWeight: 700 }}>
            Cycle Hot Wallet
          </h3>
        </div>

        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#fca5a5', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Before cycling:</div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>Drain all ADA and CNT from the current hot wallet address.</li>
            <li>All APPROVED or PROCESSING withdrawals must be resolved first.</li>
            <li>The old wallet key will be permanently replaced — save a copy if needed.</li>
            <li>A new one-time key download will be required after cycling.</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.82rem', color: '#a0a0c0', display: 'block', marginBottom: 6 }}>
            Type <strong style={{ color: '#f87171' }}>CYCLE</strong> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CYCLE"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${canConfirm ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 6, color: '#e0e0ff', padding: '0.5rem 0.65rem',
              fontSize: '0.9rem', fontFamily: 'monospace', boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.82rem',
            background: 'rgba(255,107,107,0.15)', color: '#ff6b6b',
            border: '1px solid rgba(255,107,107,0.3)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleCycle}
            disabled={!canConfirm || cycling}
            style={{
              flex: 1, padding: '0.55rem', borderRadius: 6, border: 'none',
              background: canConfirm && !cycling ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.2)',
              color: canConfirm && !cycling ? '#fff' : '#666',
              cursor: canConfirm && !cycling ? 'pointer' : 'default',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            {cycling ? 'Cycling…' : 'Cycle Wallet'}
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '0.55rem', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
              color: '#aaa', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigTab() {
  const [config, setConfig] = useState<any>(null);
  const [balance, setBalance] = useState<{ ada: string; cnt: string; totalApprovedCnt: string } | null>(null);
  const [form, setForm] = useState<any>({});
  const [skeyInput, setSkeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [claimingKey, setClaimingKey] = useState(false);
  const [pendingKeyData, setPendingKeyData] = useState<{ skeyHex: string; address: string } | null>(null);
  const [showCycleDialog, setShowCycleDialog] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await adminApi.getCryptoConfig();
      setConfig(c);
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
    adminApi.getCryptoBalance().then(setBalance).catch(() => setBalance(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClaimKey = async () => {
    setClaimingKey(true); setMsg(null);
    try {
      const { skeyHex } = await adminApi.claimPendingKeyDownload();
      const currentAddress = config?.hotWalletAddress ?? '';
      setPendingKeyData({ skeyHex, address: currentAddress });
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setClaimingKey(false);
    }
  };

  const handleKeyDownloadDone = () => {
    setPendingKeyData(null);
    load();
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload: Parameters<typeof adminApi.updateCryptoConfig>[0] = {
        hotWalletAddress: form.hotWalletAddress,
        blockfrostProjectId: form.blockfrostProjectId,
        cntPolicyId: form.cntPolicyId,
        cntAssetName: form.cntAssetName,
        cntPriceAda: Number(form.cntPriceAda),
        minWithdrawalType: form.minWithdrawalType,
        minWithdrawalAmount: Number(form.minWithdrawalAmount),
        withdrawalFee: Number(form.withdrawalFee),
        autoApprovalThreshold: Number(form.autoApprovalThreshold),
      };
      if (skeyInput.trim()) {
        payload.hotWalletSkeyHex = skeyInput.trim();
      }
      await adminApi.updateCryptoConfig(payload);
      setSkeyInput('');
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
      {pendingKeyData && (
        <KeyDownloadModal
          skeyHex={pendingKeyData.skeyHex}
          address={pendingKeyData.address}
          onDone={handleKeyDownloadDone}
        />
      )}

      {showCycleDialog && (
        <CycleWalletDialog
          onCancel={() => setShowCycleDialog(false)}
          onSuccess={() => { setShowCycleDialog(false); load(); }}
        />
      )}

      <h3 style={{ marginBottom: '1.25rem', color: '#b8b8ff', fontSize: '1rem' }}>Wallet Configuration</h3>

      {config?.hotWalletKeyPendingDownload && (
        <div style={{
          marginBottom: '1.25rem', padding: '0.85rem 1rem', borderRadius: 8,
          background: 'rgba(251,191,36,0.1)', border: '2px solid rgba(251,191,36,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '1rem' }}>🔑</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fbbf24' }}>
              Private Key Ready to Download
            </span>
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#fde68a', lineHeight: 1.5 }}>
            A new hot wallet was generated. The private key is available for one-time download only — after
            you confirm you have saved it, it will no longer be accessible through this panel.
          </p>
          <button
            onClick={handleClaimKey}
            disabled={claimingKey}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: 6, border: 'none',
              background: claimingKey ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.8)',
              color: '#000', cursor: claimingKey ? 'default' : 'pointer',
              fontWeight: 700, fontSize: '0.88rem',
            }}
          >
            {claimingKey ? 'Loading…' : '⬇ Download Private Key (one time only)'}
          </button>
        </div>
      )}

      {balance && (() => {
        const adaBalance = parseFloat(balance.ada);
        const cntBalance = Number(balance.cnt);
        const totalApprovedCnt = Number(balance.totalApprovedCnt);
        const cntShort = totalApprovedCnt > 0 && cntBalance < totalApprovedCnt;
        const adaLow = adaBalance < ADA_WARNING_THRESHOLD;
        const hasWarning = cntShort || adaLow;

        return (
          <>
            {hasWarning && (
              <div style={{
                marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8,
                background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.35rem' }}>
                  ⚠ Hot Wallet Low Balance
                </div>
                {cntShort && (
                  <div style={{ fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                    CNT balance ({cntBalance.toLocaleString()}) is below total queued withdrawals ({totalApprovedCnt.toLocaleString()}). Withdrawals are paused until funds are topped up.
                  </div>
                )}
                {adaLow && (
                  <div style={{ fontSize: '0.82rem' }}>
                    ADA balance ({adaBalance.toFixed(6)} ₳) is below the {ADA_WARNING_THRESHOLD} ₳ safety threshold. Top up the hot wallet to cover transaction fees.
                  </div>
                )}
              </div>
            )}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
              marginBottom: '1.5rem', padding: '1rem',
              background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              border: `1px solid ${hasWarning ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>HOT WALLET ADA</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: adaLow ? '#fbbf24' : '#60a5fa' }}>
                  {balance.ada} ₳
                </div>
                {adaLow && (
                  <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: 2 }}>
                    Below {ADA_WARNING_THRESHOLD} ₳ threshold
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>HOT WALLET DERP CNT</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: cntShort ? '#fbbf24' : '#a78bfa' }}>
                  {cntBalance.toLocaleString()}
                </div>
                {totalApprovedCnt > 0 && (
                  <div style={{ fontSize: '0.72rem', color: cntShort ? '#fbbf24' : '#666', marginTop: 2 }}>
                    {totalApprovedCnt.toLocaleString()} queued
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

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

      <div style={{ marginBottom: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem', marginTop: '0.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', color: '#a0a0c0', marginBottom: 4 }}>
          Hot Wallet Signing Key (write-only)
        </label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          marginBottom: 6,
        }}>
          <span style={{
            fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 4,
            background: config?.hasStoredSigningKey
              ? 'rgba(76,175,80,0.15)'
              : 'rgba(251,191,36,0.12)',
            color: config?.hasStoredSigningKey ? '#4caf50' : '#fbbf24',
            border: `1px solid ${config?.hasStoredSigningKey ? 'rgba(76,175,80,0.3)' : 'rgba(251,191,36,0.3)'}`,
          }}>
            {config?.hasStoredSigningKey ? '● Key stored' : '○ No key stored'}
          </span>
          {!config?.hasStoredSigningKey && (
            <span style={{ fontSize: '0.75rem', color: '#666' }}>
              Falls back to HOT_WALLET_SKEY_HEX env var
            </span>
          )}
        </div>
        <input
          type="password"
          value={skeyInput}
          onChange={(e) => setSkeyInput(e.target.value)}
          placeholder={config?.hasStoredSigningKey ? 'Enter new key to replace stored key' : 'Enter hex CBOR spending key'}
          autoComplete="new-password"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#e0e0ff', padding: '0.45rem 0.65rem', fontSize: '0.9rem',
            boxSizing: 'border-box', fontFamily: 'monospace',
          }}
        />
        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 3 }}>
          Extended spending key as hex CBOR (enterprise or base address key). Stored encrypted at rest with AES-256-GCM. Leave blank to keep the existing stored key unchanged.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: 4 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '0.55rem 1.25rem', borderRadius: 6, border: 'none',
            background: saving ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.7)',
            color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>

        <button
          onClick={() => setShowCycleDialog(true)}
          style={{
            padding: '0.55rem 1.1rem', borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)',
            color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
          }}
        >
          ↺ Cycle Wallet
        </button>
      </div>
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
      <AdaOracleWidget />
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
