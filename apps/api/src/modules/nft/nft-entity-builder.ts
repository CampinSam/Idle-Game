import { PrismaService } from '../../prisma/prisma.service';
import { NftMetadata } from './nft-ownership.interface';
import { STAT_KEYS, computeScaling, computeCompositRarity, type ScalingContribution } from '@derp/math';
import { resolveRnd } from '../entity/rnd-resolver.util';

export async function buildEntityDataFromNftMetadata(
  prisma: PrismaService,
  collection: {
    id: string;
    name: string;
    chain: string;
    collectionId: string;
    entityDefinitionId: string;
    data?: Record<string, any> | null;
  },
  meta: NftMetadata,
): Promise<Record<string, any>> {
  const entityDef = await (prisma as any).entityDefinition.findUnique({
    where: { id: collection.entityDefinitionId },
  });

  if (!entityDef) {
    throw new Error(`EntityDefinition "${collection.entityDefinitionId}" not found`);
  }

  const slots: Record<string, string[]> = (entityDef.slots as any) || {};
  const traitsRaw: Record<string, any> = (entityDef.traits as any) || {};
  const traitByArchetype: Record<string, any> = {};
  for (const [archetype, td] of Object.entries(traitsRaw)) {
    traitByArchetype[archetype.toLowerCase()] = td;
  }

  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = 0;

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, string> = {};

  const normalizedAttributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta.attributes)) {
    normalizedAttributes[k.toLowerCase()] = String(v);
  }

  // Build effective attribute lookup by applying the collection's attributeMap.
  // The map translates raw NFT attribute key names (e.g. "meta_body") to slot
  // names in the body schema (e.g. "body"). Keys are matched case-insensitively.
  // Multiple raw keys may map to the same slot (e.g. "meta_leader" and
  // "meta_multiverse leader" both map to "leader").
  const effectiveAttributes: Record<string, string> = { ...normalizedAttributes };
  // attributeMap now lives on EntityDefinition (was previously on
  // NftCollectionDef.data.attributeMap). It maps raw NFT attribute keys
  // (e.g. "meta_body") to the body-schema slot names ("body").
  const rawAttributeMap = (entityDef.attributeMap as any) || {};
  if (rawAttributeMap && typeof rawAttributeMap === 'object') {
    for (const [rawKey, mappedSlot] of Object.entries(rawAttributeMap)) {
      if (typeof mappedSlot !== 'string') continue;
      const normalizedKey = rawKey.toLowerCase();
      const attrValue = normalizedAttributes[normalizedKey];
      if (attrValue !== undefined) {
        effectiveAttributes[mappedSlot.toLowerCase()] = attrValue;
      }
    }
  }

  for (const slotName of Object.keys(slots)) {
    const attrValue = effectiveAttributes[slotName.toLowerCase()];
    if (!attrValue) continue;

    const archetype = attrValue.toLowerCase();
    traits[slotName] = archetype;

    const traitDef = traitByArchetype[archetype];
    if (!traitDef) continue;

    const slotStats = (traitDef.slotStats as any)?.[slotName];
    if (slotStats && typeof slotStats === 'object') {
      // Resolve RND immediately so it never lands in baseStats as 'RND'.
      // Mirrors entity-generator.util.ts so NFT-built entities follow the
      // same stat-resolution path as randomly generated ones.
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
    // Preserve RND scaling weight — resolved at level-up time.
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
    ownerUserId: null,
    definitionId: collection.entityDefinitionId,
    speciesId: entityDef.speciesId,
    display: {
      name: meta.name,
      imageUrl: meta.imageUrl,
    },
    stats: { ...baseStats, scaling, compositRarity },
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
