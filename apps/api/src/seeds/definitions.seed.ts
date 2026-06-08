import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeOutcomeFieldsForModel } from '../modules/game-rules/outcome-spec.util';
import type { UniqueLocationEntry } from '@derp/shared';

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

/**
 * All table keys accepted by the `tables` filter parameter.
 * Corresponds to the top-level sections of definitions.json plus the two
 * hard-coded internal sections (powerDefs, nftUniquePowers).
 */
export const SEED_DEFINITION_TABLES = [
  'regionDefinitions',
  'displayDefs',
  'currencies',
  'entityDefinitions',
  'missionCategoryDefs',
  'locationDefinitions',
  'roomDefs',
  'buildingDefs',
  'missionDefs',
  'recipeDefs',
  'itemDefinitions',
  'giftDefs',
  'shopItemDefs',
  'eventDefinitions',
  'lootboxDefs',
  'bundleDefs',
  'checkInDefs',
  'questDefs',
  'modalDefs',
  'defaultModalDefs',
  'homeBannerDefs',
  'systemIconDefs',
  'synergyRules',
  'powerDefs',
  'nftUniquePowers',
] as const;

/**
 * Seed game-content definitions from the JSON seed files.
 *
 * @param prisma  - Prisma client instance.
 * @param tables  - Optional allowlist of table keys (from SEED_DEFINITION_TABLES).
 *                  When omitted or empty, all tables are written.
 */
