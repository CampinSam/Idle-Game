import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeOutcomeFieldsForModel } from '../modules/game-rules/outcome-spec.util';

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

async function upsertMany(prisma: any, model: string, rows: any[], transform?: (r: any) => any) {
  let seeded = 0;
  const countBefore = await prisma[model].count();
  for (const row of rows) {
    const data = transform ? transform(row) : row;
    normalizeOutcomeFieldsForModel(model, data);
    const { id, ...rest } = data;
    await prisma[model].upsert({
      where: { id },
      update: {},
      create: data,
    });
  }
  const countAfter = await prisma[model].count();
  seeded = countAfter - countBefore;
  if (seeded > 0) {
    logger.log(`Seeded ${seeded} ${model} records`);
  }
}

async function upsertManyForce(prisma: any, model: string, rows: any[], transform?: (r: any) => any) {
  let seeded = 0;
  const countBefore = await prisma[model].count();
  for (const row of rows) {
    const data = transform ? transform(row) : row;
    normalizeOutcomeFieldsForModel(model, data);
    const { id, ...rest } = data;
    await prisma[model].upsert({
      where: { id },
      update: rest,
      create: data,
    });
  }
  const countAfter = await prisma[model].count();
  seeded = countAfter - countBefore;
  if (seeded > 0) {
    logger.log(`Seeded ${seeded} ${model} records`);
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

  if (defs.traitDefinitions) {
    await upsertMany(prisma, 'traitDefinition', defs.traitDefinitions);
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

  if (defs.equipmentSchemas) {
    await upsertMany(prisma, 'equipmentSchema', defs.equipmentSchemas);
  }

  if (defs.progressionProfiles) {
    await upsertMany(prisma, 'progressionProfile', defs.progressionProfiles);
  }

  if (defs.bodySchemas) {
    await upsertMany(prisma, 'bodySchema', defs.bodySchemas);
  }

  if (defs.entityDefinitions) {
    await upsertMany(prisma, 'entityDefinition', defs.entityDefinitions);
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

  logger.log('Definition seeding complete');
}
