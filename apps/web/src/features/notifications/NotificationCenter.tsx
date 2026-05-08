import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, AppNotification } from '../../context/NotificationContext';
import { useModal } from '../../context/ModalContext';
import { useCollectJob } from '../../hooks/useCollectJob';
import { api } from '../../services/api';
import type { ActiveBoostInfo } from '../../tick';
import { NOTIFICATION_CATEGORY_DISPLAY } from '@derp/shared';

const FILTERS = ['All', 'Missions', 'Crafting', 'Locations', 'Gifts', 'System'] as const;

function timeSection(dateStr: string): 'New' | 'Today' | 'Earlier' {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 60 * 60 * 1000) return 'New';

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= todayStart) return 'Today';

  return 'Earlier';
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationCenter({ onClose, boostInfo }: { onClose: () => void; boostInfo?: ActiveBoostInfo }) {
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead, clearRead, dismissNotification, unreadCount } = useNotifications();
  const { pushModal } = useModal();
  const { collectJob } = useCollectJob();
  const [filter, setFilter] = useState<string>('All');

  const filtered = useMemo(() => {
    if (filter === 'All') return notifications;
    const cat = filter.toLowerCase();
    return notifications.filter((n) => n.category === cat || (cat === 'gifts' && n.category === 'gift'));
  }, [notifications, filter]);

  const grouped = useMemo(() => {
    const sections: Record<string, AppNotification[]> = { New: [], Today: [], Earlier: [] };
    for (const n of filtered) {
      const section = timeSection(n.createdAt);
      sections[section].push(n);
    }
    return sections;
  }, [filtered]);

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
    if (!giftId) return;
    dismissNotification(n.id);
    onClose();
    await openModalSpec({ giftId });
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
          {boostInfo?.boostActive && (filter === 'All' || filter === 'System') && (
            <div className="nc-boost-pinned">
              <span className="nc-boost-icon">⚡</span>
              <div className="nc-item-content">
                <span className="nc-item-title nc-boost-title">{boostInfo.boostLabel}</span>
                <span className="nc-item-body nc-boost-category">System</span>
              </div>
              <span className="nc-boost-dot" />
            </div>
          )}
          {filtered.length === 0 && !boostInfo?.boostActive && (
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
                        <span className="nc-item-time">{timeAgo(n.createdAt)}</span>
                      </div>
                      {isGift && !n.readAt ? (
                        <span className="nc-collect-btn" onClick={(e) => handleGiftClaim(e, n)}>Claim</span>
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