export async function seedDefinitions(prisma: any, tables?: string[]) {
  const defs = loadJson('definitions.json');
  const itemDefs = loadJson('item-defs.json');
  const bundleDefs = loadJson('bundle-defs.json');

  if (!defs) {
    logger.error('Could not load definitions.json — skipping definition seed');
    return;
  }

  const allowed = tables && tables.length > 0 ? new Set(tables) : null;
  const should = (key: string) => !allowed || allowed.has(key);

  if (should('regionDefinitions') && defs.regionDefinitions) {
    await upsertMany(prisma, 'regionDefinition', defs.regionDefinitions);
  }

  if (should('displayDefs') && defs.displayDefs) {
    await upsertMany(prisma, 'displayDef', defs.displayDefs);
  }

  if (should('currencies') && defs.currencies) {
    await upsertManyForce(prisma, 'currency', defs.currencies, (r) => {
      const copy = { ...r };
      if (copy.cap !== null && copy.cap !== undefined) {
        copy.cap = BigInt(copy.cap);
      }
      if (copy.cntWithdrawalFee !== null && copy.cntWithdrawalFee !== undefined) {
        copy.cntWithdrawalFee = BigInt(copy.cntWithdrawalFee);
      }
      if (copy.cntAutoApprovalThreshold !== null && copy.cntAutoApprovalThreshold !== undefined) {
        copy.cntAutoApprovalThreshold = BigInt(copy.cntAutoApprovalThreshold);
      }
      return copy;
    });
  }

  if (should('entityDefinitions') && defs.entityDefinitions) {
    for (const row of defs.entityDefinitions) {
      validateEntityDefinition(row);
    }
    await upsertManyForce(prisma, 'entityDefinition', defs.entityDefinitions);
  }

  if (should('missionCategoryDefs') && defs.missionCategoryDefs) {
    const withoutParents = defs.missionCategoryDefs.filter((d: any) => !d.parentId);
    const withParents = defs.missionCategoryDefs.filter((d: any) => d.parentId);
    await upsertMany(prisma, 'missionCategoryDef', withoutParents);
    await upsertMany(prisma, 'missionCategoryDef', withParents);
  }

  if (should('locationDefinitions') && defs.locationDefinitions) {
    await upsertManyForce(prisma, 'locationDefinition', defs.locationDefinitions);
  }

  if (should('roomDefs') && defs.roomDefs) {
    await upsertMany(prisma, 'roomDef', defs.roomDefs);
  }

  if (should('buildingDefs') && defs.buildingDefs) {
    await upsertManyForce(prisma, 'buildingDef', defs.buildingDefs);
  }

  if (should('missionDefs') && defs.missionDefs) {
    await upsertMany(prisma, 'missionDef', defs.missionDefs);
  }

  if (should('recipeDefs') && defs.recipeDefs) {
    await upsertManyForce(prisma, 'recipeDef', defs.recipeDefs);
  }

  if (should('itemDefinitions') && itemDefs && itemDefs.length > 0) {
    await upsertMany(prisma, 'itemDefinition', itemDefs);
  }

  if (should('giftDefs') && defs.giftDefs) {
    await upsertMany(prisma, 'giftDef', defs.giftDefs);
  }

  if (should('shopItemDefs') && defs.shopItemDefs) {
    await upsertMany(prisma, 'shopItemDef', defs.shopItemDefs, (r) => {
      const copy = { ...r };
      if (copy.limitedUntil) {
        copy.limitedUntil = new Date(copy.limitedUntil);
      }
      return copy;
    });
  }

  if (should('eventDefinitions') && defs.eventDefinitions) {
    await upsertMany(prisma, 'eventDefinition', defs.eventDefinitions);
  }

  if (should('lootboxDefs') && defs.lootboxDefs) {
    await upsertManyForce(prisma, 'lootboxDef', defs.lootboxDefs);
  }

  if (should('bundleDefs') && Array.isArray(bundleDefs) && bundleDefs.length > 0) {
    await upsertManyForce(prisma, 'bundleDef', bundleDefs);
  }

  if (should('checkInDefs') && defs.checkInDefs) {
    await upsertManyForce(prisma, 'checkInDef', defs.checkInDefs);
  }

  if (should('questDefs') && defs.questDefs) {
    await upsertManyForce(prisma, 'questDef', defs.questDefs);
  }

  if (should('modalDefs') && defs.modalDefs) {
    await upsertManyForce(prisma, 'modalDef', defs.modalDefs);
  }

  if (should('defaultModalDefs') && defs.defaultModalDefs) {
    await upsertManyForce(prisma, 'defaultModalDef', defs.defaultModalDefs);
  }

  const homeBannerDefs = loadJson('home-banner-defs.json');
  if (should('homeBannerDefs') && Array.isArray(homeBannerDefs) && homeBannerDefs.length > 0) {
    await upsertManyForce(prisma, 'homeBannerDef', homeBannerDefs, (r: any) => {
      const copy = { ...r };
      if (copy.startsAt) copy.startsAt = new Date(copy.startsAt);
      if (copy.endsAt) copy.endsAt = new Date(copy.endsAt);
      return copy;
    });
  }

  if (should('systemIconDefs') && defs.systemIconDefs) {
    await upsertMany(prisma, 'systemIconDef', defs.systemIconDefs);
  }

  const synergyRules = loadJson('synergy-rules.json');
  if (should('synergyRules') && Array.isArray(synergyRules) && synergyRules.length > 0) {
    await upsertManyForce(prisma, 'synergyRule', synergyRules, (r: any) => {
      const copy = { ...r };
      if (copy.startsAt) copy.startsAt = new Date(copy.startsAt);
      if (copy.endsAt) copy.endsAt = new Date(copy.endsAt);
      return copy;
    });
  }

  if (should('powerDefs')) {
    await seedPowerDefs(prisma);
  }

  if (should('nftUniquePowers')) {
    await seedNftUniquePowers(prisma);
  }

  logger.log('Definition seeding complete');
}

const NFT_POWER_VALUES = [5, 7, 8, 9, 10, 11, 12, 13, 15] as const;

/**
 * Power defs whose value must be negative so the formula
 * `duration * (1 + percentAdd / 100)` correctly shortens (not extends) the timer.
 */
const DURATION_REDUCTION_POWER_DEFS = new Set([
  'mission_duration_reduction',
  'crafting_duration_reduction',
  'building_build_duration_reduction',
  'building_upgrade_duration_reduction',
]);

/**
 * All canonical power def blueprints. Order is stable so that the cycling
 * assignment in buildUniquesMap is deterministic across boots.
 */
const NFT_POWER_DEFS = [
  { powerDefId: 'global_tick_boost', name: 'Global Tick Boost', key: 'tick_speed_boost' },
  { powerDefId: 'keeper_xp_boost', name: 'Keeper XP Boost', key: 'keeper_xp_boost' },
  { powerDefId: 'entity_xp_boost', name: 'Entity XP Boost', key: 'entity_xp_boost' },
  { powerDefId: 'mission_power_boost', name: 'Mission Power Boost', key: 'mission_power_boost' },
  { powerDefId: 'mission_duration_reduction', name: 'Mission Duration Reduction', key: 'mission_duration_reduction' },
  { powerDefId: 'crafting_duration_reduction', name: 'Crafting Duration Reduction', key: 'crafting_duration_reduction' },
  { powerDefId: 'building_build_duration_reduction', name: 'Building Construction Boost', key: 'building_build_duration_reduction' },
  { powerDefId: 'building_upgrade_duration_reduction', name: 'Building Upgrade Boost', key: 'building_upgrade_duration_reduction' },
  { powerDefId: 'injury_recovery_boost', name: 'Injury Recovery Boost', key: 'injury_recovery_boost' },
] as const;

