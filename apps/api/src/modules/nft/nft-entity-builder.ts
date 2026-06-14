import { PrismaService } from '../../prisma/prisma.service';
import { NftMetadata } from './nft-ownership.interface';
import { STAT_KEYS, computeScaling, computeCompositRarity, type ScalingContribution } from '@derp/math';
import { resolveRnd } from '../entity/rnd-resolver.util';
import type { TraitPrimitive } from '@derp/shared';

/**
 * Deterministic PRNG — mulberry32.
 * Returns a function that yields float values in [0, 1) from a 32-bit integer seed.
 * Identical implementation to entity-generator.util.ts — kept local to avoid
 * cross-module imports between parallel service files.
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
  seed?: number,
): Promise<Record<string, any>> {
  const entityDef = await (prisma as any).entityDefinition.findFirst({
    where: { OR: [{ id: collection.entityDefinitionId }, { key: collection.entityDefinitionId }] },
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

  const scalingContributions: ScalingContribution[] = [];
  const traits: Record<string, TraitPrimitive> = {};

  // When a seed is provided, use mulberry32 to produce a deterministic seededPicker
  // for RND resolution — identical pattern to entity-generator.util.ts.
  // When absent, fall back to Math.random (backward-compatible for legacy callers).
  const resolvedSeed = typeof seed === 'number' && Number.isInteger(seed)
    ? (seed & 0x7fffffff)
    : undefined;
  const rng = resolvedSeed !== undefined ? mulberry32(resolvedSeed) : null;
  const seededPicker = rng
    ? (visibleStats: readonly string[]) => visibleStats[Math.floor(rng() * visibleStats.length)]
    : undefined;

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
  const initBaseStats = initRules.baseStats as Record<string, number>;
  if (!initBaseStats || typeof initBaseStats !== 'object') {
    throw new Error(
      `EntityDefinition "${entityDef.id}" is missing required \`init.baseStats\` map`,
    );
  }
  const baseStats: Record<string, number> = {};
  for (const k of STAT_KEYS) baseStats[k] = typeof initBaseStats[k] === 'number' ? initBaseStats[k] : 0;
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
  // valueMap: per-slot value remapping. Keys are lowercased resolved archetype strings;
  // values are the replacement (string → new archetype, number/boolean → cast then stringify
  // for lookup, null → skip slot entirely). A "*" key catches anything not explicitly listed.
  const rawValueMap = (nftRules.valueMap ?? {}) as Record<string, Record<string, string | number | boolean | null>>;
  // slotTypes: per-slot type cast applied to the resolved archetype before storage.
  // The archetype string is still used for traitDef lookup; only the stored value is cast.
  // Supported: "string" (default, no-op), "number", "boolean", "null".
  const rawSlotTypes = (nftRules.slotTypes ?? {}) as Record<string, 'string' | 'number' | 'boolean' | 'null'>;

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

    // ── valueMap: remap the resolved archetype string for this slot ──────────
    const slotValueMap = rawValueMap[slotName] ?? rawValueMap[slotName.toLowerCase()];
    let resolvedArchetype = archetype;
    if (slotValueMap && typeof slotValueMap === 'object') {
      const hit = Object.prototype.hasOwnProperty.call(slotValueMap, archetype)
        ? slotValueMap[archetype]
        : Object.prototype.hasOwnProperty.call(slotValueMap, '*')
          ? slotValueMap['*']
          : undefined;
      if (hit !== undefined) {
        if (hit === null) continue; // null replacement → skip slot entirely (no trait, no stats)
        resolvedArchetype = String(hit).toLowerCase();
      }
      // no match and no '*' → fall through with original archetype (existing behaviour)
    }

    // ── slotTypes: cast the stored value; traitDef lookup always uses string ─
    const declaredType = rawSlotTypes[slotName] ?? rawSlotTypes[slotName.toLowerCase()];
    if (declaredType === 'null') {
      traits[slotName] = null; // record trait as null; skip stat processing
      continue;
    }
    let storedValue: string | number | boolean = resolvedArchetype;
    if (declaredType === 'boolean') {
      storedValue = resolvedArchetype === 'true' || resolvedArchetype === 'yes' || resolvedArchetype === '1';
    } else if (declaredType === 'number') {
      const n = Number(resolvedArchetype);
      if (!Number.isNaN(n)) {
        storedValue = n;
      } else {
        console.warn(
          `[nft-entity-builder] slotTypes: cannot cast "${resolvedArchetype}" to number ` +
            `for slot "${slotName}" on NFT "${meta.name}" — keeping as string`,
        );
      }
    }
    traits[slotName] = storedValue;

    const traitDef = traitByArchetype[resolvedArchetype];
    if (!traitDef) continue;

    const slotStats = (traitDef.slotStats as any)?.[slotName];
    if (slotStats && typeof slotStats === 'object') {
      // Resolve RND immediately so it never lands in baseStats as 'RND'.
      // Pass seededPicker (derived from entity.seed) so RND resolution is
      // deterministic — rebuilds always produce the same stats for the same
      // NFT attributes + seed pair.
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
