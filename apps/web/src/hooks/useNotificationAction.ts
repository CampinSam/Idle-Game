import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import { useModal } from '../context/ModalContext';
import { useCollectJob } from './useCollectJob';
import { useCommand } from './useCommand';
import { api } from '../services/api';

export const NOTIFICATION_READY_TYPES = ['job_ready', 'mission_ready'];
export const NOTIFICATION_COMPLETE_TYPES = ['mission_complete', 'craft_complete', 'building_complete'];

export function resolveNotificationJobId(n: AppNotification): string | undefined {
  return n.deepLink?.jobId || n.deepLink?.missionRunId || n.deepLink?.craftJobId;
}

/**
 * Shared notification action handler used by both the notification drawer
 * (NotificationCenter) and the toast overlay (ToastBanner).
 *
 * Pass `onAfterAction` to inject the close/hide behaviour:
 * - NotificationCenter: `onClose`
 * - ToastBanner: `onHide`
 *
 * All tap/action routing is identical in both surfaces so behaviour never
 * diverges between the drawer and the overlay.
 */
export function useNotificationAction(opts?: { onAfterAction?: () => void }) {
  const navigate = useNavigate();
  const { markRead, dismissNotification } = useNotifications();
  const { pushModal } = useModal();
  const { collectJob } = useCollectJob();
  const afterAction = opts?.onAfterAction;

  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const openModalSpec = useCallback(
    async (params: {
      jobId?: string;
      notificationId?: string;
      giftId?: string;
      locationId?: string;
      levelUp?: boolean;
    }) => {
      try {
        const spec = await api.getModalSpec(params);
        if (spec?.version === 1) pushModal(spec);
      } catch (err) {
        console.error('[useNotificationAction] Failed to fetch modal spec:', err);
      }
    },
    [pushModal],
  );

  const handleTap = useCallback(
    async (n: AppNotification) => {
      if (n.type === 'gift' && n.meta?.giftId) {
        dismissNotification(n.id);
        afterAction?.();
        await openModalSpec({ giftId: n.meta.giftId });
        return;
      }

      if (n.type === 'location_level_up' && n.meta?.locationId) {
        afterAction?.();
        await openModalSpec({ locationId: n.meta.locationId, levelUp: true, notificationId: n.id });
        return;
      }

      if (!n.readAt) markRead([n.id]).catch(() => {});

      const jobId = resolveNotificationJobId(n);
      if (jobId) {
        afterAction?.();
        await openModalSpec({ jobId });
        return;
      }

      if (n.deepLink?.screen) {
        navigate(n.deepLink.screen);
        afterAction?.();
      }
    },
    [navigate, markRead, dismissNotification, openModalSpec, afterAction],
  );

  const handleCollect = useCallback(
    async (e: React.MouseEvent | React.TouchEvent, n: AppNotification) => {
      e.stopPropagation();
      const jobId = resolveNotificationJobId(n);
      if (!jobId) return;
      afterAction?.();
      await collectJob(jobId);
    },
    [collectJob, afterAction],
  );

  const handleGiftClaim = useCallback(
    async (e: React.MouseEvent | React.TouchEvent, n: AppNotification) => {
      e.stopPropagation();
      const giftId = n.meta?.giftId;
      if (!giftId) return;
      dismissNotification(n.id);
      afterAction?.();
      await execute('ClaimGift', { giftId });
    },
    [dismissNotification, execute, afterAction],
  );

  const handleQuestClaim = useCallback(
    async (e: React.MouseEvent | React.TouchEvent, n: AppNotification) => {
      e.stopPropagation();
      const questInstanceId = n.meta?.questInstanceId;
      if (!questInstanceId) return;
      if (!n.readAt) markRead([n.id]).catch(() => {});
      afterAction?.();
      await execute('ClaimQuestReward', { questInstanceId });
    },
    [markRead, execute, afterAction],
  );

  const handleAchievementClaim = useCallback(
    async (e: React.MouseEvent | React.TouchEvent, n: AppNotification) => {
      e.stopPropagation();
      const achievementInstanceId = n.meta?.questInstanceId;
      if (!achievementInstanceId) return;
      if (!n.readAt) markRead([n.id]).catch(() => {});
      afterAction?.();
      await execute('ClaimAchievementReward', { achievementInstanceId });
    },
    [markRead, execute, afterAction],
  );

  return {
    handleTap,
    handleCollect,
    handleGiftClaim,
    handleQuestClaim,
    handleAchievementClaim,
  };
}
