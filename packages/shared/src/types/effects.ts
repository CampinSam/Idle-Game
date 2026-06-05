export enum EffectCategory {
  STAT_BOOST = 'stat_boost',
  MISSION_POWER = 'mission_power',
  SUCCESS_CHANCE = 'success_chance',
  REWARD_MULTIPLIER = 'reward_multiplier',
  XP_MULTIPLIER = 'xp_multiplier',
  KEEPER_XP_MULTIPLIER = 'keeper_xp_multiplier',
  PRODUCTION_RATE = 'production_rate',
  STORAGE_CAPACITY = 'storage_capacity',
  TIMER_SPEED = 'timer_speed',
  MISSION_TIMER_SPEED = 'mission_timer_speed',
  CRAFTING_TIMER_SPEED = 'crafting_timer_speed',
  BUILDING_BUILD_TIMER_SPEED = 'building_build_timer_speed',
  BUILDING_UPGRADE_TIMER_SPEED = 'building_upgrade_timer_speed',
  INJURY_RECOVERY_SPEED = 'injury_recovery_speed',
  TRAIT_GRANT = 'trait_grant',
  CURRENCY_MULTIPLIER = 'currency_multiplier',
  COST_DISCOUNT = 'cost_discount',
  SLOT_UNLOCK = 'slot_unlock',
  PROTECTION = 'protection',
  REVEAL = 'reveal',
  THREAT_REDUCTION = 'threat_reduction',
  CRAFT_LUCK = 'craft_luck',
  WORKER_EFFICIENCY = 'worker_efficiency',
  COOLDOWN_REDUCTION = 'cooldown_reduction',
  LEVEL_UP_BONUS = 'level_up_bonus',
}

export enum EffectValueMode {
  FLAT_ADD = 'flat_add',
  PERCENT_ADD = 'percent_add',
  MULTIPLIER = 'multiplier',
  FLAT_SET = 'flat_set',
  BPS = 'bps',
  FLAT_GRANT = 'flat_grant',
  RANDOM_RANGE = 'random_range',
}

export enum EffectDurationModel {
  INSTANT = 'instant',
  TIMED = 'timed',
  TICK_BASED = 'tick_based',
  COUNT_BASED = 'count_based',
  SESSION = 'session',
  PERMANENT = 'permanent',
  UNTIL_REMOVED = 'until_removed',
}

export enum EffectStackingRule {
  REPLACE = 'replace',
  REFRESH = 'refresh',
  STACK_ADDITIVE = 'stack_additive',
  STACK_MULTIPLICATIVE = 'stack_multiplicative',
  STACK_CAPPED = 'stack_capped',
  NO_STACK = 'no_stack',
}

export enum EffectTargetType {
  ENTITY = 'entity',
  PLAYER = 'player',
  LOCATION = 'location',
  TEAM = 'team',
  JOB = 'job',
  GLOBAL = 'global',
}

export enum EffectSourceType {
  CONSUMABLE = 'consumable',
  EQUIPMENT = 'equipment',
  TRAIT = 'trait',
  BUILDING = 'building',
  ROOM = 'room',
  MISSION_REWARD = 'mission_reward',
  SEASON_EVENT = 'season_event',
  ADMIN = 'admin',
  QUEST_REWARD = 'quest_reward',
  CHECKIN = 'checkin',
  SHOP = 'shop',
  FLAG = 'flag',
  ASCENSION = 'ascension',
}

export interface EffectStatMap {
  ATK?: number;
  DEF?: number;
  SPD?: number;
  FOC?: number;
  LCK?: number;
  VIT?: number;
  /**
   * Resolution directive. May be a single number or an array of numbers.
   * Each entry independently picks a random visible stat (ATK/DEF/SPD/FOC/
   * LCK/VIT) and awards its full value to that stat. The same stat may be
   * chosen more than once by chance. Serialize as a plain number when only
   * one entry exists (backwards compat); use an array for two or more.
   * RND is never stored on an entity or shown in any UI.
   */
  RND?: number | number[];
}

/**
 * Safe-to-override fields on an EffectDef. Structural fields (category,
 * valueMode, durationModel, stackingRule, targetType) are intentionally
 * excluded — those define the mechanical identity of the effect.
 */
export interface EffectDefOverrides {
  value?: number;
  stats?: EffectStatMap;
  durationSec?: number;
  durationTicks?: number;
  maxStacks?: number;
  maxUses?: number;
  cap?: number;
  resourceId?: string;
}

/** Which domain the effect targets. */
export type EffectScope = 'player' | 'entity' | 'location' | 'global';

