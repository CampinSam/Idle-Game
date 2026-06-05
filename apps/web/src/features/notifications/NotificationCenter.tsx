import { useState, useMemo } from 'react';
import { useNow } from '../../hooks/useNow';
import { useNavigate } from 'react-router-dom';
import { useNotifications, AppNotification } from '../../context/NotificationContext';
import { useModal } from '../../context/ModalContext';
import { useCollectJob } from '../../hooks/useCollectJob';
import { useCommand } from '../../hooks/useCommand';
import { api } from '../../services/api';

import { NOTIFICATION_CATEGORY_DISPLAY } from '@derp/shared';
import { useGlobalPowers, useAllActiveJobs } from '../../hooks/useSyncSelectors';
import type { GlobalPowerSnapshot } from '../../store/syncSlice';
import { getPowerTypeLabel, getPowerIcon, formatPowerValue, formatCountdown } from '../../utils/globalPowerUtils';
import { ActiveJobsList } from '../jobs/ActiveJobsList';


const FILTERS = ['All', 'Missions', 'Crafting', 'Locations', 'Gifts', 'System'] as const;

function timeSection(dateStr: string, nowMs: number): 'New' | 'Today' | 'Earlier' {
  const d = new Date(dateStr);
  const now = new Date(nowMs);
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 60 * 60 * 1000) return 'New';

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= todayStart) return 'Today';

  return 'Earlier';
}

