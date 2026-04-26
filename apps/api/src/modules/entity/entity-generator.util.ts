import { PrismaService } from '../../prisma/prisma.service';

export const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

export interface ScalingContribution {
  statScaling: Record<string, number>;
  rarityMultiplier: number;
}

export function computeScaling(contributions: ScalingContribution[]): Record<string, number> {
  const n = contributions.length;
  const scaling: Record<string, number> = {};

  if (n === 0) {
    for (const k of STAT_KEYS) scaling[k] = 1.0;
    return scaling;
  }

  for (const k of STAT_KEYS) {
    const product = contributions.reduce((acc, c) => {
      const v = c.statScaling[k];
      return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
    }, 1.0);
    scaling[k] = Math.pow(product, 1 / n);
  }

  const rarityProduct = contributions.reduce((acc, c) => {
    const v = c.rarityMultiplier;
    return acc * (typeof v === 'number' && v > 0 ? v : 1.0);
  }, 1.0);
  const rarityGeoMean = Math.pow(rarityProduct, 1 / n);

  for (const k of STAT_KEYS) {
    scaling[k] *= rarityGeoMean;
  }

  return scaling;
}

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
    include: { bodySchema: true },
  });

  if (!entityDef) {
    throw new Error(`EntityDefinition "${definitionId}" not found`);
  }

  const resolvedName = displayName || (entityDef.data as any)?.name || entityDef.id;
  const slots: Record<string, string[]> = (entityDef.bodySchema?.slots as any) || {};

  const allTraitDefs = await (prisma as any).traitDefinition.findMany();
  const traitByArchetype: Record<string, any> = {};
  for (const td of allTraitDefs) {
    traitByArchetype[td.archetype] = td;
  }

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = 0;

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
      for (const [stat, value] of Object.entries(slotStats)) {
        if (typeof value === 'number') {
          baseStats[stat] = (baseStats[stat] || 0) + value;
        }
      }
    }

    const traitData = (traitDef.data as any) || {};
    const statScaling: Record<string, number> = {};
    for (const k of STAT_KEYS) {
      statScaling[k] = typeof traitData.scaling?.[k] === 'number' ? traitData.scaling[k] : 1.0;
    }
    scalingContributions.push({
      statScaling,
      rarityMultiplier: typeof traitData.rarityMultiplier === 'number' ? traitData.rarityMultiplier : 1.0,
    });
  }

  const scaling = computeScaling(scalingContributions);

  return {
    ownerUserId: userId,
    definitionId,
    speciesId: entityDef.speciesId,
    display: { name: resolvedName },
    stats: { ...baseStats, scaling },
    traits,
    progression: { level: 1, xp: 0, ascension: 0, levelHistory: [] },
    state: { status: 'idle' },
  };
}

export interface LevelUpResult {
  stats: Record<string, any>;
  gains: Record<string, number>;
}

export function applyWeightedLevelUp(currentStats: Record<string, any>): LevelUpResult {
  const boosted = { ...currentStats };
  const scaling: Record<string, number> = (boosted.scaling as any) || {};

  const gains: Record<string, number> = {};
  for (const k of STAT_KEYS) gains[k] = 0;

  for (const k of STAT_KEYS) {
    boosted[k] = (boosted[k] || 0) + 1;
    gains[k] += 1;
  }

  const totalWeight = STAT_KEYS.reduce((sum, k) => sum + (scaling[k] || 1), 0);

  for (let i = 0; i < 14; i++) {
    let roll = Math.random() * totalWeight;
    for (const k of STAT_KEYS) {
      roll -= (scaling[k] || 1);
      if (roll <= 0) {
        boosted[k] = (boosted[k] || 0) + 1;
        gains[k] += 1;
        break;
      }
    }
  }

  boosted.scaling = scaling;
  return { stats: boosted, gains };
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
  const levelHistory: Array<{ level: number; gains: Record<string, number> }> = [];
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    const result = applyWeightedLevelUp(stats);
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
