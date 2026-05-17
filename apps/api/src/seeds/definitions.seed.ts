import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeOutcomeFieldsForModel } from '../modules/game-rules/outcome-spec.util';
import type { GlobalPowerType, UniqueLocationEntry } from '@derp/shared';

const logger = new Logger('DefinitionsSeed');

function loadJson(filename: string) {
  try {
    const raw = readFileSync(join(__dirname, 'data', filename), 'utf-8');
    return JSON.parse(raw);
  } catch (e: any) {
    logger.error(`Failed to load seed file ${filename}: ${e.message}`);
    return null;
  }
}

// Any per-row upsert that takes longer than this gets a warning. Catches the
// "boot silently hangs on a single seed call" failure mode that swallowed the
// EntityDefinition regression after the Task #367 schema collapse.
const SLOW_UPSERT_WARN_MS = 30_000;

async function upsertOneInstrumented(
  prisma: any,
  model: string,
  data: any,
  force: boolean,
) {
  const { id, ...rest } = data;
  const start = Date.now();
  const warnTimer = setTimeout(() => {
    logger.warn(
      `Upsert for ${model} id=${id} is taking longer than ${SLOW_UPSERT_WARN_MS}ms — boot is likely stuck on this row`,
    );
  }, SLOW_UPSERT_WARN_MS);
  try {
    await prisma[model].upsert({
      where: { id },
      update: force ? rest : {},
      create: data,
    });
  } catch (err: any) {
    logger.error(
      `Failed to upsert ${model} id=${id} after ${Date.now() - start}ms: ${err?.message ?? err}`,
    );
    throw err;
  } finally {
    clearTimeout(warnTimer);
  }
}

async function upsertMany(prisma: any, model: string, rows: any[], transform?: (r: any) => any) {
  const countBefore = await prisma[model].count();
  for (const row of rows) {
    const data = transform ? transform(row) : row;
    normalizeOutcomeFieldsForModel(model, data);
    await upsertOneInstrumented(prisma, model, data, false);
  }
  const countAfter = await prisma[model].count();
  const seeded = countAfter - countBefore;
  if (seeded > 0) {
    logger.log(`Seeded ${seeded} ${model} records`);
  }
}

async function upsertManyForce(prisma: any, model: string, rows: any[], transform?: (r: any) => any) {
  const countBefore = await prisma[model].count();
  for (const row of rows) {
    const data = transform ? transform(row) : row;
    normalizeOutcomeFieldsForModel(model, data);
    await upsertOneInstrumented(prisma, model, data, true);
  }
  const countAfter = await prisma[model].count();
  const seeded = countAfter - countBefore;
  if (seeded > 0) {
    logger.log(`Seeded ${seeded} ${model} records`);
  }
}

/**
 * Validate an EntityDefinition row before it is upserted. Task #371 swapped
 * the legacy boolean/int progression columns for four structured JSON
 * sub-objects (`progression`, `ascension`, `mastery`, `init`) and explicitly
 * forbids silent fallbacks for missing rules. Any seed row missing required
 * keys must fail loudly here so a partially-migrated definition never
 * reaches Prisma.
 */
