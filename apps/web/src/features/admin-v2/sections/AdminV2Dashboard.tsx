import { useState, useEffect, useCallback } from 'react';
import { useInterval } from '../../../hooks/useNow';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
  onNavigate: (section: string, sub?: string) => void;
}

const CARD = "bg-[#0d0e1f] border border-[#1a1b35] rounded-[10px] p-4";
const CARD_TITLE = "text-[11px] font-bold tracking-[0.07em] uppercase text-[#4a4a7a] m-0 mb-3";
const CARD_VALUE = "text-[32px] font-[800] text-[#e0e0ff] leading-[1]";
const CARD_SUB = "text-[12px] text-[#4a4a7a] mt-[6px]";
const STAT_ROW = "flex items-center justify-between py-[6px] border-b border-[#1a1b35] text-[12px] last:border-b-0";
const STAT_KEY = "text-[#6060a0]";
const STAT_VAL = "text-[#c0c0e8] font-semibold";

function StatCard({ title, value, sub, accent }: { title: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className={CARD} style={{ borderTop: accent ? `2px solid ${accent}` : undefined }}>
      <div className={CARD_TITLE}>{title}</div>
      <div className={CARD_VALUE}>{value}</div>
      {sub && <div className={CARD_SUB}>{sub}</div>}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={CARD}>
      <div className={CARD_TITLE}>{title}</div>
      {children}
    </div>
  );
}

const JOB_STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  active: '#6c63ff',
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#6060a0',
};

