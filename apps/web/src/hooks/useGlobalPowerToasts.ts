import { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { syncEngine } from '../services/syncEngineSingleton';
import type { GlobalPowerChangeHandler } from '../services/SyncEngine';

const POWER_TYPE_LABELS: Record<string, string> = {
  keeper_xp_boost: 'Keeper XP',
  entity_xp_boost: 'Entity XP',
  mission_power_boost: 'Mission Power',
  mission_duration_reduction: 'Mission Speed',
  crafting_duration_reduction: 'Crafting Speed',
  building_build_duration_reduction: 'Build Speed',
  building_upgrade_duration_reduction: 'Upgrade Speed',
  injury_recovery_boost: 'Injury Recovery',
};

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