function validateEntityDefinition(row: any): void {
  const id = row?.id ?? '<unknown>';
  const fail = (msg: string): never => {
    throw new Error(`EntityDefinition seed row "${id}" invalid: ${msg}`);
  };

  if (!row || typeof row !== 'object') fail('row is not an object');
  if (typeof row.name !== 'string' || !row.name) fail('missing required `name`');
  if (typeof row.speciesId !== 'string' || !row.speciesId) fail('missing required `speciesId`');

  const p = row.progression;
  if (!p || typeof p !== 'object') fail('missing required `progression` object');
  if (typeof p.maxLevel !== 'number' || p.maxLevel < 1) fail('`progression.maxLevel` must be a positive number');
  if (!p.xpCurve || typeof p.xpCurve !== 'object') fail('missing required `progression.xpCurve`');
  if (p.xpCurve.kind !== 'geometric' && p.xpCurve.kind !== 'table') {
    fail(`\`progression.xpCurve.kind\` must be "geometric" or "table" (got ${JSON.stringify(p.xpCurve.kind)})`);
  }

  if (!row.ascension || typeof row.ascension !== 'object') fail('missing required `ascension` object');
  if (typeof row.ascension.enabled !== 'boolean') fail('`ascension.enabled` must be boolean');

  if (!row.mastery || typeof row.mastery !== 'object') fail('missing required `mastery` object');
  if (typeof row.mastery.enabled !== 'boolean') fail('`mastery.enabled` must be boolean');

  const init = row.init;
  if (!init || typeof init !== 'object') fail('missing required `init` object');
  if (!init.baseStats || typeof init.baseStats !== 'object') {
    fail('missing required `init.baseStats` map');
  }
  const scratch = init.scratch;
  if (!scratch || typeof scratch !== 'object') fail('missing required `init.scratch` object');
  if (typeof scratch.startingLevel !== 'number' || scratch.startingLevel < 1) {
    fail('`init.scratch.startingLevel` must be a positive number');
  }
  if (!scratch.slotFill || typeof scratch.slotFill !== 'object' || typeof scratch.slotFill.kind !== 'string') {
    fail('missing required `init.scratch.slotFill.kind`');
  }
  const fillKind = scratch.slotFill.kind;
  if (fillKind !== 'singleRandomArchetype' && fillKind !== 'multiRandomArchetype' && fillKind !== 'fixed') {
    fail(`\`init.scratch.slotFill.kind\` must be one of singleRandomArchetype | multiRandomArchetype | fixed (got ${JSON.stringify(fillKind)})`);
  }
  if (fillKind === 'multiRandomArchetype' && (typeof scratch.slotFill.count !== 'number' || scratch.slotFill.count < 1)) {
    fail('`init.scratch.slotFill.count` must be a positive number when kind=multiRandomArchetype');
  }
  if (fillKind === 'fixed' && (!scratch.slotFill.fixed || typeof scratch.slotFill.fixed !== 'object')) {
    fail('`init.scratch.slotFill.fixed` must be a {slot:archetype} map when kind=fixed');
  }

  // init.nft is optional in general, but if present every required sub-key
  // must be a valid value — no defaulting at runtime.
  if (init.nft !== undefined) {
    const nft = init.nft;
    if (!nft || typeof nft !== 'object') fail('`init.nft` must be an object when present');
    if (!nft.attributeMap || typeof nft.attributeMap !== 'object') {
      fail('`init.nft.attributeMap` is required when `init.nft` is present');
    }
    const policy = nft.missingSlotPolicy;
    if (policy !== 'error' && policy !== 'skip' && policy !== 'default') {
      fail(`\`init.nft.missingSlotPolicy\` must be one of error | skip | default (got ${JSON.stringify(policy)})`);
    }
    if (nft.defaults !== undefined && (typeof nft.defaults !== 'object' || nft.defaults === null)) {
      fail('`init.nft.defaults` must be an object when present');
    }
  }
}

