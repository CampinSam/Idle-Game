import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
    } catch {
      // Intentionally swallowed — always show "check your email" to avoid leaking whether account exists
    } finally {
      setLoading(false);
      setSubmitted(true);
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
        <h1>Recover account</h1>

        {submitted ? (
          <>
            <p className="auth-subtitle" style={{ textAlign: 'center', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox (and spam folder).
            </p>
            <p className="auth-link" style={{ marginTop: '1.5rem' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">Enter your account email and we'll send a reset link.</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="keeper@example.com"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="auth-btn" disabled={loading || !email.trim()}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
            <p className="auth-link">
              Remembered it? <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
