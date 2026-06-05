export interface EntityStats {
  ATK: number;
  DEF: number;
  SPD: number;
  FOC: number;
  LCK: number;
  VIT: number;
}

/**
 * All primitive types that a trait value can hold.
 * The `slotTypes` feature allows NFT attribute slots to be cast to a specific
 * type at entity-build time (string, number, boolean, or null), so trait maps
 * are no longer string-only.
 */
export type TraitPrimitive = string | number | boolean | null;

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
 * Open-ended slot → value map. Keys are the slot names defined on the
 * EntityDefinition (e.g. "body", "faction", "special" for Perps; "head",
 * "ears", … for Derp Birds). Values are the resolved primitives stored after
 * the builder resolves the NFT metadata or random generation. The `slotTypes`
 * feature allows slots to be cast to number, boolean, or null — so values are
 * `TraitPrimitive`, not just `string`.
 *
 * This is intentionally `Record<string, TraitPrimitive>` rather than a fixed
 * interface so every collection can define its own slot schema without
 * requiring shared-package changes.
 */
export type EntityTraits = Record<string, TraitPrimitive>;

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
  /** Absolute tick at which the injury expires. Present when status === 'injured'. */
  injuredUntilTick?: number | null;
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
 * Accepts any object whose enumerable values are all TraitPrimitive
 * (string, number, boolean, or null) — the key set is collection-specific
 * and is not validated here.
 */
export function isEntityTraits(value: unknown): value is EntityTraits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
}

/**
 * Validates an EntityTraits candidate and returns a human-readable error
 * message describing the first violation found, or `null` when the value is
 * valid.  Callers that need to surface errors to the user (e.g. admin API)
 * should prefer this over `isEntityTraits` so they can report exactly which
 * key is problematic.
 *
 * Allowed value types: `string | number | boolean | null`
 */
export function validateEntityTraitsShape(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return 'traits must be a plain object (e.g. { "slot": "value" })';
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      return `trait "${key}" has invalid type "${typeof v}" — allowed types are string, number, boolean, or null`;
    }
  }
  return null;
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
  const error = validateEntityTraitsShape(value);
  if (error !== null) {
    throw new Error(`Invalid EntityTraits — ${error}`);
  }
  return value as EntityTraits;
}

/**
 * Validates the `traits` JSON field on an `EntityDefinition` record.
 *
 * `EntityDefinition.traits` is a nested map:
 *   Record<archetypeName, traitDef>
 * where each `traitDef` is a plain object optionally containing:
 *   - `slotStats`        — Record<slotName, Record<statKey, number | number[]>>
 *   - `scaling`          — Record<statKey, number>
 *   - `rarityMultiplier` — number
 *
 * Returns a human-readable error string on the first violation found,
 * or `null` when the value is valid.
 */
export function validateEntityDefinitionTraitsShape(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return 'traits must be a plain object mapping archetype names to trait definitions';
  }

  for (const [archetype, traitDef] of Object.entries(value as Record<string, unknown>)) {
    if (traitDef === null || typeof traitDef !== 'object' || Array.isArray(traitDef)) {
      return `trait definition for archetype "${archetype}" must be a plain object`;
    }
    const def = traitDef as Record<string, unknown>;

    if ('rarityMultiplier' in def && def.rarityMultiplier !== undefined) {
      if (typeof def.rarityMultiplier !== 'number') {
        return `trait definition for archetype "${archetype}": rarityMultiplier must be a number`;
      }
    }

    if ('scaling' in def && def.scaling !== undefined) {
      if (def.scaling === null || typeof def.scaling !== 'object' || Array.isArray(def.scaling)) {
        return `trait definition for archetype "${archetype}": scaling must be a plain object`;
      }
      for (const [statKey, statVal] of Object.entries(def.scaling as Record<string, unknown>)) {
        if (typeof statVal !== 'number') {
          return `trait definition for archetype "${archetype}": scaling["${statKey}"] must be a number`;
        }
      }
    }

    if ('slotStats' in def && def.slotStats !== undefined) {
      if (def.slotStats === null || typeof def.slotStats !== 'object' || Array.isArray(def.slotStats)) {
        return `trait definition for archetype "${archetype}": slotStats must be a plain object`;
      }
      for (const [slotName, slotVal] of Object.entries(def.slotStats as Record<string, unknown>)) {
        if (slotVal === null || typeof slotVal !== 'object' || Array.isArray(slotVal)) {
          return `trait definition for archetype "${archetype}": slotStats["${slotName}"] must be a plain object`;
        }
        for (const [statKey, statVal] of Object.entries(slotVal as Record<string, unknown>)) {
          if (typeof statVal === 'number') continue;
          if (
            Array.isArray(statVal) &&
            (statVal as unknown[]).every((v) => typeof v === 'number')
          ) {
            continue;
          }
          return `trait definition for archetype "${archetype}": slotStats["${slotName}"]["${statKey}"] must be a number or array of numbers`;
        }
      }
    }
  }

  return null;
}
