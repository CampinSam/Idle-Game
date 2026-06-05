import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAppSelector, useAppDispatch } from '../store';
import { applyPatches } from '../store/syncSlice';
import { useSyncNotifications } from '../hooks/useSyncSelectors';
import { audioEngine } from '../services/AudioEngine';
import { serverNow } from '../services/clockSync';

export interface LocalToast {
  id: string;
  title: string;
  body: string;
  icon?: string;
  accentColor?: string;
  durationMs?: number;
}

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
  localToasts: LocalToast[];
  loading: boolean;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  dismissNotification: (id: string) => void;
  dismissToast: (toastId: string) => void;
  hideToast: (toastId: string) => void;
  addLocalToast: (toast: Omit<LocalToast, 'id'>) => void;
  dismissLocalToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  toasts: [],
  localToasts: [],
  loading: false,
  markRead: async () => {},
  markAllRead: async () => {},
  clearRead: async () => {},
  dismissNotification: () => {},
  dismissToast: () => {},
  hideToast: () => {},
  addLocalToast: () => {},
  dismissLocalToast: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const MAX_VISIBLE_TOASTS = 2;
const TOAST_DURATION = 5000;
const CRITICAL_TOAST_DURATION = 15000;
const SEEN_IDS_CAP = 200;

function seenStorageKey(userId: string) {
  return `notif_seen_${userId}`;
}

function loadSeenIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenStorageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(userId: string, ids: Set<string>) {
  try {
    let arr = Array.from(ids);
    if (arr.length > SEEN_IDS_CAP) arr = arr.slice(arr.length - SEEN_IDS_CAP);
    localStorage.setItem(seenStorageKey(userId), JSON.stringify(arr));
  } catch {
    // localStorage unavailable — fail silently
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.player?.id as string | undefined);
  const syncNotifs = useSyncNotifications();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [localToasts, setLocalToasts] = useState<LocalToast[]>([]);
  const localToastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const seenIds = useRef<Set<string>>(new Set());
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Tracks the last known userId so the logout effect can still reference it
  // even after player is cleared from the store simultaneously with the token.
  const lastUserIdRef = useRef<string | undefined>(undefined);

  // Load persisted seen IDs from localStorage when userId becomes available
  useEffect(() => {
    if (!userId) return;
    lastUserIdRef.current = userId;
    seenIds.current = loadSeenIds(userId);
  }, [userId]);

  // Clear seen IDs and remove localStorage entry on logout.
  // Use lastUserIdRef because token and player are nulled in the same dispatch,
  // so userId is already undefined when this effect runs.
  const prevTokenRef = useRef<string | null | undefined>(token);
  useEffect(() => {
    const wasLoggedIn = !!prevTokenRef.current;
    prevTokenRef.current = token;
    if (wasLoggedIn && !token) {
      const uid = lastUserIdRef.current;
      if (uid) {
        try { localStorage.removeItem(seenStorageKey(uid)); } catch { /* ignore */ }
      }
      seenIds.current = new Set();
    }
  }, [token]);

  const notifications: AppNotification[] = (syncNotifs as any[])
    .filter((n) => !n.dismissedAt)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!token || !userId) return;
    let dirty = false;
    for (const n of notifications) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      dirty = true;
      if (n.readAt || n.dismissedAt) continue;
      audioEngine.play('ui.notification');
      const age = serverNow() - new Date(n.createdAt).getTime();
      if (n.priority === 'critical' || n.priority === 'high' || (n.priority === 'normal' && age < 15000)) {
        setToasts((prev) => {
          const combined = [...prev, { notification: n, id: n.id }];
          return combined.slice(0, MAX_VISIBLE_TOASTS + 5);
        });
      }
    }
    if (dirty) persistSeenIds(userId, seenIds.current);
  }, [notifications, token, userId]);

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

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    const timer = toastTimers.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(toastId);
    }
    markRead([toastId]).catch(() => {});
  }, [markRead]);

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

  const addLocalToast = useCallback((toast: Omit<LocalToast, 'id'>) => {
    const id = `lt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const full: LocalToast = { ...toast, id };
    setLocalToasts((prev) => [...prev, full].slice(-5));
    const duration = toast.durationMs ?? 8000;
    const timer = setTimeout(() => {
      setLocalToasts((prev) => prev.filter((t) => t.id !== id));
      localToastTimers.current.delete(id);
    }, duration);
    localToastTimers.current.set(id, timer);
  }, []);

  const dismissLocalToast = useCallback((id: string) => {
    setLocalToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = localToastTimers.current.get(id);
    if (timer) { clearTimeout(timer); localToastTimers.current.delete(id); }
  }, []);

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
        localToasts,
        loading: false,
        markRead,
        markAllRead,
        clearRead,
        dismissNotification,
        dismissToast,
        hideToast,
        addLocalToast,
        dismissLocalToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
