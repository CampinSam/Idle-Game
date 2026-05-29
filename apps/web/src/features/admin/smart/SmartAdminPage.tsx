import { useState, useEffect } from 'react';
import { adminApi, getAdminToken } from '../adminApi';
import SmartAdminEditor from './SmartAdminEditor';
import '../admin.css';

export default function SmartAdminPage() {
  const [authed, setAuthed] = useState(!!(getAdminToken() || import.meta.env.DEV));

  useEffect(() => {
    if (!authed) {
      adminApi.getTables().then(() => setAuthed(true)).catch(() => {});
    }
  }, [authed]);

  if (!authed) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1>Derp Universe Admin</h1>
          <p style={{ color: '#888', fontSize: '0.9rem', marginTop: 8 }}>
            Please <a href="/admin" style={{ color: '#7c3aed' }}>sign in</a> to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <SmartAdminEditor adminKey="" />;
}
