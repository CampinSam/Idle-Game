import { PrismaService } from '../../prisma/prisma.service';
import {
  STAT_KEYS,
  computeScaling,
  computeCompositRarity,
  applyWeightedLevelUp,
  type ScalingContribution,
  type LevelUpResult,
  type StatGainConfig,
} from '@derp/math';
import { resolveRnd } from './rnd-resolver.util';
import { getProgressionRules, xpForNextLevel } from './entity-progression-rules.util';

export {
  STAT_KEYS,
  computeScaling,
  computeCompositRarity,
  applyWeightedLevelUp,
  type ScalingContribution,
  type LevelUpResult,
};

export interface GeneratedEntityData {
  ownerUserId: string;
  definitionId: string;
  speciesId: string;
  display: { name: string };
  stats: Record<string, any>;
  traits: Record<string, string | number | boolean | null>;
  progression: { level: number; xp: number; lifetimeXp: number; ascension: number; levelHistory: any[] };
  state: { status: string };
  seed: number;
}

/**
 * Deterministic PRNG — mulberry32.
 * Returns a function that yields float values in [0, 1) from a 32-bit integer seed.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

export async function generateEntityData(
  prisma: PrismaService,
  userId: string,
  definitionId: string,
  displayName?: string,
  seed?: number,
  startingLevelOverride?: number,
): Promise<GeneratedEntityData> {
  const entityDef = await (prisma as any).entityDefinition.findFirst({
    where: { OR: [{ id: definitionId }, { key: definitionId }] },
  });

  if (!entityDef) {
    throw new Error(`EntityDefinition "${definitionId}" not found`);
  }

  // No silent fallbacks: a definition that reaches generateEntityData must
  // declare a complete init.scratch block. Seed-time validation
  // (validateEntityDefinition) guarantees this for seeded definitions; admin
  // writes are validated server-side before persistence. We re-check here so
  // a hand-rolled / partially-migrated row fails loudly instead of silently
  // producing a level-1, all-zero entity.
  const initRules = entityDef.init as any;
  if (!initRules || typeof initRules !== 'object') {
    throw new Error(`EntityDefinition "${definitionId}" is missing required \`init\` object`);
  }
  const scratchRules = initRules.scratch as any;
  if (!scratchRules || typeof scratchRules !== 'object') {
    throw new Error(`EntityDefinition "${definitionId}" is missing required \`init.scratch\` object`);
  }
  const slotFill = scratchRules.slotFill as any;
  if (!slotFill || typeof slotFill.kind !== 'string') {
    throw new Error(
      `EntityDefinition "${definitionId}" is missing required \`init.scratch.slotFill.kind\``,
    );
  }
  if (typeof scratchRules.startingLevel !== 'number') {
    throw new Error(
      `EntityDefinition "${definitionId}" is missing required \`init.scratch.startingLevel\``,
    );
  }
  const startingLevel: number = startingLevelOverride ?? scratchRules.startingLevel;
  const initBaseStats = initRules.baseStats as Record<string, number>;
  if (!initBaseStats || typeof initBaseStats !== 'object') {
    throw new Error(
      `EntityDefinition "${definitionId}" is missing required \`init.baseStats\` map`,
    );
  }
  const progression = entityDef.progression as any;
  if (!progression || typeof progression !== 'object') {
    throw new Error(`EntityDefinition "${definitionId}" is missing required \`progression\` object`);
  }
  const progressionStatGain = progression.statGain;

  // Resolve or generate the seed. Using 0x7fffffff (max 32-bit signed int) keeps
  // the value within Prisma's Int column range on all platforms.
  const resolvedSeed = (typeof seed === 'number' && Number.isInteger(seed))
    ? (seed & 0x7fffffff)
    : (Math.random() * 0x7fffffff | 0);

  const rng = mulberry32(resolvedSeed);

  // Seeded picker for resolveRnd — uses the same PRNG stream as archetype selection.
  const seededPicker = (visibleStats: readonly string[]) =>
    visibleStats[Math.floor(rng() * visibleStats.length)];

  const resolvedName =
    displayName || entityDef.name || (entityDef.data as any)?.name || entityDef.id;
  const slots: Record<string, string[]> = (entityDef.slots as any) || {};
  const traitByArchetype: Record<string, any> = (entityDef.traits as any) || {};

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = typeof initBaseStats[k] === 'number' ? initBaseStats[k] : 0;

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, string | number | boolean | null> = {};

  for (const [slotName, allowedArchetypes] of Object.entries(slots)) {
    if (!Array.isArray(allowedArchetypes) || allowedArchetypes.length === 0) continue;

    // Resolve the list of archetypes that contribute to this slot. The visible
    // trait stored on `traits[slotName]` is always the first entry (slots only
    // hold a single archetype today), but `multiRandomArchetype` lets a slot
    // contribute trait stats / scaling from N distinct archetypes — used for
    // hybrid species without changing the slot shape.
    let chosenList: string[];
    if (slotFill.kind === 'fixed' && slotFill.fixed && typeof slotFill.fixed[slotName] === 'string') {
      chosenList = [slotFill.fixed[slotName]];
    } else if (slotFill.kind === 'multiRandomArchetype') {
      const requested = typeof slotFill.count === 'number' && slotFill.count > 0 ? slotFill.count : 1;
      const count = Math.min(requested, allowedArchetypes.length);
      const pool = [...allowedArchetypes];
      chosenList = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * pool.length);
        chosenList.push(pool[idx]);
        pool.splice(idx, 1);
      }
    } else {
      // singleRandomArchetype (default).
      chosenList = [allowedArchetypes[Math.floor(rng() * allowedArchetypes.length)]];
    }
    traits[slotName] = chosenList[0];

    for (const chosen of chosenList) {
      const traitDef = traitByArchetype[chosen];
      if (!traitDef) continue;
      applyTraitContribution(slotName, traitDef);
    }
    continue; // contributions already applied above
  }

  function applyTraitContribution(slotName: string, traitDef: any) {
    const slotStats = (traitDef.slotStats as any)?.[slotName];
    if (slotStats && typeof slotStats === 'object') {
      // Resolve RND immediately so it never lands in baseStats as 'RND'.
      // Pass RND through regardless of whether it is a number or array —
      // resolveRnd handles both forms. Filter out any other non-numeric values.
      const resolved = resolveRnd(
        Object.fromEntries(
          Object.entries(slotStats).filter(([k, v]) => k === 'RND' || typeof v === 'number'),
        ) as Record<string, number | number[]>,
        seededPicker,
      );
      for (const [stat, value] of Object.entries(resolved)) {
        baseStats[stat] = (baseStats[stat] || 0) + value;
      }
    }

    const traitScaling = (traitDef.scaling as any) || {};
    const statScaling: Record<string, number> = {};
    for (const k of STAT_KEYS) {
      statScaling[k] = typeof traitScaling[k] === 'number' ? traitScaling[k] : 1.0;
    }
    // Preserve RND as a valid scaling weight — it stays in statScaling and is
    // resolved at level-up time (each individual bonus point that draws RND
    // picks a random visible stat).
    if (typeof traitScaling['RND'] === 'number' && traitScaling['RND'] > 0) {
      statScaling['RND'] = traitScaling['RND'];
    }
    scalingContributions.push({
      statScaling,
      rarityMultiplier: typeof traitDef.rarityMultiplier === 'number' ? traitDef.rarityMultiplier : 1.0,
    });
  }

  const scaling = computeScaling(scalingContributions);
  const compositRarity = computeCompositRarity(scalingContributions);

  // For startingLevel > 1, run the canonical weighted level-up loop so that
  // stats and levelHistory are consistent with an entity that earned its way
  // to that level. Uses the definition's progression.statGain so the synthesis
  // matches the live XP path exactly.
  let initialStats: Record<string, any> = { ...baseStats, scaling, compositRarity };
  let initialHistory: Array<{ level: number; gains: Record<string, number> }> = [];
  if (startingLevel > 1) {
    const leveled = levelUpEntityToLevel(initialStats, startingLevel, progressionStatGain);
    initialStats = leveled.stats;
    initialHistory = leveled.levelHistory;
  }

  // Compute lifetime XP so rebuild can re-derive level from the current curve.
  // For a freshly-created entity at startingLevel, no residual XP has been earned yet,
  // so lifetimeXp = sum of thresholds for levels 1..(startingLevel-1).
  let initialLifetimeXp = 0;
  if (startingLevel > 1) {
    try {
      const progRules = getProgressionRules(entityDef, definitionId);
      for (let L = 1; L < startingLevel; L++) {
        initialLifetimeXp += xpForNextLevel(progRules, L);
      }
    } catch {
      initialLifetimeXp = 0;
    }
  }

  return {
    ownerUserId: userId,
    definitionId,
    speciesId: entityDef.speciesId,
    display: { name: resolvedName },
    stats: initialStats,
    traits,
    progression: { level: startingLevel, xp: 0, lifetimeXp: initialLifetimeXp, ascension: 0, levelHistory: initialHistory },
    state: { status: 'idle' },
    seed: resolvedSeed,
  };
}
/**
 * Bring a freshly-generated entity from level 1 up to `targetLevel` by running
 * the canonical weighted-level-up helper (level - 1) times, returning the
 * resulting stats and a synthesized levelHistory of `{ level, gains }` entries
 * (one per gained level, levels 2..targetLevel).
 *
 * Used by the gift "entity grant with level override" path so an entity
 * granted at level N has the same stat profile as one that genuinely earned
 * its way to level N. Documented as an intentional bypass of addEntityXp:
 * we are seeding a starting state, not awarding XP, so notifications and
 * the XP loop don't apply.
 */
