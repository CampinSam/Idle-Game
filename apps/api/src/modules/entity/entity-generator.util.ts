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
  traits: Record<string, string>;
  progression: { level: number; xp: number; ascension: number; levelHistory: any[] };
  state: { status: string };
}

export async function generateEntityData(
  prisma: PrismaService,
  userId: string,
  definitionId: string,
  displayName?: string,
): Promise<GeneratedEntityData> {
  const entityDef = await (prisma as any).entityDefinition.findUnique({
    where: { id: definitionId },
  });

  if (!entityDef) {
    throw new Error(`EntityDefinition "${definitionId}" not found`);
  }

  const initRules = (entityDef.init as any) || {};
  const scratchRules = (initRules.scratch as any) || {};
  const slotFill = (scratchRules.slotFill as any) || { kind: 'singleRandomArchetype' };
  const startingLevel: number = typeof scratchRules.startingLevel === 'number' ? scratchRules.startingLevel : 1;
  const initBaseStats: Record<string, number> = (scratchRules.baseStats as any) || {};
  const progressionStatGain = (entityDef.progression as any)?.statGain;

  const resolvedName =
    displayName || entityDef.name || (entityDef.data as any)?.name || entityDef.id;
  const slots: Record<string, string[]> = (entityDef.slots as any) || {};
  const traitByArchetype: Record<string, any> = (entityDef.traits as any) || {};

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = typeof initBaseStats[k] === 'number' ? initBaseStats[k] : 0;

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, string> = {};

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
        const idx = Math.floor(Math.random() * pool.length);
        chosenList.push(pool[idx]);
        pool.splice(idx, 1);
      }
    } else {
      // singleRandomArchetype (default).
      chosenList = [allowedArchetypes[Math.floor(Math.random() * allowedArchetypes.length)]];
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
    void slotName;
    void traitDef;

    const slotStats = (traitDef.slotStats as any)?.[slotName];
    if (slotStats && typeof slotStats === 'object') {
      // Resolve RND immediately so it never lands in baseStats as 'RND'.
      // Pass RND through regardless of whether it is a number or array —
      // resolveRnd handles both forms. Filter out any other non-numeric values.
      const resolved = resolveRnd(
        Object.fromEntries(
          Object.entries(slotStats).filter(([k, v]) => k === 'RND' || typeof v === 'number'),
        ) as Record<string, number | number[]>,
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

  return {
    ownerUserId: userId,
    definitionId,
    speciesId: entityDef.speciesId,
    display: { name: resolvedName },
    stats: initialStats,
    traits,
    progression: { level: startingLevel, xp: 0, ascension: 0, levelHistory: initialHistory },
    state: { status: 'idle' },
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
