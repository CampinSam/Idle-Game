import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const STARTER_GEMS = 1000;
const GEMS_CURRENCY_ID = 'premium_gems';

const TABLE_TO_MODEL: Record<string, string> = {
  Currency: 'currency',
  ItemDef: 'itemDefinition',
  BodySchema: 'bodySchema',
  EquipmentSchema: 'equipmentSchema',
  ProgressionProfile: 'progressionProfile',
  TraitDefinition: 'traitDefinition',
  EntityDefinition: 'entityDefinition',
  RegionDefinition: 'regionDefinition',
  LocationDefinition: 'locationDefinition',
  BuildingDef: 'buildingDef',
  RoomDef: 'roomDef',
  DisplayDef: 'displayDef',
  MissionCategoryDef: 'missionCategoryDef',
  MissionDef: 'missionDef',
  RecipeDef: 'recipeDef',
  EventDefinition: 'eventDefinition',
  GiftDef: 'giftDef',
};

const SEED_ORDER = [
  'Currency',
  'ItemDef',
  'BodySchema',
  'EquipmentSchema',
  'ProgressionProfile',
  'TraitDefinition',
  'EntityDefinition',
  'RegionDefinition',
  'LocationDefinition',
  'BuildingDef',
  'RoomDef',
  'DisplayDef',
  'MissionCategoryDef',
  'MissionDef',
  'RecipeDef',
  'EventDefinition',
  'GiftDef',
];

async function seedDefinitions() {
  const seedPath = path.resolve(__dirname, 'seed-data.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`Loading seed data v${data._meta?.version ?? '?'} (${data._meta?.description ?? ''})`);

  for (const tableKey of SEED_ORDER) {
    const modelName = TABLE_TO_MODEL[tableKey];
    if (!modelName) {
      console.warn(`  ⚠ No model mapping for table key "${tableKey}", skipping`);
      continue;
    }

    const records: any[] = data[tableKey];
    if (!records || records.length === 0) {
      console.log(`  ─ ${tableKey}: 0 records (skipped)`);
      continue;
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      console.warn(`  ⚠ Prisma model "${modelName}" not found, skipping ${tableKey}`);
      continue;
    }

    let upserted = 0;
    for (const record of records) {
      await model.upsert({
        where: { id: record.id },
        update: {},
        create: record,
      });
      upserted++;
    }

    console.log(`  ✓ ${tableKey}: ${upserted} records`);
  }
}

function generateEntity(name: string) {
  const seedPath = path.resolve(__dirname, 'seed-data.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const data = JSON.parse(raw);

  const bodySchema = data.BodySchema?.[0];
  const traitDefs: any[] = data.TraitDefinition ?? [];

  const slots = bodySchema ? Object.keys(bodySchema.slots) : ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'];
  const traits: Record<string, string> = {};
  const stats: Record<string, number> = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 };

  for (const slot of slots) {
    const allowed: string[] = bodySchema?.slots?.[slot] ?? [];
    const archetype = allowed[Math.floor(Math.random() * allowed.length)] ?? 'Dave';
    traits[slot] = archetype;

    const traitDef = traitDefs.find(t => t.archetype === archetype);
    if (traitDef) {
      const slotBonuses = traitDef.slotStats?.[slot];
      if (slotBonuses) {
        for (const [stat, val] of Object.entries(slotBonuses)) {
          stats[stat] = (stats[stat] || 0) + (val as number);
        }
      }
    }
  }

  return {
    display: { name },
    progression: { level: 1, xp: 0 },
    stats,
    traits,
  };
}

async function seedTickSystem() {
  const existing = await prisma.tickRateInterval.findFirst();
  if (existing) {
    console.log('Tick system already initialized, skipping.');
    return;
  }

  await prisma.tickRateInterval.create({
    data: {
      ticksPerSecond: 1.0,
      effectiveFromTime: new Date(),
      effectiveFromTick: 0,
    },
  });
  console.log('Seeded tick system (1 tick/sec)');
}

async function deleteTestAccount() {
  const existing = await prisma.user.findUnique({
    where: { email: 'test@derp.dev' },
  });

  if (!existing) return;

  const uid = existing.id;
  await (prisma as any).giftClaimTx.deleteMany({ where: { userId: uid } }).catch(() => {});
  await (prisma as any).giftInstance.deleteMany({ where: { userId: uid } }).catch(() => {});
  await (prisma as any).itemLedger.deleteMany({ where: { userId: uid } });
  await (prisma as any).itemInstance.deleteMany({ where: { userId: uid } });
  await prisma.currencyLedger.deleteMany({ where: { userId: uid } });
  await prisma.userCurrencyBalance.deleteMany({ where: { userId: uid } });
  await prisma.notification.deleteMany({ where: { userId: uid } });
  await prisma.job.deleteMany({ where: { userId: uid } });
  const locations = await prisma.locationInstance.findMany({ where: { ownerUserId: uid }, select: { id: true } });
  for (const loc of locations) {
    await (prisma as any).locationRoomInstance.deleteMany({ where: { locationId: loc.id } });
    await (prisma as any).locationBuildingInstance.deleteMany({ where: { locationId: loc.id } });
    await (prisma as any).locationWorkerAssignment.deleteMany({ where: { locationId: loc.id } });
  }
  await prisma.locationInstance.deleteMany({ where: { ownerUserId: uid } });
  await prisma.entity.deleteMany({ where: { ownerUserId: uid } });
  await prisma.user.delete({ where: { id: uid } });

  console.log('Deleted existing test account');
}

async function seedTestAccount() {
  const existing = await prisma.user.findUnique({ where: { email: 'test@derp.dev' } });
  if (existing) {
    console.log(`Test account already exists (${existing.email}), skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash('Derp1234!', 12);

  const user = await prisma.user.create({
    data: {
      username: 'TestKeeper',
      email: 'test@derp.dev',
      passwordHash,
      keeperLevel: 1,
      authProvider: 'email',
    },
  });

  const gen = generateEntity('Starter Bird');
  await prisma.entity.create({
    data: {
      ownerUserId: user.id,
      definitionId: 'derp_bird',
      speciesId: 'derp_bird',
      role: 'player_unit',
      display: gen.display,
      progression: gen.progression,
      stats: gen.stats,
      traits: gen.traits,
    },
  });

  const currentTick = BigInt(1);

  await prisma.locationInstance.create({
    data: {
      ownerUserId: user.id,
      definitionId: 'derp_outpost',
      regionId: 'derpshire_valley',
      kind: 'outpost_fungible',
      level: 1,
      lastCollectionTick: currentTick,
    },
  });

  await prisma.userCurrencyBalance.create({
    data: {
      userId: user.id,
      currencyId: GEMS_CURRENCY_ID,
      balance: BigInt(STARTER_GEMS),
    },
  });

  await prisma.currencyLedger.create({
    data: {
      userId: user.id,
      currencyId: GEMS_CURRENCY_ID,
      delta: BigInt(STARTER_GEMS),
      reason: 'Starter bonus',
      sourceType: 'system',
    },
  });

  console.log(`Seeded test account: ${user.email} (${user.id})`);
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';

  await seedDefinitions();
  await seedTickSystem();

  // Test account is development-only — never run in production to avoid
  // creating a known-credential account on the live database.
  if (!isProduction) {
    await seedTestAccount();
  } else {
    console.log('Production environment — skipping test account seed.');
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
