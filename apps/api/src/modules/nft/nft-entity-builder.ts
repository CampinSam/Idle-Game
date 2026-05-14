import { PrismaService } from '../../prisma/prisma.service';
import { NftMetadata } from './nft-ownership.interface';
import { STAT_KEYS, computeScaling, type ScalingContribution } from '@derp/math';

export async function buildEntityDataFromNftMetadata(
  prisma: PrismaService,
  collection: {
    id: string;
    name: string;
    chain: string;
    collectionId: string;
    entityDefinitionId: string;
  },
  meta: NftMetadata,
): Promise<Record<string, any>> {
  const entityDef = await (prisma as any).entityDefinition.findUnique({
    where: { id: collection.entityDefinitionId },
    include: { bodySchema: true },
  });

  if (!entityDef) {
    throw new Error(`EntityDefinition "${collection.entityDefinitionId}" not found`);
  }

  const slots: Record<string, string[]> = (entityDef.bodySchema?.slots as any) || {};

  const allTraitDefs = await (prisma as any).traitDefinition.findMany();
  const traitByArchetype: Record<string, any> = {};
  for (const td of allTraitDefs) {
    traitByArchetype[td.archetype.toLowerCase()] = td;
  }

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = 0;

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, string> = {};

  const normalizedAttributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta.attributes)) {
    normalizedAttributes[k.toLowerCase()] = String(v);
  }

  for (const slotName of Object.keys(slots)) {
    const attrValue = normalizedAttributes[slotName.toLowerCase()];
    if (!attrValue) continue;

    const archetype = attrValue.toLowerCase();
    traits[slotName] = archetype;

    const traitDef = traitByArchetype[archetype];
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
    ownerUserId: null,
    definitionId: collection.entityDefinitionId,
    speciesId: entityDef.speciesId,
    display: {
      name: meta.name,
      imageUrl: meta.imageUrl,
    },
    stats: { ...baseStats, scaling },
    traits,
    archetypeVector: {},
    affinities: {},
    progression: { level: 1, xp: 0, ascension: 0, levelHistory: [] },
    state: {
      status: 'idle',
      nftAttributes: meta.attributes,
      nftRawMeta: meta.rawMeta,
      ...(meta.attributesRaw !== undefined ? { nftAttributesRaw: meta.attributesRaw } : {}),
    },
  };
}
