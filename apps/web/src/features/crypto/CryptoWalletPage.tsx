import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../../store';

const API_BASE = '/api';

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem('derp_token') || ''}`,
    'Content-Type': 'application/json',
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    PENDING: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    APPROVED: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    REJECTED: { bg: 'rgba(255,107,107,0.15)', color: '#ff6b6b' },
    SENT: { bg: 'rgba(76,175,80,0.15)', color: '#4caf50' },
  };
  const s = styles[status] ?? { bg: 'rgba(128,128,128,0.1)', color: '#aaa' };
  return (
    <span style={{
      padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      style={{
        padding: '0.3rem 0.7rem', borderRadius: 5, border: '1px solid rgba(167,139,250,0.4)',
        background: 'rgba(167,139,250,0.1)', color: copied ? '#4caf50' : '#a78bfa',
        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function DepositTab({ depositInfo }: { depositInfo: any }) {
  if (!depositInfo?.hotWalletAddress) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
        Deposit address not configured yet. Please check back later.
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(depositInfo.hotWalletAddress)}&bgcolor=1a1640&color=c4b5fd&margin=8`;

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
        border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, padding: '1.25rem',
        marginBottom: '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Deposit Address
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <code style={{
            fontSize: '0.82rem', color: '#c4b5fd', wordBreak: 'break-all', flex: 1,
            background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: 6,
          }}>
            {depositInfo.hotWalletAddress}
          </code>
          <CopyButton text={depositInfo.hotWalletAddress} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <img
            src={qrUrl}
            alt="Deposit address QR code"
            style={{ width: 160, height: 160, borderRadius: 8, border: '2px solid rgba(167,139,250,0.3)' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h4 style={{ margin: '0 0 0.75rem', color: '#b8b8ff', fontSize: '0.95rem' }}>How to Deposit</h4>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#a0a0c0', fontSize: '0.88rem', lineHeight: 1.7 }}>
            <li>Connect your Cardano wallet in <strong style={{ color: '#c4b5fd' }}>Settings → Wallets</strong></li>
            <li>Send DERP COIN (CNT) to the deposit address above</li>
            <li>Your in-game DERP balance updates automatically (up to ~20 sec)</li>
          </ol>
          <div style={{
            marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 6,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            fontSize: '0.82rem', color: '#fbbf24',
          }}>
            ⚠️ Only send from your <strong>linked</strong> Cardano wallet. Deposits from unlinked wallets cannot be credited.
          </div>
        </div>
      </div>
    </div>
  );
}