export async function seedDefinitions(prisma: any) {
  const defs = loadJson('definitions.json');
  const itemDefs = loadJson('item-defs.json');
  const bundleDefs = loadJson('bundle-defs.json');

  if (!defs) {
    logger.error('Could not load definitions.json — skipping definition seed');
    return;
  }

  if (defs.regionDefinitions) {
    await upsertMany(prisma, 'regionDefinition', defs.regionDefinitions);
  }

  if (defs.displayDefs) {
    await upsertMany(prisma, 'displayDef', defs.displayDefs);
  }

  if (defs.currencies) {
    await upsertMany(prisma, 'currency', defs.currencies, (r) => {
      const copy = { ...r };
      if (copy.cap !== null && copy.cap !== undefined) {
        copy.cap = BigInt(copy.cap);
      }
      return copy;
    });
  }

  if (defs.entityDefinitions) {
    // Validate every row up-front so a missing progression/init block fails
    // the whole seed batch (no partial migration). Task #371: no fallbacks —
    // an invalid definition must never reach Prisma.
    for (const row of defs.entityDefinitions) {
      validateEntityDefinition(row);
    }
    // Force-update so changes to slots/equipmentSlots/traits/progression caps
    // propagate to existing rows on every boot.
    await upsertManyForce(prisma, 'entityDefinition', defs.entityDefinitions);
  }

  if (defs.missionCategoryDefs) {
    const withoutParents = defs.missionCategoryDefs.filter((d: any) => !d.parentId);
    const withParents = defs.missionCategoryDefs.filter((d: any) => d.parentId);
    await upsertMany(prisma, 'missionCategoryDef', withoutParents);
    await upsertMany(prisma, 'missionCategoryDef', withParents);
  }

  if (defs.locationDefinitions) {
    // Force-update so changes to allowed buildings (e.g. adding bld_forge to
    // derp_outpost) propagate to existing rows on every boot.
    await upsertManyForce(prisma, 'locationDefinition', defs.locationDefinitions);
  }

  if (defs.roomDefs) {
    await upsertMany(prisma, 'roomDef', defs.roomDefs);
  }

  if (defs.buildingDefs) {
    // Force-update so newly added `displayDefId` / `category` fields are
    // applied to pre-existing building defs.
    await upsertManyForce(prisma, 'buildingDef', defs.buildingDefs);
  }

  if (defs.missionDefs) {
    await upsertMany(prisma, 'missionDef', defs.missionDefs);
  }

  if (defs.recipeDefs) {
    // Force-update so the new `displayDefId` link is applied to existing recipes.
    await upsertManyForce(prisma, 'recipeDef', defs.recipeDefs);
  }

  if (itemDefs && itemDefs.length > 0) {
    await upsertMany(prisma, 'itemDefinition', itemDefs);
  }

  if (defs.giftDefs) {
    await upsertMany(prisma, 'giftDef', defs.giftDefs);
  }

  if (defs.shopItemDefs) {
    await upsertMany(prisma, 'shopItemDef', defs.shopItemDefs, (r) => {
      const copy = { ...r };
      if (copy.limitedUntil) {
        copy.limitedUntil = new Date(copy.limitedUntil);
      }
      return copy;
    });
  }

  if (defs.eventDefinitions) {
    await upsertMany(prisma, 'eventDefinition', defs.eventDefinitions);
  }

  if (defs.lootboxDefs) {
    await upsertManyForce(prisma, 'lootboxDef', defs.lootboxDefs);
  }

  if (Array.isArray(bundleDefs) && bundleDefs.length > 0) {
    await upsertManyForce(prisma, 'bundleDef', bundleDefs);
  }

  if (defs.checkInDefs) {
    await upsertManyForce(prisma, 'checkInDef', defs.checkInDefs);
  }

  if (defs.questDefs) {
    await upsertManyForce(prisma, 'questDef', defs.questDefs);
  }

  if (defs.modalDefs) {
    await upsertManyForce(prisma, 'modalDef', defs.modalDefs);
  }

  const homeBannerDefs = loadJson('home-banner-defs.json');
  if (Array.isArray(homeBannerDefs) && homeBannerDefs.length > 0) {
    await upsertManyForce(prisma, 'homeBannerDef', homeBannerDefs, (r: any) => {
      const copy = { ...r };
      if (copy.startsAt) copy.startsAt = new Date(copy.startsAt);
      if (copy.endsAt) copy.endsAt = new Date(copy.endsAt);
      return copy;
    });
  }

  if (defs.systemIconDefs) {
    await upsertMany(prisma, 'systemIconDef', defs.systemIconDefs);
  }

  const synergyRules = loadJson('synergy-rules.json');
  if (Array.isArray(synergyRules) && synergyRules.length > 0) {
    await upsertManyForce(prisma, 'synergyRule', synergyRules, (r: any) => {
      const copy = { ...r };
      if (copy.startsAt) copy.startsAt = new Date(copy.startsAt);
      if (copy.endsAt) copy.endsAt = new Date(copy.endsAt);
      return copy;
    });
  }

  await seedNftUniquePowers(prisma);

  logger.log('Definition seeding complete');
}

