import type { EffectSelection } from './effects';

/**
 * Scope at which a power's resulting GlobalActivePower applies.
 */
export type PowerScope = 'global' | 'player' | 'entity' | 'location';

/**
 * Embedded JSON reference to a power inside entity/location `rules.uniques`.
 * When `powerDefId` is set, defaults come from the PowerDef row; fields present
 * here override the defaults. Inline powers (no powerDefId) carry all fields
 * directly.
 */
export interface PowerRef {
  /** References a PowerDef row. Omit for fully-inline powers. */
  powerDefId?: string;

  /** Human-readable display name shown to the player. Always required. */
  name: string;

  /**
   * Stable slug used as the usage-tracking key in EntityPowerUsage /
   * LocationPowerUsage. Always required and must be unique within the
   * entity/location definition.
   */
  key: string;

  // ─── Optional overrides (fall back to PowerDef defaults when omitted) ──────

  value?: number;
  valueMode?: string;
  durationMinutes?: number;
  dailyLimit?: number;
  scope?: PowerScope;
  selection?: EffectSelection;

  // ─── Inline-power fields (only valid when powerDefId is absent) ──────────

  /** 'tick_speed_boost' | 'effect_backed' — required for inline powers. */
  powerType?: string;
  /** Required for inline effect_backed powers. */
  effectDefId?: string | null;
  /** Optional override values merged on top of the EffectDef defaults. */
  effectOverrides?: Record<string, any>;
}

export interface UniqueLocationEntry {
  powers: PowerRef[];
}
