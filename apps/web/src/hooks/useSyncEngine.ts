import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { store } from '../store';
import { SyncEngine } from '../services/SyncEngine';

export function useSyncEngine(): void {
  const token = useAppSelector((s) => s.auth.token);
  const initializing = useAppSelector((s) => s.auth.initializing);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    if (!token || initializing) {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      return;
    }

    const engine = new SyncEngine(store);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [token, initializing]);
}
