import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Remap legacy ItemRarity values that no longer exist in the Prisma enum.
// Production DB still has the old values; dev client expects the new ones.
const RARITY_MAP: Record<string, string> = {
  SCARCE:     'SCARE',
  ADVANCED:   'RARE',
  ULTRA_RARE: 'EPIC',
};

function remapRecord(record: any): any {
  if (record.rarity && RARITY_MAP[record.rarity]) {
    return { ...record, rarity: RARITY_MAP[record.rarity] };
  }
  return record;
}

async function upsertAll<T extends { id: string }>(
  label: string,
  records: T[],
  model: { upsert: (args: any) => Promise<any> },
) {
  let ok = 0;
  for (const raw of records) {
    const record = remapRecord(raw);
    const { createdAt, updatedAt, ...data } = record as any;
    await model.upsert({
      where: { id: record.id },
      create: data,
      update: data,
    });
    ok++;
  }
  console.log(`  ✓ ${label}: ${ok} records`);
}

async function main() {
  const exportPath = path.resolve(process.cwd(), 'prod-export.json');
  const raw = fs.readFileSync(exportPath, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`Importing prod-export.json (${data._meta?.exportedAt}) into dev…\n`);

  // 1. display_defs — referenced by categories, missions, recipes
  await upsertAll('display_defs', data.display_defs, prisma.displayDef);

  // 2. mission_category_defs — self-referential parentId: insert roots first,
  //    then children so FK to parent is satisfied.
  const cats: any[] = data.mission_category_defs;
  const roots    = cats.filter(c => c.parentId === null);
  const children = cats.filter(c => c.parentId !== null);
  await upsertAll('mission_category_defs (roots)',    roots,    prisma.missionCategoryDef);
  await upsertAll('mission_category_defs (children)', children, prisma.missionCategoryDef);

  // 3. bundle_defs — no FK deps on imported tables
  await upsertAll('bundle_defs', data.bundle_defs, prisma.bundleDef);

  // 4. lootbox_defs
  await upsertAll('lootbox_defs', data.lootbox_defs, prisma.lootboxDef);

  // 5. item_defs — lootboxDefId → lootbox_defs
  await upsertAll('item_defs', data.item_defs, prisma.itemDefinition);

  // 6. recipe_defs — displayDefId → display_defs
  await upsertAll('recipe_defs', data.recipe_defs, prisma.recipeDef);

  // 7. mission_defs — displayDefId + missionCategoryDefId
  await upsertAll('mission_defs', data.mission_defs, prisma.missionDef);

  console.log('\nDone.');
}

main()
  .catch((e) => { console.error('Import failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
