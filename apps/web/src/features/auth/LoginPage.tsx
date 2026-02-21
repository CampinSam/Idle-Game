import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { login, clearError } from '../../store/authSlice';
import './Auth.css';

const IS_DEV = (import.meta as any).env?.DEV;

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState(IS_DEV ? 'test@derp.dev' : '');
  const [password, setPassword] = useState(IS_DEV ? 'test123456' : '');
  const { token } = useAppSelector((s) => s.auth);
  const autoLoginDone = useRef(false);

  useEffect(() => {
    if (IS_DEV && !autoLoginDone.current && !token) {
      autoLoginDone.current = true;
      dispatch(login({ email: 'test@derp.dev', password: 'test123456' })).then((result) => {
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

        <p className="auth-link">
          New Keeper? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
