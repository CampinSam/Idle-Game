import { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSelector, useStore } from 'react-redux';
import type { RootState } from '../store';
import type { ActiveBoost } from '../store/syncSlice';

export type { ActiveBoost };

export interface TickSnapshot {
  currentTick: number;
  tickRate: number;
  serverTime: string;
  fetchedAt: number;
  activeBoosts: ActiveBoost[];
}

interface TickEngineState {
  snapshot: TickSnapshot | null;
  currentTick: number;
  tickRate: number;
  activeBoosts: ActiveBoost[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const TickEngineContext = createContext<TickEngineState>({
  snapshot: null,
  currentTick: 0,
  tickRate: 1,
  activeBoosts: [],
  loading: true,
  refresh: async () => {},
});

const UPDATE_INTERVAL_MS = 500;

export function TickEngineProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<TickSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTrigger] = useState(0);
  const interpolatedRef = useRef({ currentTick: 0 });

  const tickAnchor = useSelector((s: RootState) => s.sync.tickAnchor);
  const tickBroadcast = useSelector((s: RootState) => s.sync.tickBroadcast);

  useEffect(() => {
    if (!tickAnchor) return;
    const snap: TickSnapshot = {
      currentTick: tickAnchor.currentTick,
      tickRate: tickAnchor.tickRate > 0 ? tickAnchor.tickRate : 1,
      serverTime: tickAnchor.serverTime,
      fetchedAt: Date.now(),
      activeBoosts: tickAnchor.activeBoosts ?? tickBroadcast?.boosts ?? [],
    };
    setSnapshot(snap);
    interpolatedRef.current = { currentTick: snap.currentTick };
    setLoading(false);
  }, [tickAnchor]);

  useEffect(() => {
    if (!tickBroadcast) return;
    let accepted = false;
    setSnapshot((prev) => {
      if (!prev) return prev;
      if (tickBroadcast.receivedAt <= prev.fetchedAt) return prev;
      accepted = true;
      interpolatedRef.current = { currentTick: tickBroadcast.currentTick };
      return {
        ...prev,
        currentTick: tickBroadcast.currentTick,
        tickRate: tickBroadcast.tickRate,
        activeBoosts: tickBroadcast.boosts,
        serverTime: tickBroadcast.serverTime,
        fetchedAt: tickBroadcast.receivedAt,
      };
    });
    if (accepted) setTrigger((t) => t + 1);
  }, [tickBroadcast]);

  const reanchor = useCallback((snap: TickSnapshot) => {
    const now = Date.now();
    const serverTimeMs = new Date(snap.serverTime).getTime();
    if (!isFinite(serverTimeMs)) return;
    const wallElapsedSec = (now - serverTimeMs) / 1000;
    const interpolatedTick = snap.currentTick + wallElapsedSec * snap.tickRate;
    interpolatedRef.current = { currentTick: interpolatedTick };
    setTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!snapshot) return;

    const id = setInterval(() => reanchor(snapshot), UPDATE_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reanchor(snapshot);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [snapshot, reanchor]);

  const store = useStore<RootState>();
  const refresh = useCallback(async () => {
    const state = store.getState();
    const anchor = state.sync.tickAnchor;
    if (!anchor) return;
    const broadcast = state.sync.tickBroadcast;
    const snap: TickSnapshot = {
      currentTick: anchor.currentTick,
      tickRate: anchor.tickRate > 0 ? anchor.tickRate : 1,
      serverTime: anchor.serverTime,
      fetchedAt: Date.now(),
      activeBoosts: anchor.activeBoosts ?? broadcast?.boosts ?? [],
    };
    setSnapshot(snap);
    interpolatedRef.current = { currentTick: snap.currentTick };
  }, [store]);

  const value = useMemo((): TickEngineState => ({
    snapshot,
    currentTick: interpolatedRef.current.currentTick,
    tickRate: snapshot?.tickRate ?? 1,
    activeBoosts: snapshot?.activeBoosts ?? [],
    loading,
    refresh,
  }), [snapshot, loading, refresh, interpolatedRef.current.currentTick]);

  return (
    <TickEngineContext.Provider value={value}>
      {children}
    </TickEngineContext.Provider>
  );
}

export function useTickEngine(): TickEngineState {
  return useContext(TickEngineContext);
}

export function useCurrentTick(): number {
  const { currentTick } = useContext(TickEngineContext);
  return currentTick;
}

export function useTickRate(): number {
  const { tickRate } = useContext(TickEngineContext);
  return tickRate;
}
