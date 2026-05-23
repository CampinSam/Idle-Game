import { useRef, useState, TouchEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import { useModal } from '../context/ModalContext';
import { useMissionJob } from '../context/MissionJobContext';
import { useCollectJob } from '../hooks/useCollectJob';
import { api } from '../services/api';
import { NOTIFICATION_CATEGORY_DISPLAY, NOTIFICATION_PRIORITY_COLORS } from '@derp/shared';

const MISSION_NOTIFICATION_TYPES = new Set(['mission_ready', 'mission_complete']);

function ToastBanner({ notification, onDismiss, onHide }: { notification: AppNotification; onDismiss: () => void; onHide: () => void }) {
  const navigate = useNavigate();
  const { markRead } = useNotifications();
  const { pushModal } = useModal();
  const { openMissionJob } = useMissionJob();
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

  const isMissionNotification =
    MISSION_NOTIFICATION_TYPES.has(notification.type) ||
    (notification.type === 'job_ready' && notification.category === 'mission');

  const handleJobView = useCallback(async () => {
    if (!resolveJobId) { onHide(); return; }
    onHide();
    if (isMissionNotification) {
      openMissionJob(resolveJobId);
    } else {
      await openModalSpec({ jobId: resolveJobId });
    }
  }, [resolveJobId, onHide, isMissionNotification, openMissionJob, openModalSpec]);

  const handleJobComplete = useCallback(async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!resolveJobId) { onHide(); return; }
    onHide();
    if (isMissionNotification) {
      openMissionJob(resolveJobId);
    } else {
      await collectJob(resolveJobId);
    }
  }, [resolveJobId, onHide, isMissionNotification, openMissionJob, collectJob]);

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
    if (isGiftType) { handleGiftView(); return; }
    if (isReadyType) { handleJobView(); return; }
    if (isCompleteType) { handleJobView(); return; }
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
      className={[
        'pointer-events-auto flex items-center w-full py-3 px-[14px] rounded-xl border-l-4 cursor-pointer',
        'bg-gradient-to-br from-[#1e1b3a] to-[#2a1f4e]',
        'shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(139,92,246,0.2)]',
        'text-left gap-2.5 touch-pan-y [animation:toast-slide-in_0.3s_ease-out]',
        'transition-[transform,opacity] duration-200',
        dismissed ? 'pointer-events-none' : '',
      ].filter(Boolean).join(' ')}
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
      <span className="text-xl shrink-0">{icon}</span>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-extrabold text-[#f0f0f0]">{notification.title}</span>
        <span className="text-xs text-white/65 whitespace-nowrap overflow-hidden text-ellipsis">
          {notification.body}
        </span>
      </div>
      {isGiftType ? (
        <button
          className="toast-action-btn [background:linear-gradient(135deg,#8B5CF6,#6D28D9)] !border-0 !text-white !text-xs !font-bold !py-1.5 !px-[14px] !rounded-lg cursor-pointer shrink-0 tracking-[0.3px] shadow-[0_2px_8px_rgba(139,92,246,0.4)] transition-[transform,opacity] duration-100 disabled:!opacity-60"
          onClick={handleGiftClaim}
          onTouchEnd={(e) => { e.stopPropagation(); handleGiftClaim(e); }}
        >
          Claim
        </button>
      ) : isReadyType ? (
        <button
          className="toast-action-btn [background:linear-gradient(135deg,#8B5CF6,#6D28D9)] !border-0 !text-white !text-xs !font-bold !py-1.5 !px-[14px] !rounded-lg cursor-pointer shrink-0 tracking-[0.3px] shadow-[0_2px_8px_rgba(139,92,246,0.4)] transition-[transform,opacity] duration-100 disabled:!opacity-60"
          onClick={handleJobComplete}
          onTouchEnd={(e) => { e.stopPropagation(); handleJobComplete(e); }}
        >
          Collect
        </button>
      ) : (
        <button
          className="toast-close !bg-transparent !border-0 !text-white/40 text-xl cursor-pointer !p-0 !px-1 leading-none shrink-0 transition-colors duration-150"
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

function TransientToastBanner({ toast, onDismiss }: { toast: import('../context/NotificationContext').TransientToast; onDismiss: () => void }) {
  return (
    <div
      className={[
        'pointer-events-auto flex items-center w-full py-3 px-[14px] rounded-xl border-l-4',
        'bg-gradient-to-br from-[#1e1b3a] to-[#2a1f4e]',
        'shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(139,92,246,0.2)]',
        'text-left gap-2.5 [animation:toast-slide-in_0.3s_ease-out]',
      ].join(' ')}
      style={{ borderLeftColor: toast.accentColor ?? '#8B5CF6' }}
      role="status"
    >
      {toast.icon && <span className="text-xl shrink-0">{toast.icon}</span>}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-extrabold text-[#f0f0f0]">{toast.title}</span>
        <span className="text-xs text-white/65 whitespace-nowrap overflow-hidden text-ellipsis">{toast.body}</span>
      </div>
      <button
        className="!bg-transparent !border-0 !text-white/40 text-xl cursor-pointer !p-0 !px-1 leading-none shrink-0 transition-colors duration-150"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      >
        ×
      </button>
    </div>
  );
}

export default function ToastOverlay() {
  const { toasts, dismissToast, hideToast, transientToasts, dismissTransientToast } = useNotifications();

  if (toasts.length === 0 && transientToasts.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-1.5 w-full max-w-[500px] px-3 pointer-events-none">
      {transientToasts.map((t) => (
        <TransientToastBanner
          key={t.id}
          toast={t}
          onDismiss={() => dismissTransientToast(t.id)}
        />
      ))}
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
