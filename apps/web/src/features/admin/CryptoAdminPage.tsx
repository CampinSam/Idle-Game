import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { adminApi } from './adminApi';
import { useNow } from '../../hooks/useNow';

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

function getOracleHealth(status: OracleStatus, now = Date.now()): OracleHealth {
  if (status.usingFallback || !status.newestSampleAt) return 'red';
  const ageMs = now - new Date(status.newestSampleAt).getTime();
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

function formatAge(isoString: string | null, now = Date.now()): string {
  if (!isoString) return '—';
  const ageMs = now - new Date(isoString).getTime();
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const now = useNow(15_000);

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

  const health: OracleHealth = status ? getOracleHealth(status, now) : 'red';
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
              {formatAge(status.newestSampleAt, now)}
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
  const [balance, setBalance] = useState<{
    ada: { gross: string; liability: string; net: string };
    currencies: Array<{ currencyId: string; gross: string; liability: string; net: string; approvedWithdrawals: string }>;
  } | null>(null);
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
        adaWithdrawalFee: c.adaWithdrawalFee ?? '5000000',
        adaMinWithdrawalAmount: c.adaMinWithdrawalAmount ?? '2000000',
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
        adaWithdrawalFee: Number(form.adaWithdrawalFee),
        adaMinWithdrawalAmount: Number(form.adaMinWithdrawalAmount),
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
        const adaNetLovelace = BigInt(balance.ada.net ?? '0');
        const adaAda = Number(adaNetLovelace) / 1_000_000;
        const adaLow = adaAda < ADA_WARNING_THRESHOLD;

        const currencies = balance.currencies ?? [];
        const anyCntShort = currencies.some((c) => {
          const approved = Number(c.approvedWithdrawals);
          const net = Number(c.net);
          return approved > 0 && net < approved;
        });
        const hasWarning = anyCntShort || adaLow;

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
                {anyCntShort && currencies.filter((c) => Number(c.approvedWithdrawals) > 0 && Number(c.net) < Number(c.approvedWithdrawals)).map((c) => (
                  <div key={c.currencyId} style={{ fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                    {c.currencyId} net ({Number(c.net).toLocaleString()}) below queued withdrawals ({Number(c.approvedWithdrawals).toLocaleString()}).
                  </div>
                ))}
                {adaLow && (
                  <div style={{ fontSize: '0.82rem' }}>
                    ADA net ({adaAda.toFixed(4)} ₳) is below the {ADA_WARNING_THRESHOLD} ₳ safety threshold.
                  </div>
                )}
              </div>
            )}
            <div style={{
              display: 'grid', gridTemplateColumns: `repeat(${1 + currencies.length}, 1fr)`, gap: '0.75rem',
              marginBottom: '1.5rem', padding: '1rem',
              background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              border: `1px solid ${hasWarning ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>HOT WALLET ADA (net)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: adaLow ? '#fbbf24' : '#60a5fa' }}>
                  {adaAda.toFixed(4)} ₳
                </div>
                <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 2 }}>
                  {(Number(BigInt(balance.ada.liability ?? '0')) / 1_000_000).toFixed(4)} ₳ liability
                </div>
                {adaLow && (
                  <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: 2 }}>
                    Below {ADA_WARNING_THRESHOLD} ₳ threshold
                  </div>
                )}
              </div>
              {currencies.map((c) => {
                const approved = Number(c.approvedWithdrawals);
                const net = Number(c.net);
                const short = approved > 0 && net < approved;
                return (
                  <div key={c.currencyId}>
                    <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 3 }}>
                      {c.currencyId.toUpperCase()} (net)
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: short ? '#fbbf24' : '#a78bfa' }}>
                      {net.toLocaleString()}
                    </div>
                    {approved > 0 && (
                      <div style={{ fontSize: '0.72rem', color: short ? '#fbbf24' : '#666', marginTop: 2 }}>
                        {approved.toLocaleString()} queued
                      </div>
                    )}
                  </div>
                );
              })}
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

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.78rem', color: '#a78bfa', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADA Withdrawal Settings</div>
        {field('ADA Platform Fee (lovelace)', 'adaWithdrawalFee', 'number', 'Platform fee charged on ADA withdrawals. Debited in addition to the net send amount. Default: 5,000,000 (5 ADA).')}
        {field('ADA Min Withdrawal (lovelace)', 'adaMinWithdrawalAmount', 'number', 'Minimum net ADA the player receives per withdrawal. Default: 2,000,000 (2 ADA).')}
      </div>

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
                    {w.txHash ? <a href={`https://cardanoscan.io/transaction/${w.txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'underline' }} title={w.txHash}>{w.txHash.slice(0, 16)}…</a> : <span style={{ color: '#444' }}>—</span>}
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

type PlayerSearchResult = { id: string; username: string | null; email: string | null; keeperLevel?: number };

function PlayerPicker({
  selectedPlayer,
  onSelect,
}: {
  selectedPlayer: PlayerSearchResult | null;
  onSelect: (player: PlayerSearchResult | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const data = await adminApi.searchPlayers(q.trim());
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '0.35rem 0.6rem',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e0e0ff',
    fontSize: '0.8rem',
    boxSizing: 'border-box',
  };

  if (selectedPlayer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: 4, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, color: '#fff', flexShrink: 0 }}>
          {(selectedPlayer.username || '?')[0]?.toUpperCase()}
        </span>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.8rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedPlayer.username || '(no username)'}
        </span>
        {selectedPlayer.email && (
          <span style={{ color: '#64748b', fontSize: '0.72rem', flexShrink: 0 }}>{selectedPlayer.email}</span>
        )}
        <button
          onClick={() => { onSelect(null); setQuery(''); }}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.85rem', lineHeight: 1, flexShrink: 0 }}
          title="Clear selection"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <input
          style={inputStyle}
          value={query}
          placeholder="Search by username or email…"
          onChange={(e) => { setQuery(e.target.value); setOpen(false); }}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
        />
        <button
          onClick={() => doSearch(query)}
          disabled={searching}
          style={{ padding: '0.35rem 0.6rem', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#a0a0c0', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 2, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: '#131320', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', maxHeight: 200, overflowY: 'auto' }}>
          {results.map((p) => (
            <div
              key={p.id}
              onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
              style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e1e2e'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.8rem' }}>{p.username || '(no username)'}</span>
              {p.email && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.email}</span>}
              {p.keeperLevel !== undefined && <span style={{ color: '#a78bfa', fontSize: '0.72rem', marginLeft: 'auto' }}>Lv.{p.keeperLevel}</span>}
            </div>
          ))}
        </div>
      )}
      {open && results.length === 0 && !searching && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 2, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: '#131320', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#666' }}>
          No players found
        </div>
      )}
    </div>
  );
}

