import { useRef, useState, useCallback } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { NOTIFICATION_CATEGORY_DISPLAY, NOTIFICATION_PRIORITY_COLORS } from '@derp/shared';
import {
  useNotificationAction,
  NOTIFICATION_READY_TYPES,
  resolveNotificationJobId,
} from '../hooks/useNotificationAction';
import type { AppNotification } from '../context/NotificationContext';

function ToastBanner({
  notification,
  onDismiss,
  onHide,
}: {
  notification: AppNotification;
  onDismiss: () => void;
  onHide: () => void;
}) {
  const { handleTap, handleCollect, handleGiftClaim } = useNotificationAction({ onAfterAction: onHide });
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
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

  const handleClick = useCallback(() => {
    if (Math.abs(touchDeltaX.current) > 30) return;
    handleTap(notification);
  }, [notification, handleTap]);

  const isGiftType = notification.type === 'gift' && !!notification.meta?.giftId;
  const isReadyType = NOTIFICATION_READY_TYPES.includes(notification.type) && !!resolveNotificationJobId(notification);

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
      ]
        .filter(Boolean)
        .join(' ')}
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
          onClick={(e) => handleGiftClaim(e, notification)}
          onTouchEnd={(e) => { e.stopPropagation(); handleGiftClaim(e, notification); }}
        >
          Claim
        </button>
      ) : isReadyType ? (
        <button
          className="toast-action-btn [background:linear-gradient(135deg,#8B5CF6,#6D28D9)] !border-0 !text-white !text-xs !font-bold !py-1.5 !px-[14px] !rounded-lg cursor-pointer shrink-0 tracking-[0.3px] shadow-[0_2px_8px_rgba(139,92,246,0.4)] transition-[transform,opacity] duration-100 disabled:!opacity-60"
          onClick={(e) => handleCollect(e, notification)}
          onTouchEnd={(e) => { e.stopPropagation(); handleCollect(e, notification); }}
        >
          Collect
        </button>
      ) : (
        <button
          className="toast-close !bg-transparent !border-0 !text-white/40 text-xl cursor-pointer !p-0 !px-1 leading-none shrink-0 transition-colors duration-150"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function LocalToastBanner({
  toast,
  onDismiss,
}: {
  toast: import('../context/NotificationContext').LocalToast;
  onDismiss: () => void;
}) {
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const borderColor = toast.accentColor ?? '#8B5CF6';

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
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

  return (
    <div
      className={[
        'pointer-events-auto flex items-center w-full py-3 px-[14px] rounded-xl border-l-4',
        'bg-gradient-to-br from-[#1e1b3a] to-[#2a1f4e]',
        'shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(139,92,246,0.2)]',
        'text-left gap-2.5 touch-pan-y [animation:toast-slide-in_0.3s_ease-out]',
        'transition-[transform,opacity] duration-200',
        dismissed ? 'pointer-events-none' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderLeftColor: borderColor, transform: `translateX(${offsetX}px)`, opacity: dismissed ? 0 : 1 }}
      role="status"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {toast.icon && <span className="text-xl shrink-0">{toast.icon}</span>}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-extrabold text-[#f0f0f0]">{toast.title}</span>
        <span className="text-xs text-white/65 whitespace-nowrap overflow-hidden text-ellipsis">{toast.body}</span>
      </div>
      <button
        className="!bg-transparent !border-0 !text-white/40 text-xl cursor-pointer !p-0 !px-1 leading-none shrink-0 transition-colors duration-150"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function ToastOverlay() {
  const { toasts, dismissToast, hideToast, localToasts, dismissLocalToast } = useNotifications();

  if (toasts.length === 0 && localToasts.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-1.5 w-full max-w-[500px] px-3 pointer-events-none">
      {localToasts.map((t) => (
        <LocalToastBanner key={t.id} toast={t} onDismiss={() => dismissLocalToast(t.id)} />
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
