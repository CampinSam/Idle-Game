export interface EntityStats {
  ATK: number;
  DEF: number;
  SPD: number;
  FOC: number;
  LCK: number;
  VIT: number;
}

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

export interface EntityTraits {
  head: EntityArchetype;
  ears: EntityArchetype;
  beak: EntityArchetype;
  eyes: EntityArchetype;
  body: EntityArchetype;
  back: EntityArchetype;
  tail: EntityArchetype;
}

export type EntityStatus = 'idle' | 'mission' | 'working' | 'injured';

export interface Entity {
  id: string;
  userId: string;
  nftAssetId?: string;
  name: string;
  level: number;
  xp: number;
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
const TRAIT_KEYS: (keyof EntityTraits)[] = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'];

/** Type guard for EntityStats JSON field from the database. */
export function isEntityStats(value: unknown): value is EntityStats {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return STAT_KEYS.every((key) => typeof v[key] === 'number');
}

/** Type guard for EntityTraits JSON field from the database. */
export function isEntityTraits(value: unknown): value is EntityTraits {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return TRAIT_KEYS.every((key) => typeof v[key] === 'string');
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