/**
 * `any` = applies to all instances of that scope world-wide.
 * `self` = applies only to instances belonging to the player who triggered
 * the power (identified by triggeredByUserId on GlobalActivePower).
 */
export type EffectAgg = 'any' | 'self';

/**
 * Optional predicate map that narrows which targets within a scope are
 * affected. When filter predicates are present but targetContext is absent
 * at resolution time, the effect is treated as applicable (safe default).
 */
export interface EffectSelectionFilter {
  archetype?: string;
  rarity?: string | string[];
  traits?: string[];
  minLevel?: number;
  maxLevel?: number;
  /**
   * Scope-identity fields. Populated automatically by trigger handlers when the
   * resolved scope is player/entity/location — constrains the effect to only the
   * triggering user/entity/location rather than all targets of that scope type.
   * Evaluated by matchesSelection() in the effect resolver.
   */
  userId?: string;
  entityId?: string;
  locationId?: string;
}

/**
 * Describes exactly who a global power effect applies to. Stored as JSON on
 * GlobalActivePower. Evaluated by matchesSelection() in the effect resolver.
 */
export interface EffectSelection {
  scope: EffectScope;
  agg: EffectAgg;
  filter?: EffectSelectionFilter;
}

/**
 * Optional context bag passed to resolveForTarget so the resolver can
 * evaluate EffectSelection filter predicates against the actual target.
 * Derived at call time from live entity/player data — never persisted.
 */
export interface EffectTargetContext {
  level?: number;
  archetype?: string;
  rarity?: string;
  traits?: string[];
}

export interface EffectDefData {
  category: EffectCategory;
  valueMode: EffectValueMode;
  durationModel: EffectDurationModel;
  stackingRule: EffectStackingRule;
  targetType: EffectTargetType;
  value?: number;
  stats?: EffectStatMap;
  trait?: string;
  durationSec?: number;
  durationTicks?: number;
  maxStacks?: number;
  maxUses?: number;
  cap?: number;
  resourceId?: string;
  sessionType?: string;
  meta?: Record<string, unknown>;
}

export interface ActiveEffectData {
  id: string;
  effectDefId: string;
  targetType: EffectTargetType;
  targetId: string;
  sourceType: EffectSourceType;
  sourceId: string;
  category: EffectCategory;
  valueMode: EffectValueMode;
  value: number;
  stats?: EffectStatMap;
  trait?: string;
  currentStacks: number;
  remainingUses?: number | null;
  sessionType?: string | null;
  sessionId?: string | null;
  expiresAt?: string | null;
  expiresAtTick?: number | null;
  createdAt: string;
}

export interface ResolvedModifier {
  flatAdd: number;
  percentAdd: number;
  multiplier: number;
  statFlatAdds: EffectStatMap;
  statPercentAdds: EffectStatMap;
  statMultipliers: EffectStatMap;
  grants: Array<{ type: string; id: string; amount: number }>;
  traits: string[];
  sources: Array<{ effectDefId: string; activeEffectId: string }>;
}

export interface ConsumableEffectSpec {
  effectDefId: string;
  targetType: EffectTargetType;
  /** Optional overrides applied on top of the EffectDef at use-time. */
  effectOverrides?: EffectDefOverrides;
}

export interface ConsumableData {
  effects: ConsumableEffectSpec[];
}

export interface PassiveEffectSpec {
  category: EffectCategory;
  valueMode: EffectValueMode;
  value?: number;
  stats?: EffectStatMap;
  trait?: string;
}

export function emptyResolvedModifier(): ResolvedModifier {
  return {
    flatAdd: 0,
    percentAdd: 0,
    multiplier: 1,
    statFlatAdds: {},
    statPercentAdds: {},
    statMultipliers: {},
    grants: [],
    traits: [],
    sources: [],
  };
}

export function applyModifier(base: number, mod: ResolvedModifier): number {
  let v = base + mod.flatAdd;
  v = v * (1 + mod.percentAdd / 100);
  v = v * mod.multiplier;
  return v;
}

export function applyStatModifiers(
  stats: Record<string, number>,
  mod: ResolvedModifier,
): Record<string, number> {
  const result = { ...stats };
  const keys = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
  for (const key of keys) {
    if (result[key] === undefined) continue;
    let v = result[key] + (mod.statFlatAdds[key] ?? 0);
    v = v * (1 + (mod.statPercentAdds[key] ?? 0) / 100);
    v = v * (mod.statMultipliers[key] ?? 1);
    result[key] = Math.round(v);
  }
  return result;
}
