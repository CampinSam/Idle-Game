import { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { syncEngine } from '../services/syncEngineSingleton';
import type { GlobalPowerChangeHandler } from '../services/SyncEngine';
import { POWER_TYPE_LABELS } from '../utils/globalPowerUtils';

export function useGlobalPowerToasts() {
  const { addTransientToast } = useNotifications();

  useEffect(() => {
    const handler: GlobalPowerChangeHandler = (event, change) => {
      const typeLabel = POWER_TYPE_LABELS[change.powerType] ?? change.powerType;

      if (event === 'started') {
        const diffMin = Math.round(change.durationMinutes);
        const durationStr = diffMin >= 60
          ? `${Math.round(diffMin / 60)}h`
          : `${diffMin}m`;
        addTransientToast({
          title: 'Global Power Activated',
          body: `${change.label}: ${typeLabel} boost for ${durationStr}`,
          icon: '⚡',
          accentColor: '#F59E0B',
          durationMs: 10000,
        });
      } else if (event === 'ended') {
        addTransientToast({
          title: 'Global Power Ended',
          body: `${change.label} (${typeLabel} boost) has ended`,
          icon: '⏰',
          accentColor: '#6B7280',
          durationMs: 6000,
        });
      }
    };

    return syncEngine.onGlobalPowerChange(handler);
  }, [addTransientToast]);
}
