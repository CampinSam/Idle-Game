export type GlobalPowerType =
  | 'tick_boost'
  | 'keeper_xp_boost'
  | 'entity_xp_boost'
  | 'mission_power_boost'
  | 'mission_duration_reduction'
  | 'crafting_duration_reduction'
  | 'building_build_duration_reduction'
  | 'building_upgrade_duration_reduction'
  | 'injury_recovery_boost';

export interface UniqueLocationPower {
  powerType: GlobalPowerType;
  value: number;
  durationMinutes: number;
  dailyLimit: number;
}

export interface UniqueLocationEntry {
  powers: UniqueLocationPower[];
}