function WithdrawTab({
  balance,
  linkedWallets,
  depositInfo,
}: {
  balance: number;
  linkedWallets: Array<{ id: string; chain: string; address: string; isPrimary: boolean }>;
  depositInfo: any;
}) {
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const cardanoWallets = linkedWallets.filter((w) => w.chain === 'CARDANO');
  const primaryCardano = cardanoWallets.find((w) => w.isPrimary) ?? cardanoWallets[0];

  useEffect(() => {
    if (primaryCardano) setAddress(primaryCardano.address);
  }, [primaryCardano?.address]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await apiGet<any[]>('/crypto/withdrawals?limit=10');
      setWithdrawals(rows);
    } catch {
      /* ignore */
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) {
      setMsg({ text: 'Enter a valid amount', type: 'error' });
      return;
    }
    if (!address.trim()) {
      setMsg({ text: 'Enter or select a destination address', type: 'error' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      await apiPost('/crypto/withdraw', { amount: amt, destinationAddress: address });
      setMsg({ text: 'Withdrawal request submitted! It will be processed shortly.', type: 'success' });
      setAmount('');
      loadHistory();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem',
      }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', color: '#a0a0c0', marginBottom: 4 }}>
            Amount (DERP) — Available: <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{balance.toLocaleString()}</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number"
              min={1}
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              style={{
                flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, color: '#e0e0ff', padding: '0.5rem 0.7rem', fontSize: '1rem',
              }}
            />
            <button
              onClick={() => setAmount(String(balance))}
              style={{
                padding: '0.5rem 0.9rem', borderRadius: 6, border: '1px solid rgba(167,139,250,0.4)',
                background: 'rgba(167,139,250,0.1)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              }}
            >
              MAX
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', color: '#a0a0c0', marginBottom: 4 }}>
            Destination Cardano Address
          </label>
          {cardanoWallets.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              {cardanoWallets.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setAddress(w.address)}
                  style={{
                    padding: '0.25rem 0.55rem', borderRadius: 4, fontSize: '0.77rem',
                    border: `1px solid ${address === w.address ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.15)'}`,
                    background: address === w.address ? 'rgba(167,139,250,0.15)' : 'transparent',
                    color: address === w.address ? '#c4b5fd' : '#888', cursor: 'pointer',
                  }}
                >
                  {w.isPrimary ? '★ ' : ''}{w.address.slice(0, 12)}…{w.address.slice(-6)}
                </button>
              ))}
            </div>
          )}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="addr1..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, color: '#e0e0ff', padding: '0.5rem 0.7rem', fontSize: '0.85rem',
              fontFamily: 'monospace', boxSizing: 'border-box',
            }}
          />
        </div>

        {depositInfo && (depositInfo.minWithdrawalAmount > 1 || Number(depositInfo.withdrawalFee) > 0) && (
          <div style={{
            marginBottom: '0.9rem', padding: '0.55rem 0.75rem',
            background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)',
            borderRadius: 6, fontSize: '0.8rem', color: '#a0a0c0', lineHeight: 1.6,
          }}>
            {Number(depositInfo.withdrawalFee) > 0 && (
              <div>Fee: <span style={{ color: '#c4b5fd', fontWeight: 600 }}>{Number(depositInfo.withdrawalFee).toLocaleString()} DERP</span> deducted from withdrawal</div>
            )}
            {depositInfo.minWithdrawalAmount > 1 && (
              <div>
                Minimum: <span style={{ color: '#c4b5fd', fontWeight: 600 }}>
                  {depositInfo.minWithdrawalType === 'ADA_VALUE'
                    ? `${depositInfo.minWithdrawalAmount} ADA`
                    : depositInfo.minWithdrawalType === 'USD_VALUE'
                      ? `$${depositInfo.minWithdrawalAmount} USD`
                      : `${Number(depositInfo.minWithdrawalAmount).toLocaleString()} DERP`}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !amount || !address}
          style={{
            width: '100%', padding: '0.65rem', borderRadius: 8, border: 'none',
            background: submitting ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.7)',
            color: '#fff', cursor: submitting ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.95rem',
          }}
        >
          {submitting ? 'Submitting…' : 'Request Withdrawal'}
        </button>

        {msg && (
          <div style={{
            marginTop: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 6,
            background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
            color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
            border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
            fontSize: '0.88rem',
          }}>
            {msg.text}
          </div>
        )}
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.75rem', color: '#888', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Withdrawal History
        </h4>
        {loadingHistory ? (
          <div style={{ color: '#666', fontSize: '0.85rem' }}>Loading…</div>
        ) : withdrawals.length === 0 ? (
          <div style={{ color: '#555', fontSize: '0.85rem', padding: '1rem 0' }}>No withdrawals yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {withdrawals.map((w) => (
              <div key={w.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7,
                fontSize: '0.85rem', flexWrap: 'wrap', gap: '0.4rem',
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#e0e0ff' }}>{Number(w.amount).toLocaleString()} DERP</span>
                  {Number(w.fee) > 0 && <span style={{ color: '#666', marginLeft: 6, fontSize: '0.78rem' }}>(-{Number(w.fee)} fee)</span>}
                </div>
                <StatusBadge status={w.status} />
                <div style={{ color: '#555', fontSize: '0.78rem' }}>{new Date(w.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DepositHistoryTab() {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<any[]>('/crypto/deposits?limit=20')
      .then(setDeposits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#666', padding: '1rem' }}>Loading…</div>;
  if (deposits.length === 0) return <div style={{ color: '#555', padding: '1rem 0', fontSize: '0.85rem' }}>No deposits yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {deposits.map((d) => (
        <div key={d.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7,
          fontSize: '0.85rem', flexWrap: 'wrap', gap: '0.4rem',
        }}>
          <div>
            <span style={{ fontWeight: 700, color: '#4caf50' }}>+{Number(d.delta).toLocaleString()} DERP</span>
          </div>
          {d.sourceId && (
            <a
              href={`https://cardanoscan.io/transaction/${d.sourceId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none' }}
            >
              {d.sourceId.slice(0, 16)}…
            </a>
          )}
          <div style={{ color: '#555', fontSize: '0.78rem' }}>{new Date(d.createdAt).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  );
}

type CryptoTab = 'deposit' | 'withdraw' | 'history';

export default function CryptoWalletPage() {
  const [tab, setTab] = useState<CryptoTab>('deposit');
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [linkedWallets, setLinkedWallets] = useState<any[]>([]);
  const [derpBalance, setDerpBalance] = useState(0);

  const currencyBalances = useAppSelector((s: any) => s.game?.currencyBalances ?? {});

  useEffect(() => {
    setDerpBalance(currencyBalances['crypto_derp'] ?? 0);
  }, [currencyBalances]);

  useEffect(() => {
    apiGet('/crypto/deposit-info').then(setDepositInfo).catch(() => {});
    apiGet<any[]>('/player/wallets').then(setLinkedWallets).catch(() => {});
  }, []);

  const TABS: { key: CryptoTab; label: string }[] = [
    { key: 'deposit', label: 'Deposit' },
    { key: 'withdraw', label: 'Withdraw' },
    { key: 'history', label: 'Deposit History' },
  ];

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-page, #0f0e1a)', padding: '1.5rem 1rem',
      color: '#e0e0ff', fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: 800, color: '#e0e0ff' }}>
            DERP Wallet
          </h1>
          <div style={{ color: '#888', fontSize: '0.88rem' }}>Deposit or withdraw DERP COIN on-chain</div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
          border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12,
          padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              In-Game DERP Balance
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#c4b5fd', letterSpacing: '-0.01em' }}>
              {derpBalance.toLocaleString()}
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
          }}>
            💎
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px 6px 0 0', border: 'none',
                  borderBottom: tab === t.key ? '2px solid #a78bfa' : '2px solid transparent',
                  background: 'transparent',
                  color: tab === t.key ? '#c4b5fd' : '#666', cursor: 'pointer',
                  fontSize: '0.88rem', fontWeight: tab === t.key ? 700 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '1.25rem',
        }}>
          {tab === 'deposit' && <DepositTab depositInfo={depositInfo} />}
          {tab === 'withdraw' && <WithdrawTab balance={derpBalance} linkedWallets={linkedWallets} depositInfo={depositInfo} />}
          {tab === 'history' && <DepositHistoryTab />}
        </div>
      </div>
    </div>
  );
}
