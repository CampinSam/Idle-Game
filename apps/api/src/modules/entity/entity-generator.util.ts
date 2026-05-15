import { PrismaService } from '../../prisma/prisma.service';
import {
  STAT_KEYS,
  computeScaling,
  computeCompositRarity,
  applyWeightedLevelUp,
  type ScalingContribution,
  type LevelUpResult,
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

  const resolvedName =
    displayName || entityDef.name || (entityDef.data as any)?.name || entityDef.id;
  const slots: Record<string, string[]> = (entityDef.slots as any) || {};
  const traitByArchetype: Record<string, any> = (entityDef.traits as any) || {};

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = 10;

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, string> = {};

  for (const [slotName, allowedArchetypes] of Object.entries(slots)) {
    if (!Array.isArray(allowedArchetypes) || allowedArchetypes.length === 0) continue;

    const chosen = allowedArchetypes[Math.floor(Math.random() * allowedArchetypes.length)];
    traits[slotName] = chosen;

    const traitDef = traitByArchetype[chosen];
    if (!traitDef) continue;

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

  return {
    ownerUserId: userId,
    definitionId,
    speciesId: entityDef.speciesId,
    display: { name: resolvedName },
    stats: { ...baseStats, scaling, compositRarity },
    traits,
    progression: { level: 1, xp: 0, ascension: 0, levelHistory: [] },
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
): { stats: Record<string, any>; levelHistory: Array<{ level: number; gains: Record<string, number> }> } {
  let stats: Record<string, any> = { ...baseStats };
  const compositRarity = typeof stats.compositRarity === 'number' ? stats.compositRarity : 1.0;
  const levelHistory: Array<{ level: number; gains: Record<string, number> }> = [];
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    const result = applyWeightedLevelUp(stats, compositRarity, lvl - 1);
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
