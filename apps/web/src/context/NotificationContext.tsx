import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAppSelector } from '../store';

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
  refresh: () => void;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  dismissToast: (toastId: string) => void;
  hideToast: (toastId: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  loading: false,
  refresh: () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  clearRead: async () => {},
  dismissToast: () => {},
  hideToast: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const MAX_VISIBLE_TOASTS = 2;
const TOAST_DURATION = 5000;
const CRITICAL_TOAST_DURATION = 15000;
const POLL_INTERVAL = 15000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((s) => s.auth.token);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastSeenCreatedAt = useRef<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getNotifications({ limit: 50 });
      const items: AppNotification[] = result.items || [];

      setNotifications(items);
      setUnreadCount(result.unreadCount ?? 0);

      const newToasts: ToastItem[] = [];
      for (const n of items) {
        if (seenIds.current.has(n.id)) continue;
        seenIds.current.add(n.id);

        if (lastSeenCreatedAt.current && n.createdAt <= lastSeenCreatedAt.current) continue;

        if (n.readAt || n.dismissedAt) continue;

        if (n.priority === 'critical' || n.priority === 'high') {
          newToasts.push({ notification: n, id: n.id });
        }
      }

      if (items.length > 0) {
        const newest = items[0]?.createdAt;
        if (!lastSeenCreatedAt.current || (newest && newest > lastSeenCreatedAt.current)) {
          lastSeenCreatedAt.current = newest;
        }
      }

      if (newToasts.length > 0) {
        setToasts((prev) => {
          const combined = [...prev, ...newToasts];
          return combined.slice(0, MAX_VISIBLE_TOASTS + 5);
        });
      }
    } catch {
    }
  }, [token]);

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

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [token, fetchNotifications]);

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
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: n.readAt || now } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);
  }, []);

  const clearRead = useCallback(async () => {
    await api.clearReadNotifications();
    setNotifications((prev) => prev.filter((n) => !n.readAt));
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts: toasts.slice(0, MAX_VISIBLE_TOASTS),
        loading,
        refresh: fetchNotifications,
        markRead,
        markAllRead,
        clearRead,
        dismissToast,
        hideToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
