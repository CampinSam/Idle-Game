import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  for (const row of rows) {
    const data = transform ? transform(row) : row;
    const { id, ...rest } = data;
    const existing = await prisma[model].findUnique({ where: { id } });
    if (existing) continue;
    await prisma[model].create({ data });
    seeded++;
  }
  if (seeded > 0) {
    logger.log(`Seeded ${seeded} ${model} records`);
  }
}

export async function seedDefinitions(prisma: any) {
  const defs = loadJson('definitions.json');
  const itemDefs = loadJson('item-defs.json');

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
    await upsertMany(prisma, 'locationDefinition', defs.locationDefinitions);
  }

  if (defs.roomDefs) {
    await upsertMany(prisma, 'roomDef', defs.roomDefs);
  }

  if (defs.buildingDefs) {
    await upsertMany(prisma, 'buildingDef', defs.buildingDefs);
  }

  if (defs.missionDefs) {
    await upsertMany(prisma, 'missionDef', defs.missionDefs);
  }

  if (defs.recipeDefs) {
    await upsertMany(prisma, 'recipeDef', defs.recipeDefs);
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

  logger.log('Definition seeding complete');
}
