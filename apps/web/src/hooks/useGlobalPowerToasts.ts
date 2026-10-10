import { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { syncEngine } from '../services/syncEngineSingleton';
import type { GlobalPowerChangeHandler } from '../services/SyncEngine';

export function useGlobalPowerToasts() {
  const { addLocalToast } = useNotifications();

  useEffect(() => {
    const handler: GlobalPowerChangeHandler = (event, change) => {
      if (event === 'started') {
        const diffMin = Math.round(change.durationMinutes);
        const durationStr = diffMin >= 60
          ? `${Math.round(diffMin / 60)}h`
          : `${diffMin}m`;
        addLocalToast({
          title: 'Global Power Activated',
          body: `${change.label} — active for ${durationStr}`,
          icon: '⚡',
          accentColor: '#F59E0B',
          durationMs: 10000,
        });
      } else if (event === 'ended') {
        addLocalToast({
          title: 'Global Power Ended',
          body: `${change.label} has ended`,
          icon: '⏰',
          accentColor: '#6B7280',
          durationMs: 6000,
        });
      }
    };

    return syncEngine.onGlobalPowerChange(handler);
  }, [addLocalToast]);
}
