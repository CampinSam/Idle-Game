import type { EntityArchetype } from '../types/entity';

export const MAX_ENTITY_LEVEL = 50;
export const STARTER_REGION = 'DerpshireValley' as const;
export const STARTER_ARCANIUM = 100;
export const STARTER_KEEPER_LEVEL = 1;

export const XP_PER_LEVEL = (level: number): number => {
  return Math.floor(100 * Math.pow(1.15, level - 1));
};

export const WORKER_SLOTS_BY_LEVEL = (level: number): number => {
  if (level < 10) return 2;
  if (level < 20) return 3;
  if (level < 30) return 4;
  if (level < 40) return 5;
  if (level < 50) return 6;
  return 7;
};

export const ANTI_WHALE_CAPS = {
  maxActiveOutposts: (keeperLevel: number, bonusSlots = 0) =>
    Math.min(1 + Math.floor(keeperLevel / 20) + Math.min(bonusSlots, 3), 7),
  maxActiveMissions: (keeperLevel: number) => Math.min(Math.floor(keeperLevel / 20) + 2, 6),
  mpEffectivenessCap: 500,
  synergyStackingCap: 0.30,
  craftingLuckCap: 150,
  dailyPotionCap: (keeperLevel: number) => Math.floor(15 + (keeperLevel * 0.5)),
  threatScaling: (outpostCount: number) => outpostCount * 0.1,
};

export const outpostSlotBudget = (keeperLevel: number, bonusSlots = 0): number =>
  ANTI_WHALE_CAPS.maxActiveOutposts(keeperLevel, bonusSlots);

export const ENTITY_ARCHETYPES = [
  'Dave', 'Astro', 'Magician', 'Ninja', 'Redneck', 'Stoner', 'DJ',
  'Viking', 'Monk', 'Corpo', 'Cyborg', 'Buff', 'MadScientist', 'Deity',
] as const;

export const RARITY_TIERS = [
  'common', 'uncommon', 'scare', 'rare', 'epic', 'mythic', 'legendary', 'unique',
] as const;

export type Rarity = typeof RARITY_TIERS[number];

export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0, uncommon: 1, scare: 2, rare: 3, epic: 4, mythic: 5, legendary: 6, unique: 7,
};

export const RARITY_DISPLAY_LABEL: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', scare: 'Scare', rare: 'Rare',
  epic: 'Epic', mythic: 'Mythic', legendary: 'Legendary', unique: 'Unique',
};

export type ArchetypeRarity = Rarity;

export const ARCHETYPE_RARITY: Record<EntityArchetype, ArchetypeRarity> = {
  Dave: 'common',
  Redneck: 'common',
  Stoner: 'common',
  Buff: 'common',
  DJ: 'uncommon',
  Ninja: 'uncommon',
  Viking: 'uncommon',
  Monk: 'uncommon',
  Astro: 'rare',
  Corpo: 'rare',
  Magician: 'rare',
  Cyborg: 'epic',
  MadScientist: 'epic',
  Deity: 'legendary',
};

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common:    40,
  uncommon:  25,
  scare:     18,
  rare:      15,
  epic:       8,
  mythic:     4,
  legendary:  2,
  unique:     0,
};

export const ENTITY_TRAIT_SLOTS = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'] as const;

export function pickWeightedArchetype(): EntityArchetype {
  const entries = ENTITY_ARCHETYPES.map((a) => ({
    archetype: a,
    weight: RARITY_WEIGHTS[ARCHETYPE_RARITY[a]],
  }));
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.archetype;
  }
  return entries[entries.length - 1].archetype;
}

export const OUTPOST_REGIONS = [
  'DerpshireValley', 'ChillarcticaDrifts', 'SandcryptBadlands',
  'ChillvineJungle', 'PinnaclePerch', 'BaldosBog', 'LavaLodePeaks',
] as const;
