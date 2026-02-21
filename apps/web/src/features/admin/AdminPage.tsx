import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminKey, setAdminKey } from './adminApi';
import DerpAdminEditor from './DerpAdminEditor';
import './admin.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (loginKey: string) => {
    setLoading(true);
    setError('');
    setAdminKey(loginKey);
    try {
      await adminApi.getTables();
      onLogin();
    } catch {
      setError('Invalid admin key');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  useEffect(() => {
    if (import.meta.env.DEV && DEV_ADMIN_KEY && !autoSubmitted.current) {
      autoSubmitted.current = true;
      doLogin(DEV_ADMIN_KEY);
    }
  }, [doLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(key);
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1>Derp Universe Admin</h1>
        <input
          type="password"
          placeholder="Admin Key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Enter'}
        </button>
        {error && <div className="admin-error">{error}</div>}
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return <DerpAdminEditor adminKey={getAdminKey()} />;
}