export default function AdminV2Dashboard({ me, onNavigate }: Props) {
  const perms = me.role.permissionFlags;
  const isSuperAdmin = me.role.slug === 'super_admin' || me.isBootstrap;

  const [pendingDrafts, setPendingDrafts] = useState<number | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [season, setSeason] = useState<any>(null);
  const [playerCount, setPlayerCount] = useState<{ total: number; active: number } | null>(null);
  const [recentJobs, setRecentJobs] = useState<any[] | null>(null);
  const [systemHealth, setSystemHealth] = useState<{ api: string; currentTick: number; tickRate: number; tickDrift: number; jobCounts: Record<string, number> } | null>(null);

  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchQuickStats = useCallback(() => {
    if (perms.player_read) {
      setLoadingPlayers(true);
      adminApi.getPlayerCount()
        .then(d => setPlayerCount(d))
        .catch(() => setPlayerCount(null))
        .finally(() => setLoadingPlayers(false));
    }

    if (perms.system_tools) {
      setLoadingJobs(true);
      adminApi.listRecentJobs(10)
        .then(jobs => setRecentJobs(jobs))
        .catch(() => setRecentJobs(null))
        .finally(() => setLoadingJobs(false));

      setLoadingHealth(true);
      adminApi.getSystemHealth()
        .then(h => setSystemHealth(h))
        .catch(() => setSystemHealth(null))
        .finally(() => setLoadingHealth(false));
    }
  }, [perms.player_read, perms.system_tools]);

  useEffect(() => { fetchQuickStats(); }, [fetchQuickStats]);
  useInterval(fetchQuickStats, 60_000);

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

  const totalActiveJobs = systemHealth?.jobCounts?.active ?? null;
  const tickDrift = systemHealth?.tickDrift ?? null;
  const tickDriftColor = tickDrift === null ? '#6060a0'
    : tickDrift > 5 ? '#f87171'
    : tickDrift > 2 ? '#f59e0b'
    : '#34d399';
  const tickEngineStatus = loadingHealth
    ? '…'
    : systemHealth === null
    ? '—'
    : tickDrift !== null && tickDrift > 2
    ? `⚠ ${tickDrift} tick${tickDrift !== 1 ? 's' : ''} behind`
    : '● Running';

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

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] gap-4 p-5" style={{ padding: 0 }}>

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

        {perms.player_read && (
          <div
            className={CARD}
            style={{ borderTop: '2px solid #6c63ff', cursor: 'pointer' }}
            onClick={() => onNavigate('players')}
          >
            <div className={CARD_TITLE}>Players</div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#6060a0', marginBottom: 2 }}>Total</div>
                <div className={CARD_VALUE} style={{ color: '#d4d4f0' }}>
                  {loadingPlayers ? '…' : (playerCount !== null ? playerCount.total.toLocaleString() : '—')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6060a0', marginBottom: 2 }}>Active (24h)</div>
                <div className={CARD_VALUE} style={{ color: '#34d399' }}>
                  {loadingPlayers ? '…' : (playerCount !== null ? playerCount.active.toLocaleString() : '—')}
                </div>
              </div>
            </div>
            <div className={CARD_SUB}>Registered accounts · refreshes every 60s</div>
          </div>
        )}

        {perms.approve && (
          <div
            className={CARD}
            style={{ borderTop: '2px solid #f59e0b', cursor: 'pointer' }}
            onClick={() => onNavigate('approvals')}
          >
            <div className={CARD_TITLE}>Pending Approvals</div>
            <div className={CARD_VALUE} style={{ color: pendingDrafts ? '#fcd34d' : '#e0e0ff' }}>
              {loadingDrafts ? '…' : (pendingDrafts ?? '—')}
            </div>
            <div className={CARD_SUB}>
              {pendingDrafts ? 'Click to review' : 'No pending drafts'}
            </div>
          </div>
        )}

        {perms.player_read && !perms.system_tools && (
          <div
            className={CARD}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('players')}
          >
            <div className={CARD_TITLE}>Player Management</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Search players, inspect profiles, manage currencies and items, view active missions, wallets, and recent events.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Search players →</div>
          </div>
        )}

        {perms.system_tools && (
          <InfoCard title="Recent Jobs">
            {loadingJobs && <div style={{ color: '#3a3a6a', fontSize: 12 }}>Loading…</div>}
            {!loadingJobs && recentJobs !== null && recentJobs.length === 0 && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>No recent jobs</div>
            )}
            {!loadingJobs && recentJobs !== null && recentJobs.slice(0, 10).map((job: any, i: number) => {
              const label = job.def?.name ?? job.defId ?? job.type;
              const statusColor = JOB_STATUS_COLOR[job.status] ?? '#6060a0';
              return (
                <div key={i} className={STAT_ROW}>
                  <span className={STAT_KEY} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>
                    {job.status}
                  </span>
                </div>
              );
            })}
            {recentJobs === null && !loadingJobs && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>Unavailable</div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6c63ff', cursor: 'pointer' }}
              onClick={() => onNavigate('players')}>
              View player jobs →
            </div>
          </InfoCard>
        )}

        {perms.system_tools && (
          <InfoCard title="System Health">
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>API</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>● Online</span>
            </div>
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>Session</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>● Active</span>
            </div>
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>Tick Engine</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: tickDriftColor }}>
                {tickEngineStatus}
              </span>
            </div>
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>Current Tick</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d4d4f0' }}>
                {loadingHealth ? '…' : (systemHealth ? `#${systemHealth.currentTick.toLocaleString()}` : '—')}
              </span>
            </div>
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>Tick Rate</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d4d4f0' }}>
                {loadingHealth ? '…' : (systemHealth ? `${systemHealth.tickRate}/s` : '—')}
              </span>
            </div>
            <div className={STAT_ROW}>
              <span className={STAT_KEY}>Active Jobs</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: totalActiveJobs !== null && totalActiveJobs > 0 ? '#6c63ff' : '#34d399' }}>
                {loadingHealth ? '…' : (totalActiveJobs !== null ? totalActiveJobs.toLocaleString() : '—')}
              </span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6c63ff', cursor: 'pointer' }}
              onClick={() => onNavigate('system', 'icons')}>
              Open System Tools →
            </div>
          </InfoCard>
        )}

        {(perms.read || perms.write) && (
          <InfoCard title="Recent Definitions">
            {loadingAudit && <div style={{ color: '#3a3a6a', fontSize: 12 }}>Loading…</div>}
            {!loadingAudit && recentDefs.length === 0 && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>No recent definition changes</div>
            )}
            {recentDefs.slice(0, 5).map((entry: any, i) => (
              <div key={i} className={STAT_ROW}>
                <span className={STAT_KEY} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.tableName}
                </span>
                <span className={STAT_VAL} style={{ fontSize: 11, color: '#6060a0' }}>
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

        {isSuperAdmin && (
          <InfoCard title="Full Audit Log">
            {loadingAudit && <div style={{ color: '#3a3a6a', fontSize: 12 }}>Loading…</div>}
            {!loadingAudit && auditLog.length === 0 && (
              <div style={{ color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>No recent actions</div>
            )}
            {auditLog.map((entry: any, i) => (
              <div key={i} className={STAT_ROW}>
                <span className={STAT_KEY}>{entry.action}</span>
                <span className={STAT_VAL} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {entry.tableName} · {entry.admin?.username ?? '?'}
                </span>
              </div>
            ))}
          </InfoCard>
        )}

        {perms.system_tools && (
          <div className={CARD} style={{ cursor: 'pointer' }} onClick={() => onNavigate('economy')}>
            <div className={CARD_TITLE}>Balance Simulator</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Monte-Carlo simulation of entity power score progression.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open simulator →</div>
          </div>
        )}

        {(perms.read || perms.write) && (
          <div className={CARD} style={{ cursor: 'pointer' }} onClick={() => onNavigate('content')}>
            <div className={CARD_TITLE}>Content Editor</div>
            <div style={{ fontSize: 13, color: '#8080a8', lineHeight: 1.5 }}>
              Definitions, missions, entities, locations, rewards, store, and more.
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#6c63ff' }}>Open editor →</div>
          </div>
        )}

        <InfoCard title="Your Permissions">
          {Object.entries(perms).map(([key, val]) => (
            <div key={key} className={STAT_ROW}>
              <span className={STAT_KEY}>{key.replace(/_/g, ' ')}</span>
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
