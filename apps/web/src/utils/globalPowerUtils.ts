export const POWER_TYPE_LABELS: Record<string, string> = {
  keeper_xp_boost: 'Keeper XP',
  entity_xp_boost: 'Entity XP',
  mission_power_boost: 'Mission Power',
  mission_duration_reduction: 'Mission Speed',
  crafting_duration_reduction: 'Crafting Speed',
  building_build_duration_reduction: 'Build Speed',
  building_upgrade_duration_reduction: 'Upgrade Speed',
  injury_recovery_boost: 'Injury Recovery',
  tick_speed_boost: 'World Tick Speed',
};

export const POWER_TYPE_ICONS: Record<string, string> = {
  tick_speed_boost: '⚡',
  keeper_xp_boost: '🌟',
  entity_xp_boost: '✨',
  mission_power_boost: '⚔️',
  mission_duration_reduction: '🏃',
  crafting_duration_reduction: '⚒️',
  building_build_duration_reduction: '🏗️',
  building_upgrade_duration_reduction: '⬆️',
  injury_recovery_boost: '💊',
};

export function formatPowerValue(value: number, valueMode: string): string {
  if (valueMode === 'multiplier') return `${value}×`;
  return value > 0 ? `+${value}%` : `${value}%`;
}

export function formatCountdown(endTime: string): string {
  const remaining = new Date(endTime).getTime() - Date.now();
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
