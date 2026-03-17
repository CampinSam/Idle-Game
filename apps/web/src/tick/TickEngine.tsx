import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../services/api';
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

  const tickBroadcast = useSelector((s: RootState) => s.sync.tickBroadcast);

  const fetchSnapshot = useCallback(async () => {
    try {
      const info = await api.getTickInfo();
      const snap: TickSnapshot = {
        currentTick: info.currentTick,
        tickRate: info.currentRate > 0 ? info.currentRate : 1,
        serverTime: info.serverTime,
        fetchedAt: Date.now(),
        activeBoosts: info.activeBoosts ?? [],
      };
      setSnapshot(snap);
      interpolatedRef.current = {
        currentTick: snap.currentTick,
        tickRate: snap.tickRate,
      };
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!tickBroadcast) return;
    setSnapshot((prev) => {
      if (!prev) return prev;
      if (tickBroadcast.receivedAt <= prev.fetchedAt) return prev;
      return {
        ...prev,
        tickRate: tickBroadcast.tickRate,
        activeBoosts: tickBroadcast.boosts,
        serverTime: new Date().toISOString(),
        fetchedAt: tickBroadcast.receivedAt,
      };
    });
    interpolatedRef.current = {
      ...interpolatedRef.current,
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

  const value = useMemo((): TickEngineState => ({
    snapshot,
    currentTick: interpolatedRef.current.currentTick,
    tickRate: interpolatedRef.current.tickRate,
    activeBoosts: snapshot?.activeBoosts ?? [],
    loading,
    refresh: fetchSnapshot,
  }), [snapshot, loading, fetchSnapshot, interpolatedRef.current.currentTick]);

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
