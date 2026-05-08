import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { register, clearError, setAuth } from '../../store/authSlice';
import { useWalletConnect } from '../../hooks/useWalletConnect';

export default function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((s) => s.auth);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { connecting, error: walletError, detectedCardanoWallets, hasEvm, connectEvm, connectCardano, clearError: clearWalletError } = useWalletConnect();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(register({ username, email, password }));
    if (register.fulfilled.match(result)) {
      navigate('/');
    }
  };

  const handleWalletResult = (result: Awaited<ReturnType<typeof connectEvm>>) => {
    if (!result) return;
    if (result.kind === 'onboarding') {
      navigate('/onboarding/wallet', {
        state: { walletToken: result.walletToken, chain: result.chain, address: result.address },
      });
      return;
    }
    dispatch(setAuth({ token: result.accessToken, player: result.player }));
    navigate('/');
  };

  const handleEvmConnect = async () => {
    clearWalletError();
    handleWalletResult(await connectEvm());
  };

  const handleCardanoConnect = async (walletKey: string) => {
    clearWalletError();
    handleWalletResult(await connectCardano(walletKey));
  };

  const showWalletSection = hasEvm || detectedCardanoWallets.length > 0;

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
        <h1>Derp Universe</h1>
        <p className="auth-subtitle">Begin your journey as a Keeper</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); dispatch(clearError()); }}
              placeholder="Choose your keeper name"
              minLength={3}
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); dispatch(clearError()); }}
              placeholder="keeper@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); dispatch(clearError()); }}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Start Your Adventure'}
          </button>
        </form>

        {showWalletSection && (
          <>
            <div className="auth-divider">or start with a wallet</div>
            {walletError && <div className="auth-error">{walletError}</div>}
            <div className="wallet-btn-group">
              {hasEvm && (
                <button
                  className="wallet-btn wallet-btn-evm"
                  onClick={handleEvmConnect}
                  disabled={connecting}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  {connecting ? 'Connecting...' : 'MetaMask / EVM Wallet'}
                </button>
              )}
              {detectedCardanoWallets.map((w) => (
                <button
                  key={w.key}
                  className="wallet-btn wallet-btn-cardano"
                  onClick={() => handleCardanoConnect(w.key)}
                  disabled={connecting}
                >
                  {w.icon ? (
                    <img src={w.icon} alt={w.name} width="18" height="18" style={{ borderRadius: 4 }} />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                  )}
                  {connecting ? 'Connecting...' : w.name}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="auth-link">
          Already a Keeper? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
