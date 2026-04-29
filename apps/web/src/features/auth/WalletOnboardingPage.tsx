import { useState } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAppDispatch } from '../../store';
import { setAuth } from '../../store/authSlice';
import { api } from '../../services/api';
import './Auth.css';

interface OnboardingState {
  walletToken: string;
  chain: string;
  address: string;
}

function shortenAddress(addr: string) {
  if (!addr) return '';
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function chainLabel(chain: string) {
  switch (chain) {
    case 'ETH': return 'Ethereum';
    case 'BASE': return 'Base';
    case 'MATIC': return 'Polygon';
    case 'CARDANO': return 'Cardano';
    default: return chain;
  }
}

export default function WalletOnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || null) as OnboardingState | null;

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state || !state.walletToken) {
    // Came here without a verified wallet — bounce back to login.
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.walletCompleteOnboarding(
        state.walletToken,
        username.trim(),
        email.trim() || undefined,
      );
      dispatch(setAuth({ token: res.accessToken, player: res.player }));
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Could not finish account setup');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
        </div>
        <h1>Finish setup</h1>
        <p className="auth-subtitle">Pick your Keeper name to claim this wallet</p>

        <div
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 8,
            padding: '12px 14px',
            margin: '16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 16 }}>✓</span>
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontWeight: 600 }}>{chainLabel(state.chain)} wallet verified</div>
            <div style={{ opacity: 0.75, fontFamily: 'monospace', fontSize: 12 }}>
              {shortenAddress(state.address)}
            </div>
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              placeholder="Choose your keeper name"
              minLength={3}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Email <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="keeper@example.com"
            />
          </div>
          <button type="submit" className="auth-btn" disabled={submitting || username.trim().length < 3}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-link">
          Changed your mind? <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
