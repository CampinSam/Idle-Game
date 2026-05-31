import { useState, useEffect } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
  onNavigate: (section: string, sub?: string) => void;
}

function StatCard({ title, value, sub, accent }: { title: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="av2-card" style={{ borderTop: accent ? `2px solid ${accent}` : undefined }}>
      <div className="av2-card-title">{title}</div>
      <div className="av2-card-value">{value}</div>
      {sub && <div className="av2-card-sub">{sub}</div>}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="av2-card">
      <div className="av2-card-title">{title}</div>
      {children}
    </div>
  );
}

export default function AdminV2Dashboard({ me, onNavigate }: Props) {
  const perms = me.role.permissionFlags;
  const isSuperAdmin = me.role.slug === 'super_admin' || me.isBootstrap;

  const [pendingDrafts, setPendingDrafts] = useState<number | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [season, setSeason] = useState<any>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingSeason, setLoadingSeason] = useState(false);

  useEffect(() => {
    if (perms.approve) {
      setLoadingDrafts(true);
      adminApi.listDrafts({ status: 'pending', limit: 100 })
        .then(d => setPendingDrafts(d.length))
        .catch(() => setPendingDrafts(null))
        .finally(() => setLoadingDrafts(false));
    }
  }, [perms.approve]);

  useEffect(() => {
    if (perms.read || perms.write || isSuperAdmin) {
      setLoadingAudit(true);
      adminApi.listAuditLog({ limit: 5 })
        .then(setAuditLog)
        .catch(() => {})
        .finally(() => setLoadingAudit(false));
    }
  }, [perms.read, perms.write, isSuperAdmin]);

  useEffect(() => {
    setLoadingSeason(true);
    adminApi.listSeasons()
      .then(seasons => {
        const active = seasons.find((s: any) => s.isActive) || seasons[0] || null;
        setSeason(active);
      })
      .catch(() => {})
      .finally(() => setLoadingSeason(false));
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const recentDefs = auditLog.filter(e =>
    e.tableName && !['AdminAccount', 'AdminRole'].includes(e.tableName)
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#d4d4f0', margin: '0 0 4px' }}>
          {greeting}, {me.username}
        </h1>
        <p style={{ fontSize: 13, color: '#4a4a7a', margin: 0 }}>
          {me.role.name} · {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="av2-dashboard-grid" style={{ padding: 0 }}>

        {/* Season */}
        {season && (
          <StatCard
            title="Current Season"
            value={season.name || season.id}
            sub={season.isActive ? '🟢 Active' : '⚫ Inactive'}
            accent="#6c63ff"
          />
        )}
        {loadingSeason && !season && (
          <StatCard title="Current Season" value="…" />
        )}

        {/* Pending Approvals */}
        {perms.approve && (
          <div
            className="av2-card"
            style={{ borderTop: '2px solid #f59e0b', cursor: 'pointer' }}
            onClick={() => onNavigate('approvals')}
          >
            <div className="av2-card-title">Pending Approvals</div>
            <div className="av2-card-value" style={{ color: pendingDrafts ? '#fcd34d' : '#e0e0ff' }}>
              {loadingDrafts ? '…' : (pendingDrafts ?? '—')}
            </div>
            <div className="av2-card-sub">
              {pendingDrafts ? 'Click to review' : 'No pending drafts'}
            </div>
          </div>
        )}

        {/* Active Players (placeholder — no aggregate count endpoint) */}
        {perms.player_read && (
          <div
            className="av2-card"
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('players')}
          >
            <div className="av2-card-title">Player Management</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Search players, inspect profiles, manage currencies and items, view active missions, wallets, and recent events.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Search players →</div>
          </div>
        )}

        {/* System Status */}
        {perms.system_tools && (
          <InfoCard title="System Status">
            <div className="av2-stat-row">
              <span className="av2-stat-key">API</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>● Online</span>
            </div>
            <div className="av2-stat-row">
              <span className="av2-stat-key">Session</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>● Active</span>
            </div>
            <div className="av2-stat-row">
              <span className="av2-stat-key">Tick Engine</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>● Running</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6c63ff', cursor: 'pointer' }}
              onClick={() => onNavigate('system', 'icons')}>
              Open System Tools →
            </div>
          </InfoCard>
        )}

        {/* Recent Definitions (from audit log, visible to anyone with read/write) */}
        {(perms.read || perms.write) && (
          <InfoCard title="Recent Definitions">
            {loadingAudit && <div style={{ color: '#3a3a6a', fontSize: 12 }}>Loading…</div>}
            {!loadingAudit && recentDefs.length === 0 && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>No recent definition changes</div>
            )}
            {recentDefs.slice(0, 5).map((entry: any, i) => (
              <div key={i} className="av2-stat-row">
                <span className="av2-stat-key" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.tableName}
                </span>
                <span className="av2-stat-val" style={{ fontSize: 11, color: '#6060a0' }}>
                  {entry.action} · {entry.admin?.username ?? '?'}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6c63ff', cursor: 'pointer' }}
              onClick={() => onNavigate('content')}>
              Open Content Editor →
            </div>
          </InfoCard>
        )}

        {/* Audit Log (super admin only) */}
        {isSuperAdmin && (
          <InfoCard title="Full Audit Log">
            {loadingAudit && <div style={{ color: '#3a3a6a', fontSize: 12 }}>Loading…</div>}
            {!loadingAudit && auditLog.length === 0 && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>No recent actions</div>
            )}
            {auditLog.map((entry: any, i) => (
              <div key={i} className="av2-stat-row">
                <span className="av2-stat-key">{entry.action}</span>
                <span className="av2-stat-val" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {entry.tableName} · {entry.admin?.username ?? '?'}
                </span>
              </div>
            ))}
          </InfoCard>
        )}

        {/* Economy shortcut */}
        {perms.system_tools && (
          <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('economy')}>
            <div className="av2-card-title">Balance Simulator</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Monte-Carlo simulation of entity power score progression.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open simulator →</div>
          </div>
        )}

        {/* Content editor shortcut (read/write without system_tools) */}
        {(perms.read || perms.write) && (
          <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('content')}>
            <div className="av2-card-title">Content Editor</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Definitions, missions, entities, locations, rewards, store, and more.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open editor →</div>
          </div>
        )}

        {/* Permissions */}
        <InfoCard title="Your Permissions">
          {Object.entries(perms).map(([key, val]) => (
            <div key={key} className="av2-stat-row">
              <span className="av2-stat-key">{key.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: val ? '#34d399' : '#4a4a7a' }}>
                {val ? '✓' : '—'}
              </span>
            </div>
          ))}
          {me.contentScopes.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#3a3a6a' }}>
              Scopes: {me.contentScopes.join(', ')}
            </div>
          )}
        </InfoCard>

      </div>
    </div>
  );
}
