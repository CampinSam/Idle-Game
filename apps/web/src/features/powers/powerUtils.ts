export function getUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getSecondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function powerLabel(powerType: string): string {
  switch (powerType) {
    case 'tick_boost':
    case 'tick_speed_boost': return '⚡ Global Tick Boost';
    case 'keeper_xp_boost': return '⬆ Boost Keeper XP';
    case 'entity_xp_boost': return '⬆ Boost Entity XP';
    case 'mission_power_boost': return '⚔ Boost Mission Power';
    case 'mission_duration_reduction': return '⏩ Speed Missions';
    case 'crafting_duration_reduction': return '⏩ Speed Crafting';
    case 'building_build_duration_reduction': return '⏩ Speed Building';
    case 'building_upgrade_duration_reduction': return '⏩ Speed Upgrades';
    case 'injury_recovery_boost': return '💚 Boost Recovery';
    default: return powerType.replace(/_/g, ' ');
  }
}
