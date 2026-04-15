import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAppSelector, useAppDispatch } from '../store';
import { applyPatches } from '../store/syncSlice';
import { useSyncNotifications } from '../hooks/useSyncSelectors';
import { audioEngine } from '../services/AudioEngine';

export interface AppNotification {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  deepLink?: { screen: string; jobId?: string; defId?: string; entityId?: string; missionRunId?: string; craftJobId?: string; entityIds?: string[] };
  meta?: { count?: number; [key: string]: any };
  groupKey?: string;
  sourceType?: string;
  sourceId?: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

interface ToastItem {
  notification: AppNotification;
  id: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  toasts: ToastItem[];
  loading: boolean;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  dismissNotification: (id: string) => void;
  dismissToast: (toastId: string) => void;
  hideToast: (toastId: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  loading: false,
  markRead: async () => {},
  markAllRead: async () => {},
  clearRead: async () => {},
  dismissNotification: () => {},
  dismissToast: () => {},
  hideToast: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const MAX_VISIBLE_TOASTS = 2;
const TOAST_DURATION = 5000;
const CRITICAL_TOAST_DURATION = 15000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const syncNotifs = useSyncNotifications();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const notifications: AppNotification[] = (syncNotifs as any[])
    .filter((n) => !n.dismissedAt)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!token) return;
    for (const n of notifications) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      if (n.readAt || n.dismissedAt) continue;
      audioEngine.play('ui.notification');
      if (n.priority === 'critical' || n.priority === 'high') {
        setToasts((prev) => {
          const combined = [...prev, { notification: n, id: n.id }];
          return combined.slice(0, MAX_VISIBLE_TOASTS + 5);
        });
      }
    }
  }, [notifications, token]);

  const scheduleToastDismiss = useCallback((toastId: string, duration: number) => {
    if (toastTimers.current.has(toastId)) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
      toastTimers.current.delete(toastId);
    }, duration);
    toastTimers.current.set(toastId, timer);
  }, []);

  useEffect(() => {
    for (const toast of toasts) {
      const dur = toast.notification.priority === 'critical' ? CRITICAL_TOAST_DURATION : TOAST_DURATION;
      scheduleToastDismiss(toast.id, dur);
    }
  }, [toasts, scheduleToastDismiss]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    const timer = toastTimers.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(toastId);
    }
    api.dismissNotification(toastId).catch(() => {});
  }, []);

  const hideToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    const timer = toastTimers.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(toastId);
    }
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length > 0) {
      await api.markNotificationsRead(ids);
    }
    const now = new Date().toISOString();
    dispatch(applyPatches({
      patches: notifications
        .filter((n) => ids.includes(n.id))
        .map((n) => ({ op: 'upsert', entity: 'notification', id: n.id, data: { ...n, readAt: n.readAt || now } })),
    }));
  }, [dispatch, notifications]);

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    const now = new Date().toISOString();
    dispatch(applyPatches({
      patches: notifications.map((n) => ({ op: 'upsert', entity: 'notification', id: n.id, data: { ...n, readAt: n.readAt || now } })),
    }));
  }, [dispatch, notifications]);

  const clearRead = useCallback(async () => {
    await api.clearReadNotifications();
    dispatch(applyPatches({
      patches: notifications
        .filter((n) => n.readAt)
        .map((n) => ({ op: 'delete', entity: 'notification', id: n.id })),
    }));
  }, [dispatch, notifications]);

  const dismissNotification = useCallback((id: string) => {
    api.dismissNotification(id).catch(() => {});
    dispatch(applyPatches({
      patches: [{ op: 'delete', entity: 'notification', id }],
    }));
  }, [dispatch]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts: toasts.slice(0, MAX_VISIBLE_TOASTS),
        loading: false,
        markRead,
        markAllRead,
        clearRead,
        dismissNotification,
        dismissToast,
        hideToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