/**
 * Build a uniques map for NFT asset IDs using the PowerRef shape.
 * Powers are assigned deterministically by cycling through NFT_POWER_DEFS
 * so that each asset ID gets a distinct power type across the collection.
 * Duration-reduction powers use a negative value so the timer formula
 * `duration * (1 + percentAdd / 100)` correctly shrinks the timer.
 */
function buildUniquesMap(assetIds: string[]): Record<string, UniqueLocationEntry> {
  const uniques: Record<string, UniqueLocationEntry> = {};
  for (let i = 0; i < assetIds.length; i++) {
    const id = assetIds[i];
    const powerDef = NFT_POWER_DEFS[i % NFT_POWER_DEFS.length];
    const absValue = NFT_POWER_VALUES[i % NFT_POWER_VALUES.length];
    const value = DURATION_REDUCTION_POWER_DEFS.has(powerDef.powerDefId) ? -absValue : absValue;
    uniques[id] = {
      powers: [{
        powerDefId: powerDef.powerDefId,
        name: powerDef.name,
        key: powerDef.key,
        value,
        valueMode: 'percent_add',
        durationMinutes: 60,
        dailyLimit: 1,
      }],
    };
  }
  return uniques;
}

/**
 * Seed the canonical PowerDef blueprints. Runs before seedNftUniquePowers so
 * that the PowerRef entries referencing these IDs resolve correctly.
 * One entry per existing power type — effectDefId is null for all non-effect_backed
 * types and must be wired up by an admin to make those powers fully operational.
 */
