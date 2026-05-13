import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { login, clearError, setAuth } from '../../store/authSlice';
import { useWalletConnect } from '../../hooks/useWalletConnect';

const IS_DEV = (import.meta as any).env?.DEV;

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState(IS_DEV ? 'test@derp.dev' : '');
  const [password, setPassword] = useState(IS_DEV ? 'Derp1234!' : '');
  const { token } = useAppSelector((s) => s.auth);
  const autoLoginDone = useRef(false);

  const { connecting, error: walletError, detectedCardanoWallets, hasEvm, connectEvm, connectCardano, clearError: clearWalletError } = useWalletConnect();
  // After ~6s of "Connecting..." with no popup we show a troubleshooting hint.
  // The most common cause for a hang here is that the wallet extension was
  // disabled, wedged, or lost focus — which we can't detect from the page.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (!connecting) { setShowHint(false); return; }
    const t = setTimeout(() => setShowHint(true), 6000);
    return () => clearTimeout(t);
  }, [connecting]);

  useEffect(() => {
    if (IS_DEV && !autoLoginDone.current && !token) {
      autoLoginDone.current = true;
      dispatch(login({ email: 'test@derp.dev', password: 'Derp1234!' })).then((result) => {
        if (login.fulfilled.match(result)) {
          navigate('/');
        }
      });
    }
  }, [dispatch, navigate, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
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
        <p className="auth-subtitle">Welcome back, Keeper</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
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
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Enter the Universe'}
          </button>
        </form>

        {showWalletSection && (
          <>
            <div className="auth-divider">or connect a wallet</div>
            {walletError && <div className="auth-error">{walletError}</div>}
            {showHint && !walletError && (
              <div className="auth-hint">
                Don't see a wallet popup? Click your wallet's extension icon
                in the browser toolbar — it may have a pending request.
                If that doesn't help, refresh the page and make sure only
                one Cardano wallet is enabled.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {hasEvm && (
                <button
                  className="flex items-center gap-2.5 w-full py-3 px-4 rounded-[11px] border text-sm font-medium cursor-pointer font-exo transition-[transform,box-shadow,opacity] duration-150 text-left bg-[rgba(99,102,241,0.08)] border-[rgba(99,102,241,0.28)] text-[#a5b4fc] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.18)] disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="flex items-center gap-2.5 w-full py-3 px-4 rounded-[11px] border text-sm font-medium cursor-pointer font-exo transition-[transform,box-shadow,opacity] duration-150 text-left bg-[rgba(0,51,173,0.1)] border-[rgba(0,102,255,0.28)] text-[#93c5fd] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,100,255,0.14)] disabled:opacity-60 disabled:cursor-not-allowed"
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
          New Keeper? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
