import { useState, useEffect, useRef } from 'react';
import { serverNow } from '../services/clockSync';

type Subscriber = () => void;

interface RegistryEntry {
  timerId: ReturnType<typeof setInterval>;
  subscribers: Set<Subscriber>;
}

const registry = new Map<number, RegistryEntry>();
let visibilityBound = false;

function ensureVisibilityBound(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registry.forEach((entry) => {
        entry.subscribers.forEach((cb) => cb());
      });
    }
  });
}

function subscribe(intervalMs: number, cb: Subscriber): () => void {
  ensureVisibilityBound();
  let entry = registry.get(intervalMs);
  if (!entry) {
    const timerId = setInterval(() => {
      const e = registry.get(intervalMs);
      if (e) e.subscribers.forEach((s) => s());
    }, intervalMs);
    entry = { timerId, subscribers: new Set() };
    registry.set(intervalMs, entry);
  }
  entry.subscribers.add(cb);
  return () => {
    const e = registry.get(intervalMs);
    if (!e) return;
    e.subscribers.delete(cb);
    if (e.subscribers.size === 0) {
      clearInterval(e.timerId);
      registry.delete(intervalMs);
    }
  };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => subscribe(intervalMs, () => setNow(serverNow())), [intervalMs]);
  return now;
}

/**
 * Runs `callback` on every tick of the shared interval registry at `intervalMs`.
 * Gets visibility-wake handling for free (fires immediately when the tab becomes
 * visible again). Set `enabled` to false to pause without unmounting.
 */
export function useInterval(callback: () => void, intervalMs: number, enabled = true): void {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; });
  useEffect(() => {
    if (!enabled) return;
    return subscribe(intervalMs, () => callbackRef.current());
  }, [intervalMs, enabled]);
}
