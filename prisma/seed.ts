import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TABLE_TO_MODEL: Record<string, string> = {
  Currency: 'currency',
  ItemDef: 'itemDefinition',
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

  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'TestKeeper', email: 'test@derp.dev', password: 'Derp1234!' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to register test account (${res.status}): ${body}`);
  }

  const data = await res.json() as any;
  console.log(`Seeded test account: test@derp.dev (${data?.player?.id ?? 'unknown id'})`);
}

// Powers to seed onto the test account's perfect specimens and primary outpost.
// Each entry describes one nftAssetId and the powers array to merge in.
const TEST_POWERS: Array<{
  defTable: 'entityDefinition' | 'locationDefinition';
  defId: string;
  nftAssetId: string;
  powers: Array<{ powerType: string; value: number; durationMinutes: number; dailyLimit: number }>;
}> = [
  {
    defTable: 'entityDefinition',
    defId: 'derp_bird',
    nftAssetId: 'CARDANO:e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0:44503039313833',
    powers: [
      { powerType: 'tick_speed_boost', value: 50, durationMinutes: 60, dailyLimit: 1 },
    ],
  },
  {
    defTable: 'entityDefinition',
    defId: 'derp_bird',
    nftAssetId: 'CARDANO:e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0:44503039393130',
    powers: [
      { powerType: 'entity_xp_boost', value: 75, durationMinutes: 120, dailyLimit: 2 },
    ],
  },
  {
    defTable: 'entityDefinition',
    defId: 'derp_bird',
    nftAssetId: 'CARDANO:e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0:44503030333130',
    powers: [
      { powerType: 'keeper_xp_boost', value: 50, durationMinutes: 90, dailyLimit: 1 },
      { powerType: 'mission_duration_reduction', value: 25, durationMinutes: 60, dailyLimit: 1 },
    ],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030323732',
    powers: [
      { powerType: 'mission_power_boost', value: 30, durationMinutes: 60, dailyLimit: 2 },
    ],
  },
];

async function seedTestPowers() {
  // Group entries by (defTable, defId) so we only read/write each definition once.
  const byDef = new Map<string, typeof TEST_POWERS>();
  for (const entry of TEST_POWERS) {
    const key = `${entry.defTable}:${entry.defId}`;
    if (!byDef.has(key)) byDef.set(key, []);
    byDef.get(key)!.push(entry);
  }

  for (const [key, entries] of byDef) {
    const [defTable, defId] = key.split(':');
    const model = (prisma as any)[defTable];
    if (!model) {
      throw new Error(`seedTestPowers: Prisma model "${defTable}" not found — check TABLE_TO_MODEL mapping`);
    }

    const def = await model.findUnique({ where: { id: defId } });
    if (!def) {
      throw new Error(
        `seedTestPowers: Definition "${defId}" not found in ${defTable}. ` +
        `Run seedDefinitions first (pnpm prisma db seed).`,
      );
    }

    const rules = (def.rules && typeof def.rules === 'object') ? { ...(def.rules as Record<string, unknown>) } : {};
    const uniques: Record<string, { powers: unknown[] }> = (rules.uniques && typeof rules.uniques === 'object')
      ? { ...(rules.uniques as Record<string, { powers: unknown[] }>) }
      : {};

    for (const entry of entries) {
      uniques[entry.nftAssetId] = { powers: entry.powers };
    }

    rules.uniques = uniques;

    await model.update({
      where: { id: defId },
      data: { rules },
    });

    const nftIds = entries.map(e => e.nftAssetId.slice(-8)).join(', ');
    console.log(`  ✓ ${defTable} "${defId}": seeded uniques for …${nftIds}`);
  }

  // Post-seed verification: read back each definition and assert every expected
  // nftAssetId has at least one power entry so a partial write is caught immediately.
  console.log('  Verifying seeded powers…');
  for (const [key, entries] of byDef) {
    const [defTable, defId] = key.split(':');
    const model = (prisma as any)[defTable];
    const def = await model.findUnique({ where: { id: defId } });
    const uniques = ((def?.rules as any)?.uniques ?? {}) as Record<string, { powers: unknown[] }>;

    for (const entry of entries) {
      const stored = uniques[entry.nftAssetId];
      if (!stored || !Array.isArray(stored.powers) || stored.powers.length === 0) {
        throw new Error(
          `seedTestPowers verification failed: nftAssetId "${entry.nftAssetId}" ` +
          `has no powers in ${defTable} "${defId}" after upsert.`,
        );
      }
      for (const expected of entry.powers) {
        const found = stored.powers.find((p: any) => p.powerType === expected.powerType);
        if (!found) {
          throw new Error(
            `seedTestPowers verification failed: powerType "${expected.powerType}" ` +
            `missing for nftAssetId "${entry.nftAssetId}" in ${defTable} "${defId}".`,
          );
        }
      }
    }
  }
  console.log('  ✓ Power seed verification passed');
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';

  await seedDefinitions();
  await seedTickSystem();

  // Test account is development-only — never run in production to avoid
  // creating a known-credential account on the live database.
  if (!isProduction) {
    await seedTestAccount();
    await seedTestPowers();
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
