import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { syncEngine } from '../services/syncEngineSingleton';
import type { BoostChangeHandler } from '../services/SyncEngine';

export function useBoostChangeToasts() {
  const { addTransientToast } = useNotifications();
  const prevCombinedRef = useRef<number>(0);

  useEffect(() => {
    const handler: BoostChangeHandler = (data) => {
      const prev = prevCombinedRef.current;
      const next = data.combinedPercent;
      prevCombinedRef.current = next;

      if (next > prev) {
        const newBoosts = data.active.filter(
          (b) => b.percentBoost > 0,
        );
        const label = newBoosts.length > 0
          ? newBoosts.map((b) => b.name).join(', ')
          : 'Tick Boost';
        addTransientToast({
          title: '⚡ Tick Boost Active',
          body: `${label}: +${Math.round(next)}% world tick speed`,
          icon: '⚡',
          accentColor: '#F59E0B',
          durationMs: 10000,
        });
      } else if (next < prev && prev > 0) {
        if (next <= 0) {
          addTransientToast({
            title: 'Tick Boost Ended',
            body: 'World tick speed has returned to normal',
            icon: '⏰',
            accentColor: '#6B7280',
            durationMs: 6000,
          });
        } else {
          addTransientToast({
            title: 'Tick Boost Updated',
            body: `World tick speed is now +${Math.round(next)}%`,
            icon: '⚡',
            accentColor: '#F59E0B',
            durationMs: 6000,
          });
        }
      }
    };

    return syncEngine.onBoostChange(handler);
  }, [addTransientToast]);
}