function timeAgo(dateStr: string, nowMs: number): string {
  const diffMs = nowMs - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function GlobalPowerRow({ power }: { power: GlobalPowerSnapshot }) {
  const now = useNow(1000);
  const icon = getPowerIcon(power);
  const typeLabel = getPowerTypeLabel(power);
  const valueLabel = formatPowerValue(power.value, power.valueMode);
  const countdown = formatCountdown(power.endTime, now);

  return (
    <div className="nc-boost-pinned">
      <span className="nc-boost-icon">{icon}</span>
      <div className="nc-item-content">
        <span className="nc-item-title nc-boost-title">{power.label}</span>
        <span className="nc-item-body nc-boost-category">
          {typeLabel}: {valueLabel} · {countdown}
        </span>
      </div>
      <span className="nc-boost-dot" />
    </div>
  );
}

const ACTIVE_JOBS_DRAWER_LIMIT = 3;

export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead, clearRead, dismissNotification, unreadCount } = useNotifications();
  const { pushModal } = useModal();
  const { collectJob } = useCollectJob();
  const globalPowers = useGlobalPowers();
  const allActiveJobs = useAllActiveJobs();
  const [filter, setFilter] = useState<string>('All');
  const [jobsExpanded, setJobsExpanded] = useState(true);
  const nowMs = useNow(60_000);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const filtered = useMemo(() => {
    if (filter === 'All') return notifications;
    const cat = filter.toLowerCase();
    return notifications.filter((n) => n.category === cat || (cat === 'gifts' && n.category === 'gift'));
  }, [notifications, filter]);

  const grouped = useMemo(() => {
    const sections: Record<string, AppNotification[]> = { New: [], Today: [], Earlier: [] };
    for (const n of filtered) {
      const section = timeSection(n.createdAt, nowMs);
      sections[section].push(n);
    }
    return sections;
  }, [filtered, nowMs]);

  const READY_TYPES = ['job_ready', 'mission_ready'];
  const COMPLETE_TYPES = ['mission_complete', 'craft_complete', 'building_complete'];

  const resolveJobId = (n: AppNotification) =>
    n.deepLink?.jobId || n.deepLink?.missionRunId || n.deepLink?.craftJobId || n.deepLink?.entityId;

  const openModalSpec = async (params: { jobId?: string; notificationId?: string; giftId?: string; locationId?: string; levelUp?: boolean }) => {
    try {
      const spec = await api.getModalSpec(params);
      if (spec?.version === 1) {
        pushModal(spec);
      }
    } catch (err) {
      console.error('[NotificationCenter] Failed to fetch modal spec:', err);
    }
  };

  const handleTap = async (n: AppNotification) => {
    if (n.type === 'gift' && n.meta?.giftId) {
      dismissNotification(n.id);
      onClose();
      await openModalSpec({ giftId: n.meta.giftId });
      return;
    }

    if (n.type === 'location_level_up' && n.meta?.locationId) {
      onClose();
      await openModalSpec({ locationId: n.meta.locationId, levelUp: true, notificationId: n.id });
      return;
    }

    if (!n.readAt) {
      markRead([n.id]).catch(() => {});
    }

    const jobId = resolveJobId(n);
    if (jobId && (READY_TYPES.includes(n.type) || COMPLETE_TYPES.includes(n.type))) {
      onClose();
      await openModalSpec({ jobId });
      return;
    }

    if (n.deepLink?.screen) {
      navigate(n.deepLink.screen);
      onClose();
    }
  };

  const handleCollect = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    const jobId = resolveJobId(n);
    if (!jobId) return;
    onClose();
    await collectJob(jobId);
  };

  const handleGiftClaim = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    const giftId = n.meta?.giftId;
    if (!giftId || claimingId) return;
    setClaimingId(n.id);
    try {
      dismissNotification(n.id);
      onClose();
      await execute('ClaimGift', { giftId });
    } catch (err) {
      console.error('[NotificationCenter] Gift claim failed:', err);
    } finally {
      setClaimingId(null);
    }
  };

  const handleQuestClaim = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    const questInstanceId = n.meta?.questInstanceId;
    if (!questInstanceId || claimingId) return;
    setClaimingId(n.id);
    try {
      if (!n.readAt) markRead([n.id]).catch(() => {});
      onClose();
      await execute('ClaimQuestReward', { questInstanceId });
    } catch (err) {
      console.error('[NotificationCenter] Quest claim failed:', err);
    } finally {
      setClaimingId(null);
    }
  };

  const handleAchievementClaim = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    const achievementInstanceId = n.meta?.questInstanceId;
    if (!achievementInstanceId || claimingId) return;
    setClaimingId(n.id);
    try {
      if (!n.readAt) markRead([n.id]).catch(() => {});
      onClose();
      await execute('ClaimAchievementReward', { achievementInstanceId });
    } catch (err) {
      console.error('[NotificationCenter] Achievement claim failed:', err);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="nc-overlay" onClick={onClose}>
      <div className="nc-panel" onClick={(e) => e.stopPropagation()}>
        <div className="nc-header">
          <h2 className="nc-title">Notifications</h2>
          <div className="nc-header-actions">
            {unreadCount > 0 && (
              <button className="nc-header-action" onClick={() => markAllRead()}>
                Mark all read
              </button>
            )}
            <button className="nc-header-action" onClick={() => clearRead()}>
              Clear read
            </button>
          </div>
          <button className="nc-close" onClick={onClose}>×</button>
        </div>

        <div className="nc-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`nc-filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="nc-list">
          {(filter === 'All' || filter === 'System') && globalPowers.map((p) => (
            <GlobalPowerRow key={p.id} power={p} />
          ))}

          {filter === 'All' && allActiveJobs.length > 0 && (
            <div className="nc-section">
              <div className="nc-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setJobsExpanded((v) => !v)}
                >
                  Active Jobs
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{jobsExpanded ? '▲' : '▼'}</span>
                </button>
                {allActiveJobs.length > ACTIVE_JOBS_DRAWER_LIMIT && (
                  <button
                    style={{ background: 'none', border: 'none', color: 'rgba(196,181,253,0.7)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    onClick={() => { navigate('/jobs'); onClose(); }}
                  >
                    See all →
                  </button>
                )}
              </div>
              {jobsExpanded && (
                <ActiveJobsList
                  limit={ACTIVE_JOBS_DRAWER_LIMIT}
                  compact
                  showEmpty={false}
                  onBeforeNavigate={onClose}
                />
              )}
            </div>
          )}

          {filtered.length === 0 && globalPowers.length === 0 && allActiveJobs.length === 0 && (
            <div className="nc-empty">No notifications</div>
          )}
          {(['New', 'Today', 'Earlier'] as const).map((section) => {
            const items = grouped[section];
            if (!items || items.length === 0) return null;
            return (
              <div key={section} className="nc-section">
                <div className="nc-section-title">{section}</div>
                {items.map((n) => {
                  const jobId = resolveJobId(n);
                  const isReady = READY_TYPES.includes(n.type) && !!jobId;
                  const isGift = n.type === 'gift' && !!n.meta?.giftId;
                  const isQuestComplete = n.type === 'quest_complete' && !!n.meta?.questInstanceId;
                  const isAchievementComplete = n.type === 'achievement_complete' && !!n.meta?.questInstanceId;
                  const isClaiming = claimingId === n.id;
                  const hasClaimBtn = !n.readAt && (isGift || isQuestComplete || isAchievementComplete);
                  return (
                    <button
                      key={n.id}
                      className={`nc-item ${n.readAt ? 'read' : 'unread'}`}
                      onClick={() => handleTap(n)}
                    >
                      <span className="nc-item-icon">
                        {NOTIFICATION_CATEGORY_DISPLAY[n.category]?.icon ?? '🔔'}
                      </span>
                      <div className="nc-item-content">
                        <span className="nc-item-title">{n.title}</span>
                        <span className="nc-item-body">{n.body}</span>
                        <span className="nc-item-time">{timeAgo(n.createdAt, nowMs)}</span>
                      </div>
                      {hasClaimBtn ? (
                        <span
                          className="nc-collect-btn"
                          onClick={(e) => {
                            if (isGift) handleGiftClaim(e, n);
                            else if (isQuestComplete) handleQuestClaim(e, n);
                            else handleAchievementClaim(e, n);
                          }}
                          style={{ opacity: isClaiming ? 0.5 : 1 }}
                        >
                          {isClaiming ? '…' : 'Claim'}
                        </span>
                      ) : isReady ? (
                        <span className="nc-collect-btn" onClick={(e) => handleCollect(e, n)}>Collect</span>
                      ) : !n.readAt ? (
                        <span className="nc-item-dot" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
