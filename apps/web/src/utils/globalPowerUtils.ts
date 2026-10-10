import type { GlobalPowerSnapshot } from '../store/syncSlice';
import { serverNow } from '../services/clockSync';

/** Returns a human-readable label for the type of boost a power provides. */
export function getPowerTypeLabel(power: GlobalPowerSnapshot): string {
  if (power.effectDefId === null) return 'Global Tick Speed';
  if (power.effectDefName) return power.effectDefName;
  if (power.effectCategory) return power.effectCategory.replace(/_/g, ' ');
  return power.label;
}

/** Returns an emoji icon for the power based on its effect category. */
export function getPowerIcon(power: GlobalPowerSnapshot): string {
  if (power.effectDefId === null) return '⚡';
  const cat = power.effectCategory ?? '';
  const icons: Record<string, string> = {
    keeper_xp_multiplier: '🌟',
    xp_multiplier: '✨',
    mission_power: '⚔️',
    mission_timer_speed: '🏃',
    crafting_timer_speed: '⚒️',
    building_build_timer_speed: '🏗️',
    building_upgrade_timer_speed: '⬆️',
    injury_recovery_speed: '💊',
    timer_speed: '⏱️',
    reward_multiplier: '🎁',
    currency_multiplier: '💰',
    stat_boost: '📈',
    production_rate: '🏭',
    storage_capacity: '📦',
  };
  return icons[cat] ?? '🌐';
}

/** Returns true for valueMode strings that carry no percent suffix (flat_add, flat_set, flat_grant, bps). */
function isFlatMode(valueMode: string): boolean {
  return valueMode.startsWith('flat_') || valueMode === 'flat' || valueMode === 'bps';
}

export function formatPowerValue(value: number, valueMode: string): string {
  const sign = value > 0 ? '+' : '';
  if (valueMode === 'multiplier') return `${value}×`;
  if (isFlatMode(valueMode)) return `${sign}${value}`;
  return `${sign}${value}%`;
}

export function formatCountdown(endTime: string, nowMs?: number): string {
  const remaining = new Date(endTime).getTime() - (nowMs ?? serverNow());
  if (remaining <= 0) return 'Expired';
  const totalSecs = Math.ceil(remaining / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
