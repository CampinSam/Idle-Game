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
}

export interface ConsumableData {
  effects: ConsumableEffectSpec[];
  targetType: EffectTargetType;
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
