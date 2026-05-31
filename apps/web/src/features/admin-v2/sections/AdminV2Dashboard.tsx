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
      adminApi.listDrafts({ status: 'pending', limit: 1 })
        .then(d => setPendingDrafts(d.length >= 1 ? d.length : 0))
        .catch(() => setPendingDrafts(null))
        .finally(() => setLoadingDrafts(false));
    }
  }, [perms.approve]);

  useEffect(() => {
    if (isSuperAdmin) {
      setLoadingAudit(true);
      adminApi.listAuditLog({ limit: 5 })
        .then(setAuditLog)
        .catch(() => {})
        .finally(() => setLoadingAudit(false));
    }
  }, [isSuperAdmin]);

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

        {isSuperAdmin && (
          <InfoCard title="Recent Audit Log">
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

        {(perms.read || perms.write) && (
          <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('content')}>
            <div className="av2-card-title">Content Editor</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Definitions, missions, entities, locations, rewards, store, and more.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open editor →</div>
          </div>
        )}

        {perms.player_read && (
          <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('players')}>
            <div className="av2-card-title">Player Management</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Search players, inspect profiles, manage currencies and items, view active missions.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Search players →</div>
          </div>
        )}

        {perms.system_tools && (
          <>
            <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('economy')}>
              <div className="av2-card-title">Balance Simulator</div>
              <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
                Monte-Carlo simulation of entity power score progression.
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open simulator →</div>
            </div>

            <div className="av2-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('system', 'icons')}>
              <div className="av2-card-title">System Tools</div>
              <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
                Icons, audio, visual tags, telemetry, god mode, selection testing, and crypto.
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open tools →</div>
            </div>
          </>
        )}

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
