import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';

export interface TickSnapshot {
  currentTick: number;
  tickRate: number;
  serverTime: string;
  fetchedAt: number;
}

interface TickEngineState {
  snapshot: TickSnapshot | null;
  currentTick: number;
  tickRate: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const TickEngineContext = createContext<TickEngineState>({
  snapshot: null,
  currentTick: 0,
  tickRate: 1,
  loading: true,
  refresh: async () => {},
});

const UPDATE_INTERVAL_MS = 500;

export function TickEngineProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<TickSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTrigger] = useState(0);
  const interpolatedRef = useRef({ currentTick: 0, tickRate: 1 });

  const fetchSnapshot = useCallback(async () => {
    try {
      const info = await api.getTickInfo();
      const snap: TickSnapshot = {
        currentTick: info.currentTick,
        tickRate: info.currentRate > 0 ? info.currentRate : 1,
        serverTime: info.serverTime,
        fetchedAt: Date.now(),
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
    const refreshInterval = setInterval(fetchSnapshot, 60000);
    return () => clearInterval(refreshInterval);
  }, [fetchSnapshot]);

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
