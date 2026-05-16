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

  // Build effective attribute lookup by applying the definition's NFT attributeMap.
  // The map translates raw NFT attribute key names (e.g. "meta_body") to slot
  // names in the body schema (e.g. "body"). Keys are matched case-insensitively.
  // Multiple raw keys may map to the same slot (e.g. "meta_leader" and
  // "meta_multiverse leader" both map to "leader").
  const effectiveAttributes: Record<string, string> = { ...normalizedAttributes };
  // attributeMap lives on EntityDefinition.init.nft.attributeMap as of
  // task #371 (was a top-level column briefly after #367; before that on
  // NftCollectionDef.data).
  // No silent fallbacks: any EntityDefinition that backs an NFT collection
  // must declare a complete init.nft block. Seed-time validation
  // (validateEntityDefinition) requires init.nft when an NftCollectionDef
  // points at this definition; we re-check at build time so a missing or
  // partially-migrated row fails loudly here too.
  const initRules = entityDef.init as any;
  if (!initRules || typeof initRules !== 'object') {
    throw new Error(
      `EntityDefinition "${entityDef.id}" backs NFT collection "${collection.id}" but is missing required \`init\` object`,
    );
  }
  const nftRules = initRules.nft as any;
  if (!nftRules || typeof nftRules !== 'object') {
    throw new Error(
      `EntityDefinition "${entityDef.id}" backs NFT collection "${collection.id}" but is missing required \`init.nft\` object`,
    );
  }
  if (!nftRules.attributeMap || typeof nftRules.attributeMap !== 'object') {
    throw new Error(
      `EntityDefinition "${entityDef.id}" is missing required \`init.nft.attributeMap\``,
    );
  }
  const rawAttributeMap = nftRules.attributeMap as Record<string, string>;
  const missingSlotPolicy = nftRules.missingSlotPolicy as 'error' | 'skip' | 'default';
  if (missingSlotPolicy !== 'error' && missingSlotPolicy !== 'skip' && missingSlotPolicy !== 'default') {
    throw new Error(
      `EntityDefinition "${entityDef.id}" has invalid \`init.nft.missingSlotPolicy\`=${JSON.stringify(missingSlotPolicy)} (expected one of: error, skip, default)`,
    );
  }
  const slotDefaults = (nftRules.defaults as Record<string, string>) ?? {};
  if (typeof slotDefaults !== 'object') {
    throw new Error(`EntityDefinition "${entityDef.id}" has invalid \`init.nft.defaults\` (must be object)`);
  }
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
    let attrValue = effectiveAttributes[slotName.toLowerCase()];
    if (!attrValue) {
      if (missingSlotPolicy === 'error') {
        throw new Error(
          `NFT "${meta.name}" is missing required attribute for slot "${slotName}" ` +
            `(definition "${entityDef.id}" missingSlotPolicy=error)`,
        );
      }
      if (missingSlotPolicy === 'default' && slotDefaults[slotName]) {
        attrValue = slotDefaults[slotName];
      } else {
        continue; // 'skip'
      }
    }

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
