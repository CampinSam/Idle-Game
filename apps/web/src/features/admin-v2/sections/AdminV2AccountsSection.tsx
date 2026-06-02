import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

interface Account {
  id: string;
  username: string;
  enabled: boolean;
  role: { id: string; name: string; slug: string };
  contentScopes: string[];
  permissionFlagsOverride: { metrics_read?: boolean };
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  slug: string;
}

type Panel = 'list' | 'create' | 'edit';

const SCOPE_OPTIONS = [
  'UI', 'Missions', 'Crafting', 'Locations', 'Economy', 'Rewards',
  'Store', 'NFT', 'Effects', 'Synergy', 'Rules', 'System', 'Telemetry',
  'Screens', 'Payments', 'Entities',
];

function ScopeSelect({ scopes, onChange }: { scopes: string[]; onChange: (s: string[]) => void }) {
  const toggle = (s: string) =>
    onChange(scopes.includes(s) ? scopes.filter(x => x !== s) : [...scopes, s]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {SCOPE_OPTIONS.map(s => (
        <button
          key={s}
          type="button"
          onClick={() => toggle(s)}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: '1px solid',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: scopes.includes(s) ? 'rgba(108,99,255,0.2)' : 'transparent',
            borderColor: scopes.includes(s) ? 'rgba(108,99,255,0.5)' : '#1a1b35',
            color: scopes.includes(s) ? '#a89fff' : '#4a4a7a',
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function CreateForm({
  roles,
  onSave,
  onCancel,
}: {
  roles: Role[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id || '');
  const [scopes, setScopes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = roles.find(r => r.id === roleId)?.slug === 'super_admin';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || !roleId) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.createAccount({ username: username.trim(), password, roleId, contentScopes: scopes });
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#d4d4f0', marginBottom: 20 }}>Create Admin Account</h2>

      <label className="av2-form-label">Username</label>
      <input className="av2-form-input" value={username} onChange={e => setUsername(e.target.value)} autoFocus required />

      <label className="av2-form-label">Password (min 8 chars)</label>
      <input className="av2-form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />

      <label className="av2-form-label">Role</label>
      <select className="av2-form-input" value={roleId} onChange={e => setRoleId(e.target.value)}>
        {roles.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      {!isSuperAdmin && (
        <>
          <label className="av2-form-label" style={{ marginTop: 12 }}>Content Scopes</label>
          <ScopeSelect scopes={scopes} onChange={setScopes} />
        </>
      )}

      {error && <div className="av2-inline-msg error" style={{ marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="submit" className="av2-btn-primary" disabled={saving || !username.trim() || !password || !roleId}>
          {saving ? 'Creating…' : 'Create Account'}
        </button>
        <button type="button" className="av2-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EditForm({
  account,
  roles,
  myId,
  onSave,
  onCancel,
}: {
  account: Account;
  roles: Role[];
  myId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [roleId, setRoleId] = useState(account.role.id);
  const [scopes, setScopes] = useState<string[]>(account.contentScopes);
  const [enabled, setEnabled] = useState(account.enabled);
  const [metricsRead, setMetricsRead] = useState<boolean>(account.permissionFlagsOverride?.metrics_read ?? false);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isSelf = account.id === myId;
  const isSuperAdmin = roles.find(r => r.id === roleId)?.slug === 'super_admin';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updates: any = {
        roleId,
        contentScopes: isSuperAdmin ? [] : scopes,
        enabled,
        permissionFlagsOverride: { metrics_read: metricsRead },
      };
      if (newPassword) updates.password = newPassword;
      await adminApi.updateAccount(account.id, updates);
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete account "${account.username}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await adminApi.deleteAccount(account.id);
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#d4d4f0', margin: 0 }}>
          Edit: {account.username}
        </h2>
        {!isSelf && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '4px 12px', background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6,
              color: '#f87171', fontSize: 12, cursor: 'pointer',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        )}
      </div>

      <label className="av2-form-label">Role</label>
      <select
        className="av2-form-input"
        value={roleId}
        onChange={e => setRoleId(e.target.value)}
        disabled={isSelf}
      >
        {roles.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      {isSelf && <div style={{ fontSize: 11, color: '#4a4a7a', marginTop: 4 }}>You cannot change your own role.</div>}

      {!isSuperAdmin && (
        <>
          <label className="av2-form-label" style={{ marginTop: 12 }}>Content Scopes</label>
          <ScopeSelect scopes={scopes} onChange={setScopes} />
        </>
      )}

      {!isSuperAdmin && (
        <>
          <label className="av2-form-label" style={{ marginTop: 14 }}>Permission Overrides</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <input
              type="checkbox"
              id="metrics_read_toggle"
              checked={metricsRead}
              onChange={e => setMetricsRead(e.target.checked)}
              style={{ accentColor: '#6c63ff', width: 14, height: 14 }}
            />
            <label htmlFor="metrics_read_toggle" style={{ fontSize: 12, color: '#a89fff', cursor: 'pointer', margin: 0 }}>
              metrics_read — grant access to the Game Health dashboard
            </label>
          </div>
        </>
      )}

      <label className="av2-form-label" style={{ marginTop: 12 }}>Reset Password (leave blank to keep current)</label>
      <input
        className="av2-form-input"
        type="password"
        placeholder="New password (min 8 chars)…"
        value={newPassword}
        onChange={e => setNewPassword(e.target.value)}
      />

      {!isSelf && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <label className="av2-form-label" style={{ margin: 0 }}>Account enabled</label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            style={{ accentColor: '#6c63ff' }}
          />
        </div>
      )}

      {error && <div className="av2-inline-msg error" style={{ marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="submit" className="av2-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" className="av2-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function AdminV2AccountsSection({ me }: Props) {
  const isSuperAdmin = me.role.slug === 'super_admin' || me.isBootstrap;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('list');
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accs, rls] = await Promise.all([adminApi.listAccounts(), adminApi.listRoles()]);
      setAccounts(accs);
      setRoles(rls);
    } catch (e: any) {
      setError(e.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return (
      <div className="av2-access-denied">
        <div className="av2-access-denied-icon">🔒</div>
        <div>Account management requires Super Admin role.</div>
      </div>
    );
  }

  if (loading) return <div className="av2-loading">Loading accounts…</div>;
  if (error) return <div className="av2-inline-msg error" style={{ margin: 20 }}>{error}</div>;

  if (panel === 'create') {
    return (
      <div className="av2-section-wrap">
        <CreateForm
          roles={roles}
          onSave={() => {
            setSuccess('Account created.');
            setPanel('list');
            load();
          }}
          onCancel={() => setPanel('list')}
        />
      </div>
    );
  }

  if (panel === 'edit' && editTarget) {
    return (
      <div className="av2-section-wrap">
        <EditForm
          account={editTarget}
          roles={roles}
          myId={me.id}
          onSave={() => {
            setSuccess('Account updated.');
            setEditTarget(null);
            setPanel('list');
            load();
          }}
          onCancel={() => { setEditTarget(null); setPanel('list'); }}
        />
      </div>
    );
  }

  return (
    <div className="av2-section-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#d4d4f0', margin: 0 }}>Admin Accounts</h2>
        <button
          className="av2-btn-primary"
          onClick={() => { setSuccess(null); setPanel('create'); }}
        >
          + New Account
        </button>
      </div>

      {success && <div className="av2-inline-msg success" style={{ marginBottom: 12 }}>{success}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map(acc => (
          <div
            key={acc.id}
            className="av2-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: acc.enabled ? 1 : 0.5,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#d4d4f0' }}>{acc.username}</span>
                {acc.id === me.id && (
                  <span style={{ fontSize: 10, color: '#6c63ff', fontWeight: 700 }}>YOU</span>
                )}
                {!acc.enabled && (
                  <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>DISABLED</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span className="av2-draft-table">{acc.role.name}</span>
                {acc.contentScopes.map(s => (
                  <span key={s} style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 3,
                    background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.25)',
                    color: '#6b7280',
                  }}>{s}</span>
                ))}
              </div>
            </div>
            <button
              className="av2-btn-ghost"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => { setSuccess(null); setEditTarget(acc); setPanel('edit'); }}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6060a0', marginBottom: 12 }}>Roles</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {roles.map(r => (
            <div key={r.id} className="av2-stat-row">
              <span className="av2-stat-key">{r.name}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4a4a7a' }}>{r.slug}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