export function levelUpEntityToLevel(
  baseStats: Record<string, any>,
  targetLevel: number,
  statGainConfig?: StatGainConfig,
): { stats: Record<string, any>; levelHistory: Array<{ level: number; gains: Record<string, number> }> } {
  let stats: Record<string, any> = { ...baseStats };
  const compositRarity = typeof stats.compositRarity === 'number' ? stats.compositRarity : 1.0;
  const levelHistory: Array<{ level: number; gains: Record<string, number> }> = [];
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    const result = applyWeightedLevelUp(stats, compositRarity, lvl - 1, undefined, statGainConfig);
    stats = result.stats;
    levelHistory.push({ level: lvl, gains: result.gains });
  }
  return { stats, levelHistory };
}

/**
 * Format a human-readable level-up body line, e.g.
 *   "Sparrow reached Level 5 — +2 ATK, +3 SPD, +1 VIT"
 *
 * Stats with a 0 gain are omitted; ordering follows STAT_KEYS.
 */
export function formatLevelUpBody(
  entityName: string,
  newLevel: number,
  gains: Record<string, number>,
): string {
  const parts = STAT_KEYS
    .filter((k) => (gains[k] || 0) > 0)
    .map((k) => `+${gains[k]} ${k}`);
  const tail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  return `${entityName} reached Level ${newLevel}${tail}`;
}