/**
 * The ordered list of GlobalPowerType values used for deterministic power
 * assignment. `tick_boost` is intentionally excluded — it is a legacy alias
 * remapped to `tick_speed_boost` at trigger time and should not appear in new
 * seed data.
 */
const NFT_POWER_TYPES = [
  'tick_speed_boost',
  'keeper_xp_boost',
  'entity_xp_boost',
  'mission_power_boost',
  'mission_duration_reduction',
  'crafting_duration_reduction',
  'building_build_duration_reduction',
  'building_upgrade_duration_reduction',
  'injury_recovery_boost',
] as const;

const NFT_POWER_VALUES = [5, 7, 8, 9, 10, 11, 12, 13, 15] as const;

function buildUniquesMap(assetIds: string[]): Record<string, UniqueLocationEntry> {
  const uniques: Record<string, UniqueLocationEntry> = {};
  for (let i = 0; i < assetIds.length; i++) {
    const id = assetIds[i];
    const powerType: GlobalPowerType = NFT_POWER_TYPES[i % NFT_POWER_TYPES.length];
    const value = NFT_POWER_VALUES[i % NFT_POWER_VALUES.length];
    uniques[id] = {
      powers: [{ powerType, value, durationMinutes: 60, dailyLimit: 1 }],
    };
  }
  return uniques;
}

/**
 * Merge `rules.uniques` onto entity_definitions and location_definitions using
 * the asset ID lists in nft-unique-powers.json. Runs after the main definition
 * seed so the base records already exist. Power types are assigned
 * deterministically (cycling through NFT_POWER_TYPES by index) so the output
 * is stable across boots. Existing rules keys (e.g. `level` on derp_outpost)
 * are preserved — only the `uniques` key is overwritten.
 */
async function seedNftUniquePowers(prisma: any) {
  const data = loadJson('nft-unique-powers.json');
  if (!data) {
    logger.warn('nft-unique-powers.json not found — skipping NFT unique power seed');
    return;
  }

  if (Array.isArray(data.entityDefinitions)) {
    for (const entry of data.entityDefinitions) {
      const { definitionId, assetIds } = entry;
      if (!definitionId || !Array.isArray(assetIds) || assetIds.length === 0) continue;

      const existing = await prisma.entityDefinition.findUnique({
        where: { id: definitionId },
        select: { rules: true },
      });
      if (!existing) {
        logger.warn(`entityDefinition "${definitionId}" not found — skipping NFT unique powers for it`);
        continue;
      }

      const currentRules = (existing.rules as Record<string, unknown>) || {};
      if (currentRules.uniques) {
        logger.log(`NFT unique powers: skipping entityDefinition "${definitionId}" — uniques already seeded`);
        continue;
      }
      const mergedRules = { ...currentRules, uniques: buildUniquesMap(assetIds) };

      await prisma.entityDefinition.update({
        where: { id: definitionId },
        data: { rules: mergedRules },
      });
      logger.log(`NFT unique powers: seeded ${assetIds.length} entries on entityDefinition "${definitionId}"`);
    }
  }

  if (Array.isArray(data.locationDefinitions)) {
    for (const entry of data.locationDefinitions) {
      const { definitionId, assetIds } = entry;
      if (!definitionId || !Array.isArray(assetIds) || assetIds.length === 0) continue;

      const existing = await prisma.locationDefinition.findUnique({
        where: { id: definitionId },
        select: { rules: true },
      });
      if (!existing) {
        logger.warn(`locationDefinition "${definitionId}" not found — skipping NFT unique powers for it`);
        continue;
      }

      const currentRules = (existing.rules as Record<string, unknown>) || {};
      if (currentRules.uniques) {
        logger.log(`NFT unique powers: skipping locationDefinition "${definitionId}" — uniques already seeded`);
        continue;
      }
      const mergedRules = { ...currentRules, uniques: buildUniquesMap(assetIds) };

      await prisma.locationDefinition.update({
        where: { id: definitionId },
        data: { rules: mergedRules },
      });
      logger.log(`NFT unique powers: seeded ${assetIds.length} entries on locationDefinition "${definitionId}"`);
    }
  }
}
