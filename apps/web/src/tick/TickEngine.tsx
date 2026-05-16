import { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSelector, useStore } from 'react-redux';
import type { RootState } from '../store';
import type { ActiveBoost } from '../store/syncSlice';

export type { ActiveBoost };

export interface ActiveBoostInfo {
  boostActive: boolean;
  boostPercent: number;
  boostLabel: string;
  boostNames: string[];
}

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
  const interpolatedRef = useRef({ currentTick: 0, tickRate: 1 });

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
    interpolatedRef.current = {
      currentTick: snap.currentTick,
      tickRate: snap.tickRate,
    };
    setLoading(false);
  }, [tickAnchor]);

  useEffect(() => {
    if (!tickBroadcast) return;
    setSnapshot((prev) => {
      if (!prev) return prev;
      if (tickBroadcast.receivedAt <= prev.fetchedAt) return prev;
      return {
        ...prev,
        currentTick: tickBroadcast.currentTick,
        tickRate: tickBroadcast.tickRate,
        activeBoosts: tickBroadcast.boosts,
        serverTime: tickBroadcast.serverTime,
        fetchedAt: tickBroadcast.receivedAt,
      };
    });
    interpolatedRef.current = {
      currentTick: tickBroadcast.currentTick,
      tickRate: tickBroadcast.tickRate,
    };
  }, [tickBroadcast]);

  useEffect(() => {
    if (!snapshot) return;

    const id = setInterval(() => {
      const now = Date.now();
      const serverTimeMs = new Date(snapshot.serverTime).getTime();
      if (!isFinite(serverTimeMs)) return;

      const wallElapsedSec = (now - serverTimeMs) / 1000;
      const interpolatedTick = snapshot.currentTick + wallElapsedSec * snapshot.tickRate;

      interpolatedRef.current = {
        currentTick: interpolatedTick,
        tickRate: snapshot.tickRate,
      };
      setTrigger((t) => t + 1);
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [snapshot]);

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
    interpolatedRef.current = { currentTick: snap.currentTick, tickRate: snap.tickRate };
  }, [store]);

  const value = useMemo((): TickEngineState => ({
    snapshot,
    currentTick: interpolatedRef.current.currentTick,
    tickRate: interpolatedRef.current.tickRate,
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

export function useActiveBoosts(): ActiveBoostInfo {
  const { activeBoosts } = useContext(TickEngineContext);

  return useMemo(() => {
    const meaningful = activeBoosts.filter((b) => (b.multiplier || 1) > 1);
    const combinedMultiplier = meaningful.reduce((acc, b) => acc * b.multiplier, 1);
    const boostPercent = Math.round((combinedMultiplier - 1) * 100);
    const boostNames = meaningful.map((b) => b.name || 'Boost');

    let boostLabel = '';
    if (meaningful.length > 0) {
      boostLabel = `Global ${boostPercent}% boost active — ${boostNames.join(', ')}`;
    }

    return {
      boostActive: meaningful.length > 0 && boostPercent > 0,
      boostPercent,
      boostLabel,
      boostNames,
    };
  }, [activeBoosts]);
}
