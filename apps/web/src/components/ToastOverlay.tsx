import { useRef, useState, TouchEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import { useModal } from '../context/ModalContext';
import { useCollectJob } from '../hooks/useCollectJob';
import { api } from '../services/api';
import { NOTIFICATION_CATEGORY_DISPLAY, NOTIFICATION_PRIORITY_COLORS } from '@derp/shared';
import './ToastOverlay.css';

function ToastBanner({ notification, onDismiss, onHide }: { notification: AppNotification; onDismiss: () => void; onHide: () => void }) {
  const navigate = useNavigate();
  const { markRead } = useNotifications();
  const { pushModal } = useModal();
  const { collectJob } = useCollectJob();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDeltaX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    setOffsetX(touchDeltaX.current);
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 100) {
      setDismissed(true);
      setOffsetX(touchDeltaX.current > 0 ? 400 : -400);
      setTimeout(onDismiss, 200);
    } else {
      setOffsetX(0);
    }
  };

  const openModalSpec = useCallback(async (params: { jobId?: string; notificationId?: string; giftId?: string }) => {
    try {
      const spec = await api.getModalSpec(params);
      if (spec?.version === 1) {
        pushModal(spec);
      }
    } catch (err) {
      console.error('[ToastOverlay] Failed to fetch modal spec:', err);
    }
  }, [pushModal]);

  const READY_TYPES = ['job_ready', 'mission_ready'];
  const COMPLETE_TYPES = ['mission_complete', 'craft_complete', 'building_complete'];
  const resolveJobId = notification.deepLink?.jobId || notification.deepLink?.missionRunId || notification.deepLink?.entityId;
  const isReadyType = READY_TYPES.includes(notification.type) && !!resolveJobId;
  const isCompleteType = COMPLETE_TYPES.includes(notification.type) && !!resolveJobId;
  const isGiftType = notification.type === 'gift' && !!notification.meta?.giftId;

  const handleJobView = useCallback(async () => {
    if (!resolveJobId) { onHide(); return; }
    onHide();
    await openModalSpec({ jobId: resolveJobId });
  }, [resolveJobId, onHide, openModalSpec]);

  const handleJobComplete = useCallback(async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!resolveJobId) { onHide(); return; }
    onHide();
    await collectJob(resolveJobId);
  }, [resolveJobId, onHide, collectJob]);

  const handleGiftView = useCallback(async () => {
    const giftId = notification.meta?.giftId;
    if (!giftId) { onHide(); return; }
    onHide();
    await openModalSpec({ giftId });
  }, [notification, onHide, openModalSpec]);

  const handleGiftClaim = useCallback(async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const giftId = notification.meta?.giftId;
    if (!giftId) { onHide(); return; }
    onHide();
    await openModalSpec({ giftId });
  }, [notification, onHide, openModalSpec]);

  const handleClick = useCallback(() => {
    if (Math.abs(touchDeltaX.current) > 30) return;

    if (isGiftType) {
      handleGiftView();
      return;
    }
    if (isReadyType) {
      handleJobView();
      return;
    }
    if (isCompleteType) {
      handleJobView();
      return;
    }

    markRead([notification.id]).catch(() => {});
    onDismiss();
    if (notification.deepLink?.screen) {
      navigate(notification.deepLink.screen);
    }
  }, [notification, navigate, markRead, onDismiss, isReadyType, isCompleteType, isGiftType, handleJobView, handleGiftView]);

  const icon = NOTIFICATION_CATEGORY_DISPLAY[notification.category]?.icon ?? '🔔';
  const accentColor = NOTIFICATION_PRIORITY_COLORS[notification.priority] ?? NOTIFICATION_PRIORITY_COLORS.normal;

  return (
    <div
      className={`toast-banner ${dismissed ? 'toast-dismissed' : ''}`}
      style={{
        transform: `translateX(${offsetX}px)`,
        opacity: dismissed ? 0 : 1,
        borderLeftColor: accentColor,
      }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
    >
      <span className="toast-icon">{icon}</span>
      <div className="toast-content">
        <span className="toast-title">{notification.title}</span>
        <span className="toast-body">
          {notification.body}
        </span>
      </div>
      {isGiftType ? (
        <button
          className="toast-action-btn"
          onClick={handleGiftClaim}
          onTouchEnd={(e) => { e.stopPropagation(); handleGiftClaim(e); }}
        >
          Claim
        </button>
      ) : isReadyType ? (
        <button
          className="toast-action-btn"
          onClick={handleJobComplete}
          onTouchEnd={(e) => { e.stopPropagation(); handleJobComplete(e); }}
        >
          Collect
        </button>
      ) : (
        <button
          className="toast-close"
          onClick={(e) => {
            e.stopPropagation();
            markRead([notification.id]).catch(() => {});
            onDismiss();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function ToastOverlay() {
  const { toasts, dismissToast, hideToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-overlay">
      {toasts.map((t) => (
        <ToastBanner
          key={t.id}
          notification={t.notification}
          onDismiss={() => dismissToast(t.id)}
          onHide={() => hideToast(t.id)}
        />
      ))}
    </div>
  );
}
