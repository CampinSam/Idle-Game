import { PrismaService } from '../../prisma/prisma.service';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

function defaultScaling(): Record<string, number> {
  const s: Record<string, number> = {};
  for (const k of STAT_KEYS) s[k] = 1.0;
  return s;
}

export interface GeneratedEntityData {
  ownerUserId: string;
  definitionId: string;
  speciesId: string;
  display: { name: string };
  stats: Record<string, any>;
  traits: Record<string, string>;
  progression: { level: number; xp: number; ascension: number };
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

  const scaling = defaultScaling();
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

    const traitScaling = (traitDef.data as any)?.scaling;
    if (traitScaling && typeof traitScaling === 'object') {
      for (const k of STAT_KEYS) {
        if (typeof traitScaling[k] === 'number') {
          scaling[k] *= traitScaling[k];
        }
      }
    }
  }

  return {
    ownerUserId: userId,
    definitionId,
    speciesId: entityDef.speciesId,
    display: { name: resolvedName },
    stats: { ...baseStats, scaling },
    traits,
    progression: { level: 1, xp: 0, ascension: 0 },
    state: { status: 'idle' },
  };
}

export function applyWeightedLevelUp(currentStats: Record<string, any>): Record<string, any> {
  const boosted = { ...currentStats };
  const scaling: Record<string, number> = boosted.scaling || defaultScaling();

  for (const k of STAT_KEYS) {
    boosted[k] = (boosted[k] || 0) + 1;
  }

  const totalWeight = STAT_KEYS.reduce((sum, k) => sum + (scaling[k] || 1), 0);

  for (let i = 0; i < 14; i++) {
    let roll = Math.random() * totalWeight;
    for (const k of STAT_KEYS) {
      roll -= (scaling[k] || 1);
      if (roll <= 0) {
        boosted[k] = (boosted[k] || 0) + 1;
        break;
      }
    }
  }

  boosted.scaling = scaling;
  return boosted;
}