function UnresolvedDepositsTab() {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, PlayerSearchResult | null>>({});
  const [expandedLedger, setExpandedLedger] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await adminApi.getUnresolvedDeposits(includeResolved, 100);
      setDeposits(rows);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [includeResolved]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (id: string) => {
    setResolving(id); setMsg(null);
    try {
      const player = selectedPlayers[id] ?? null;
      await adminApi.resolveUnresolvedDeposit(id, player?.id || undefined);
      setMsg({ text: player ? `Deposit resolved — credited to ${player.username || player.id}` : 'Deposit dismissed without credit', type: 'success' });
      setSelectedPlayers((prev) => { const next = { ...prev }; delete next[id]; return next; });
      load();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: '#e0e0ff', fontSize: '1rem' }}>Unresolved On-Chain Deposits</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#a0a0c0', cursor: 'pointer' }}>
          <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
          Show resolved
        </label>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '0.3rem 0.8rem', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#a0a0c0', cursor: 'pointer', fontSize: '0.82rem' }}>
          Refresh
        </button>
      </div>

      {msg && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 6, background: msg.type === 'error' ? 'rgba(255,107,107,0.12)' : 'rgba(76,175,80,0.12)', border: `1px solid ${msg.type === 'error' ? 'rgba(255,107,107,0.3)' : 'rgba(76,175,80,0.3)'}`, color: msg.type === 'error' ? '#ff6b6b' : '#4caf50', fontSize: '0.85rem' }}>
          {msg.text}
        </div>
      )}

      <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.75rem' }}>
        Deposits that arrived at the hot wallet but could not be matched to a player (no linked Cardano wallet). Resolve by crediting a player's account or dismiss without credit.
      </div>

      {loading ? (
        <div style={{ color: '#666', padding: '1rem' }}>Loading…</div>
      ) : deposits.length === 0 ? (
        <div style={{ color: '#666', padding: '1rem', textAlign: 'center' }}>No unresolved deposits</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {deposits.map((d) => (
            <div key={d.id} style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: 8, background: d.resolvedAt ? 'rgba(255,255,255,0.02)' : 'rgba(251,191,36,0.06)', border: `1px solid ${d.resolvedAt ? 'rgba(255,255,255,0.08)' : 'rgba(251,191,36,0.25)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#60a5fa', marginBottom: 4 }}>
                    TX: {d.txHash?.slice(0, 16)}…{d.txHash?.slice(-8)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 4 }}>
                    {d.blockTime ? new Date(d.blockTime * 1000).toLocaleString() : '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#a0a0c0', marginBottom: 4 }}>
                    <strong>Amounts:</strong> {Object.entries(d.amounts ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#666' }}>
                    Senders: {(d.senderAddresses ?? []).slice(0, 2).map((a: string) => a.slice(0, 18) + '…').join(', ')}
                    {(d.senderAddresses ?? []).length > 2 ? ` +${d.senderAddresses.length - 2} more` : ''}
                  </div>
                  {d.reason && <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: 4 }}>{d.reason}</div>}
                </div>

                {d.resolvedAt ? (
                  <div style={{ fontSize: '0.78rem', color: '#4caf50' }}>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      ✓ Resolved {new Date(d.resolvedAt).toLocaleDateString()}
                    </div>
                    {d.resolvedBy && (
                      <div style={{ color: '#94a3b8', marginTop: 2, fontSize: '0.72rem' }}>
                        by <span style={{ color: '#cbd5e1' }}>{d.resolvedBy.username ?? d.resolvedByUserId?.slice(0, 8) + '…'}</span>
                      </div>
                    )}
                    {d.creditedUserId && (
                      <div style={{ color: '#a78bfa', marginTop: 2 }}>
                        → {d.creditedUser?.username ? (
                          <span title={d.creditedUserId}>{d.creditedUser.username}</span>
                        ) : (
                          <span style={{ color: '#888' }}>{d.creditedUserId.slice(0, 8)}…</span>
                        )}
                        {d.creditedUser?.email && (
                          <span style={{ color: '#64748b', marginLeft: 4, fontSize: '0.72rem' }}>{d.creditedUser.email}</span>
                        )}
                      </div>
                    )}
                    {d.ledgerEntries && d.ledgerEntries.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          onClick={() => setExpandedLedger((prev) => ({ ...prev, [d.id]: !prev[d.id] }))}
                          style={{
                            background: 'none', border: '1px solid rgba(99,102,241,0.35)',
                            borderRadius: 4, color: '#818cf8', cursor: 'pointer',
                            fontSize: '0.7rem', padding: '0.15rem 0.45rem', fontWeight: 600,
                          }}
                        >
                          {expandedLedger[d.id] ? '▲ Hide ledger' : `▼ Ledger (${d.ledgerEntries.length})`}
                        </button>
                        {expandedLedger[d.id] && (
                          <div style={{ marginTop: 6, padding: '0.5rem 0.65rem', borderRadius: 6, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            {d.ledgerEntries.map((entry: any, idx: number) => (
                              <div key={entry.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: idx < d.ledgerEntries.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, color: '#34d399', fontSize: '0.8rem' }}>
                                    +{entry.delta}
                                  </span>
                                  <span style={{ color: '#a78bfa', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {entry.currencyId}
                                  </span>
                                  <span style={{ color: '#64748b', fontSize: '0.68rem' }}>
                                    {new Date(entry.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 2, fontStyle: 'italic' }}>
                                  {entry.reason}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {d.creditedUserId && (!d.ledgerEntries || d.ledgerEntries.length === 0) && (
                      <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                        No ledger entries found
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 220 }}>
                    <PlayerPicker
                      selectedPlayer={selectedPlayers[d.id] ?? null}
                      onSelect={(p) => setSelectedPlayers((prev) => ({ ...prev, [d.id]: p }))}
                    />
                    <button
                      onClick={() => handleResolve(d.id)}
                      disabled={resolving === d.id}
                      style={{ padding: '0.35rem 0.8rem', borderRadius: 4, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      {resolving === d.id ? 'Resolving…' : selectedPlayers[d.id] ? 'Resolve & Credit' : 'Dismiss (no credit)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerDepositLedgerTab() {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adminApi.getPlayerDepositLedger(userId, 100);
      setEntries(rows);
    } catch (e: any) {
      setError(e.message || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      load(selectedPlayer.id);
    } else {
      setEntries([]);
      setError(null);
    }
  }, [selectedPlayer, load]);

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', color: '#e0e0ff', fontSize: '1rem' }}>Player Deposit Ledger</h3>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.75rem' }}>
          Search for a player to view their CRYPTO_DEPOSIT ledger entries — credits granted from on-chain deposits.
        </div>
        <div style={{ maxWidth: 400 }}>
          <PlayerPicker selectedPlayer={selectedPlayer} onSelect={(p) => { setSelectedPlayer(p); }} />
        </div>
      </div>

      {selectedPlayer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.82rem', color: '#a0a0c0' }}>
            Showing deposit credits for <strong style={{ color: '#e2e8f0' }}>{selectedPlayer.username || selectedPlayer.id}</strong>
          </span>
          <button
            onClick={() => load(selectedPlayer.id)}
            disabled={loading}
            style={{ padding: '0.25rem 0.65rem', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#a0a0c0', cursor: loading ? 'default' : 'pointer', fontSize: '0.78rem' }}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.85rem', background: 'rgba(255,107,107,0.12)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)' }}>
          {error}
        </div>
      )}

      {!selectedPlayer && (
        <div style={{ color: '#555', padding: '2rem', textAlign: 'center', fontSize: '0.85rem' }}>
          Select a player above to view their deposit ledger
        </div>
      )}

      {selectedPlayer && !loading && entries.length === 0 && !error && (
        <div style={{ color: '#666', padding: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }}>
          No CRYPTO_DEPOSIT ledger entries found for this player
        </div>
      )}

      {selectedPlayer && loading && (
        <div style={{ color: '#666', padding: '1rem', fontSize: '0.85rem' }}>Loading…</div>
      )}

      {entries.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Date', 'Amount', 'Currency', 'TX Hash', 'Reason'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: '#a0a0c0', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: '#888', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#34d399' }}>
                    +{Number(e.delta).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem' }}>
                    <span style={{ color: '#a78bfa', fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.currencyId}</span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.txHash ? (
                      <a
                        href={`https://cardanoscan.io/transaction/${e.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={e.txHash}
                        style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'underline', textUnderlineOffset: 2 }}
                      >
                        {e.txHash.slice(0, 16)}…{e.txHash.slice(-8)}
                      </a>
                    ) : (
                      <span style={{ color: '#444' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                    {e.reason || <span style={{ color: '#444' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#555' }}>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
      )}
    </div>
  );
}

type CryptoTab = 'config' | 'withdrawals' | 'unresolved' | 'ledger';

const TAB_LABELS: Record<CryptoTab, string> = {
  config: 'Config & Balance',
  withdrawals: 'Withdrawals Queue',
  unresolved: 'Unresolved Deposits',
  ledger: 'Player Ledger',
};

export function CryptoAdminPage() {
  const [tab, setTab] = useState<CryptoTab>('config');

  return (
    <div>
      <AdaOracleWidget />
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 1rem', color: '#e0e0ff', fontSize: '1.15rem' }}>DERP Crypto Wallet</h2>
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
          {(Object.keys(TAB_LABELS) as CryptoTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.4rem 1rem', borderRadius: '6px 6px 0 0',
                border: `1px solid ${tab === t ? 'rgba(99,102,241,0.5)' : 'transparent'}`,
                borderBottom: tab === t ? '1px solid #1a1a2e' : 'transparent',
                background: tab === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: tab === t ? '#a78bfa' : '#666', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      {tab === 'config' && <ConfigTab />}
      {tab === 'withdrawals' && <WithdrawalsTab />}
      {tab === 'unresolved' && <UnresolvedDepositsTab />}
      {tab === 'ledger' && <PlayerDepositLedgerTab />}
    </div>
  );
}
