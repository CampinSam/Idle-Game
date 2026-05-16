export interface EntityStats {
  ATK: number;
  DEF: number;
  SPD: number;
  FOC: number;
  LCK: number;
  VIT: number;
}

/**
 * The 6 visible entity stats that appear on the radar graph, contribute to
 * PowerScore, and are stored as base stats on an entity.
 */
export const VISIBLE_STATS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
export type VisibleStatKey = typeof VISIBLE_STATS[number];

/**
 * Hidden stats that act as resolution directives in definitions.
 * RND: when present in a definition (trait slotStats, effect stats, scaling
 * weights), resolves to a randomly chosen visible stat at the moment the
 * value is applied. RND may be a single number or an array of numbers —
 * each element independently picks a random visible stat and awards its
 * full value to it (the same stat can be chosen more than once by chance).
 * RND is never stored as a base entity stat, never shown in any UI, and
 * never contributes to PowerScore.
 */
export const HIDDEN_STATS = ['RND'] as const;
export type HiddenStatKey = typeof HIDDEN_STATS[number];

export type EntityArchetype =
  | 'Dave'
  | 'Astro'
  | 'Magician'
  | 'Ninja'
  | 'Redneck'
  | 'Stoner'
  | 'DJ'
  | 'Viking'
  | 'Monk'
  | 'Corpo'
  | 'Cyborg'
  | 'Buff'
  | 'MadScientist'
  | 'Deity';

/**
 * Open-ended slot → archetype map. Keys are the slot names defined on the
 * EntityDefinition (e.g. "body", "faction", "special" for Perps; "head",
 * "ears", … for Derp Birds). Values are the lowercase archetype string stored
 * after the builder resolves the NFT metadata or random generation.
 *
 * This is intentionally `Record<string, string>` rather than a fixed interface
 * so every collection can define its own slot schema without requiring shared-
 * package changes.
 */
export type EntityTraits = Record<string, string>;

export type EntityStatus = 'idle' | 'mission' | 'working' | 'injured';

export interface Entity {
  id: string;
  userId: string;
  nftAssetId?: string;
  name: string;
  level: number;
  xp: number;
  /** Server-derived from the entity's definition.progression.maxLevel. Null when the definition is not joined. */
  maxLevel?: number | null;
  ascensionTier: number;
  stats: EntityStats;
  traits: EntityTraits;
  status: EntityStatus;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntityDto {
  name: string;
}

const STAT_KEYS: (keyof EntityStats)[] = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

/** Type guard for EntityStats JSON field from the database. */
export function isEntityStats(value: unknown): value is EntityStats {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return STAT_KEYS.every((key) => typeof v[key] === 'number');
}

/**
 * Type guard for EntityTraits JSON field from the database.
 * Accepts any object whose enumerable values are all strings — the key set is
 * collection-specific and is not validated here.
 */
export function isEntityTraits(value: unknown): value is EntityTraits {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
}

/** Parses and validates EntityStats from a raw JSON field value. Throws if invalid. */
export function parseEntityStats(value: unknown): EntityStats {
  if (!isEntityStats(value)) {
    throw new Error(`Invalid EntityStats: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Parses and validates EntityTraits from a raw JSON field value. Throws if invalid. */
export function parseEntityTraits(value: unknown): EntityTraits {
  if (!isEntityTraits(value)) {
    throw new Error(`Invalid EntityTraits: ${JSON.stringify(value)}`);
  }
  return value;
}
