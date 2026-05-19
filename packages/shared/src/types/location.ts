/**
 * Legacy tick-only power type. Only tick_boost / tick_speed_boost remain
 * as first-class sentinel values; all other powers must provide effectDefId.
 */
export type GlobalPowerType = 'tick_boost' | 'tick_speed_boost';

export interface UniqueLocationPower {
  /** Legacy: only valid for tick_boost / tick_speed_boost powers. */
  powerType?: GlobalPowerType;
  /** Required for non-tick powers. Points to an EffectDef row. */
  effectDefId?: string | null;
  /** Optional override values merged on top of the EffectDef defaults. */
  effectOverrides?: Record<string, any>;
  value: number;
  durationMinutes: number;
  dailyLimit: number;
}

export interface UniqueLocationEntry {
  powers: UniqueLocationPower[];
}