async function seedPowerDefs(prisma: any) {
  const powerDefs = [
    {
      id: 'global_tick_boost',
      name: 'Global Tick Boost',
      description: 'Increases world tick speed for all players for a limited duration.',
      powerType: 'tick_speed_boost',
      effectDefId: null,
      defaultValue: 50,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'global',
      selection: null,
      enabled: true,
    },
    {
      id: 'keeper_xp_boost',
      name: 'Keeper XP Boost',
      description: 'Boosts keeper (player) XP gain for the triggering player for a limited duration.',
      powerType: 'keeper_xp_boost',
      effectDefId: 'eff_nft_keeper_xp_boost',
      defaultValue: 25,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'entity_xp_boost',
      name: 'Entity XP Boost',
      description: 'Boosts XP gain for all entities owned by the triggering player.',
      powerType: 'entity_xp_boost',
      effectDefId: 'eff_nft_entity_xp_boost',
      defaultValue: 25,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'entity',
      selection: null,
      enabled: true,
    },
    {
      id: 'mission_power_boost',
      name: 'Mission Power Boost',
      description: 'Increases mission power contribution for entities owned by the triggering player.',
      powerType: 'mission_power_boost',
      effectDefId: 'eff_nft_mission_power_boost',
      defaultValue: 15,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'mission_duration_reduction',
      name: 'Mission Duration Reduction',
      description: 'Reduces active mission duration for the triggering player.',
      powerType: 'mission_duration_reduction',
      effectDefId: 'eff_nft_mission_timer_speed',
      defaultValue: -20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'crafting_duration_reduction',
      name: 'Crafting Duration Reduction',
      description: 'Reduces active crafting job duration for the triggering player.',
      powerType: 'crafting_duration_reduction',
      effectDefId: 'eff_nft_crafting_timer_speed',
      defaultValue: -20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'building_build_duration_reduction',
      name: 'Building Construction Boost',
      description: 'Reduces building construction time for the triggering player.',
      powerType: 'building_build_duration_reduction',
      effectDefId: 'eff_nft_building_build_timer_speed',
      defaultValue: -15,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'building_upgrade_duration_reduction',
      name: 'Building Upgrade Boost',
      description: 'Reduces building upgrade time for the triggering player.',
      powerType: 'building_upgrade_duration_reduction',
      effectDefId: 'eff_nft_building_upgrade_timer_speed',
      defaultValue: -15,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'dusting_duration_reduction',
      name: 'Dusting Duration Reduction',
      description: 'Reduces dusting job starting duration for the triggering player.',
      powerType: 'dusting_duration_reduction',
      effectDefId: 'eff_nft_dusting_timer_speed',
      defaultValue: -20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'injury_recovery_boost',
      name: 'Injury Recovery Boost',
      description: 'Speeds up injury recovery for entities owned by the triggering player.',
      powerType: 'injury_recovery_boost',
      effectDefId: 'eff_nft_injury_recovery_speed',
      defaultValue: 30,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 60,
      defaultDailyLimit: 1,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    // ── Instant remaining-duration reduction PowerDefs ──────────────────────
    // These reference the consumable instant EffectDefs so the feature can be
    // triggered via the admin/power endpoints in development.
    {
      id: 'mission_instant_reduction',
      name: 'Mission Instant Reduction',
      description: 'Instantly cuts remaining time from the triggering player\'s active mission.',
      powerType: 'mission_instant_reduction',
      effectDefId: 'eff_consumable_mission_duration_reduction',
      defaultValue: 20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 0,
      defaultDailyLimit: 0,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'crafting_instant_reduction',
      name: 'Crafting Instant Reduction',
      description: 'Instantly cuts remaining time from the triggering player\'s active crafting job.',
      powerType: 'crafting_instant_reduction',
      effectDefId: 'eff_consumable_crafting_duration_reduction',
      defaultValue: 20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 0,
      defaultDailyLimit: 0,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'building_build_instant_reduction',
      name: 'Building Build Instant Reduction',
      description: 'Instantly cuts remaining time from the triggering player\'s active building construction.',
      powerType: 'building_build_instant_reduction',
      effectDefId: 'eff_consumable_building_build_duration_reduction',
      defaultValue: 20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 0,
      defaultDailyLimit: 0,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'building_upgrade_instant_reduction',
      name: 'Building Upgrade Instant Reduction',
      description: 'Instantly cuts remaining time from the triggering player\'s active building upgrade.',
      powerType: 'building_upgrade_instant_reduction',
      effectDefId: 'eff_consumable_building_upgrade_duration_reduction',
      defaultValue: 20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 0,
      defaultDailyLimit: 0,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
    {
      id: 'dusting_instant_reduction',
      name: 'Dusting Instant Reduction',
      description: 'Instantly cuts remaining time from the triggering player\'s active dusting job.',
      powerType: 'dusting_instant_reduction',
      effectDefId: 'eff_consumable_dusting_duration_reduction',
      defaultValue: 20,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 0,
      defaultDailyLimit: 0,
      defaultScope: 'player',
      selection: null,
      enabled: true,
    },
  ];

  for (const def of powerDefs) {
    await prisma.powerDef.upsert({
      where: { id: def.id },
      update: {
        name: def.name,
        description: def.description,
        powerType: def.powerType,
        effectDefId: def.effectDefId,
        defaultValue: def.defaultValue,
        defaultValueMode: def.defaultValueMode,
        defaultDurationMinutes: def.defaultDurationMinutes,
        defaultDailyLimit: def.defaultDailyLimit,
        defaultScope: def.defaultScope,
        selection: def.selection,
        enabled: def.enabled,
      },
      create: def,
    });
  }
  logger.log(`PowerDef seed: upserted ${powerDefs.length} entries`);
}

/**
 * Merge `rules.uniques` onto entity_definitions and location_definitions using
 * the asset ID lists in nft-unique-powers.json. Runs after the main definition
 * seed so the base records already exist. Power types are assigned
 * deterministically (cycling through NFT_POWER_DEFS by index) so the output
 * is stable and idempotent across boots. Existing rules keys (e.g. `level` on
 * derp_outpost) are preserved — only the `uniques` key is overwritten on every
 * boot to ensure the cycling distribution is always applied.
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

      const mergedRules = { ...currentRules, uniques: buildUniquesMap(assetIds) };

      await prisma.locationDefinition.update({
        where: { id: definitionId },
        data: { rules: mergedRules },
      });
      logger.log(`NFT unique powers: seeded ${assetIds.length} entries on locationDefinition "${definitionId}"`);
    }
  }
}
