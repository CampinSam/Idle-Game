import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SEED_KEY = 'seed/seed-data.json';
const REPLIT_SIDECAR = 'http://127.0.0.1:1106';

const SEED_TABLE_ORDER = [
  'currency',
  'regionDefinition',
  'displayDef',
  'entityDefinition',
  'locationDefinition',
  'buildingDef',
  'roomDef',
  'missionCategoryDef',
  'missionDef',
  'recipeDef',
  'itemDefinition',
  'giftDef',
  'shopItemDef',
  'eventDefinition',
  'lootboxDef',
  'bundleDef',
  'checkInDef',
  'questDef',
  'modalDef',
  'defaultModalDef',
  'homeBannerDef',
  'systemIconDef',
  'synergyRule',
  'powerDef',
  'soundDef',
  'tagDef',
  'visualEffectDef',
  'effectDef',
  'nftCollectionDef',
  'gameDefinition',
] as const;

type SeedTableName = typeof SEED_TABLE_ORDER[number];

type RecordTransform = (r: any) => any;

const TABLE_TRANSFORMS: Partial<Record<SeedTableName, RecordTransform>> = {
  currency: (r) => {
    const c = { ...r };
    if (c.cap != null) c.cap = BigInt(c.cap);
    if (c.cntWithdrawalFee != null) c.cntWithdrawalFee = BigInt(c.cntWithdrawalFee);
    if (c.cntAutoApprovalThreshold != null) c.cntAutoApprovalThreshold = BigInt(c.cntAutoApprovalThreshold);
    return c;
  },
  shopItemDef: (r) => {
    const c = { ...r };
    if (c.limitedUntil) c.limitedUntil = new Date(c.limitedUntil);
    return c;
  },
  homeBannerDef: (r) => {
    const c = { ...r };
    if (c.startsAt) c.startsAt = new Date(c.startsAt);
    if (c.endsAt) c.endsAt = new Date(c.endsAt);
    return c;
  },
  synergyRule: (r) => {
    const c = { ...r };
    if (c.startsAt) c.startsAt = new Date(c.startsAt);
    if (c.endsAt) c.endsAt = new Date(c.endsAt);
    return c;
  },
};

const TABLE_WHERE: Partial<Record<SeedTableName, (r: any) => any>> = {
  soundDef: (r) => ({ key: r.key }),
  tagDef: (r) => ({ key: r.key }),
  visualEffectDef: (r) => ({ key: r.key }),
  gameDefinition: (r) => ({ type_key_version: { type: r.type, key: r.key, version: r.version } }),
};

function getBucketName(): string | null {
  const dir = process.env.PRIVATE_OBJECT_DIR || (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '').split(',')[0];
  const p = (dir || '').trim();
  if (!p) return null;
  const parts = (p.startsWith('/') ? p.slice(1) : p).split('/');
  return parts[0] || null;
}

async function tryDownloadFromStorage(): Promise<any | null> {
  const bucketName = getBucketName();
  // env not configured → no storage; git fallback is safe
  if (!bucketName) return null;
  const storageClient = new Storage({
    credentials: {
      audience: 'replit',
      subject_token_type: 'access_token',
      token_url: `${REPLIT_SIDECAR}/token`,
      type: 'external_account',
      credential_source: {
        url: `${REPLIT_SIDECAR}/credential`,
        format: { type: 'json', subject_token_field_name: 'access_token' },
      },
      universe_domain: 'googleapis.com',
    } as any,
    projectId: '',
  });
  const bucket = storageClient.bucket(bucketName);
  const file = bucket.file(SEED_KEY);
  const [exists] = await file.exists();
  // key absent → fresh environment; git fallback is safe
  if (!exists) {
    console.log(`Object Storage key "${SEED_KEY}" not found — will use git fallback`);
    return null;
  }
  // key present but download fails → storage is broken; do NOT fall back to stale git data
  const [contents] = await file.download();
  console.log(`Loaded seed data from Object Storage (${bucketName}/${SEED_KEY})`);
  return JSON.parse(contents.toString('utf-8'));
}

async function tryUploadToStorage(data: any, bucketName: string): Promise<void> {
  try {
    const storageClient = new Storage({
      credentials: {
        audience: 'replit',
        subject_token_type: 'access_token',
        token_url: `${REPLIT_SIDECAR}/token`,
        type: 'external_account',
        credential_source: {
          url: `${REPLIT_SIDECAR}/credential`,
          format: { type: 'json', subject_token_field_name: 'access_token' },
        },
        universe_domain: 'googleapis.com',
      } as any,
      projectId: '',
    });
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(SEED_KEY);
    const json = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    await file.save(Buffer.from(json, 'utf-8'), { contentType: 'application/json', resumable: false });
    console.log(`Uploaded git fallback to Object Storage (${bucketName}/${SEED_KEY})`);
  } catch (err: any) {
    console.warn(`Could not upload to Object Storage: ${err?.message ?? err}`);
  }
}

async function getSeedData(): Promise<any> {
  const storageData = await tryDownloadFromStorage();
  if (storageData) return storageData;

  const localPath = path.resolve(__dirname, 'seed-data.json');
  if (!fs.existsSync(localPath)) {
    throw new Error(`No seed data available: Object Storage unavailable and ${localPath} not found`);
  }
  const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  console.log(`Using git fallback: ${localPath} (v${data._meta?.version ?? '?'})`);

  // Upload the fallback so subsequent runs use Object Storage
  const bucketName = getBucketName();
  if (bucketName) {
    await tryUploadToStorage(data, bucketName);
  }
  return data;
}

async function seedDefinitions() {
  const data = await getSeedData();
  console.log(`Seeding definitions (v${data._meta?.version ?? '?'})…`);

  for (const modelName of SEED_TABLE_ORDER) {
    const records: any[] | undefined = data[modelName];
    if (!records || records.length === 0) {
      console.log(`  ─ ${modelName}: 0 records (skipped)`);
      continue;
    }

    const model = (prisma as any)[modelName];
    if (!model) {
      console.warn(`  ⚠ Prisma model "${modelName}" not found, skipping`);
      continue;
    }

    const transform = TABLE_TRANSFORMS[modelName];
    const buildWhere = TABLE_WHERE[modelName] ?? ((r: any) => ({ id: r.id }));

    if (modelName === 'missionCategoryDef') {
      const parents = records.filter((r) => !r.parentId);
      const children = records.filter((r) => r.parentId);
      let count = 0;
      for (const batch of [parents, children]) {
        for (const raw of batch) {
          const record = transform ? transform(raw) : raw;
          const where = buildWhere(record);
          const { id: _id, ...rest } = record;
          await model.upsert({ where, update: rest, create: record });
          count++;
        }
      }
      console.log(`  ✓ ${modelName}: ${count} records`);
      continue;
    }

    let count = 0;
    for (const raw of records) {
      const record = transform ? transform(raw) : raw;
      const where = buildWhere(record);
      const { id: _id, ...rest } = record;
      await model.upsert({ where, update: rest, create: record });
      count++;
    }
    console.log(`  ✓ ${modelName}: ${count} records`);
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
  const existing = await prisma.user.findUnique({ where: { email: 'test@derp.dev' } });
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
  const responseData = await res.json() as any;
  console.log(`Seeded test account: test@derp.dev (${responseData?.player?.id ?? 'unknown id'})`);
}

const TEST_POWERS: Array<{
  defTable: 'entityDefinition' | 'locationDefinition';
  defId: string;
  nftAssetId: string;
  powers: Array<{ powerType: string; value: number; durationMinutes: number; dailyLimit: number }>;
}> = [
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
    defTable: 'entityDefinition',
    defId: 'derp_bird',
    nftAssetId: 'CARDANO:e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0:44503039313833',
    powers: [{ powerType: 'tick_speed_boost', value: 50, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'entityDefinition',
    defId: 'derp_bird',
    nftAssetId: 'CARDANO:e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0:44503039393130',
    powers: [{ powerType: 'entity_xp_boost', value: 75, durationMinutes: 120, dailyLimit: 2 }],
  },
  {
    defTable: 'entityDefinition',
    defId: 'perp',
    nftAssetId: 'CARDANO:e6ba9c0ff27be029442c32533c6efd956a60d15ecb976acbb64c4de0:5065727034353834',
    powers: [{ powerType: 'entity_xp_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030323732',
    powers: [{ powerType: 'mission_power_boost', value: 30, durationMinutes: 60, dailyLimit: 2 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030363431',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030373236',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030393033',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543030393338',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543031313533',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543031363537',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543031383030',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543031393538',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543032323938',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543032343138',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543032393636',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543033333937',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543034333439',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543034343130',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543034383734',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543035333033',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543035333232',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543035343234',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543036343234',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543036363930',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543037333633',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
  {
    defTable: 'locationDefinition',
    defId: 'derp_outpost',
    nftAssetId: 'CARDANO:a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5:000de1404f5554504f53543037363232',
    powers: [{ powerType: 'mission_power_boost', value: 10, durationMinutes: 60, dailyLimit: 1 }],
  },
];

async function seedTestPowers() {
  const byDef = new Map<string, typeof TEST_POWERS>();
  for (const entry of TEST_POWERS) {
    const key = `${entry.defTable}:${entry.defId}`;
    if (!byDef.has(key)) byDef.set(key, []);
    byDef.get(key)!.push(entry);
  }

  for (const [key, entries] of byDef) {
    const [defTable, defId] = key.split(':');
    const model = (prisma as any)[defTable];
    if (!model) throw new Error(`seedTestPowers: Prisma model "${defTable}" not found`);

    const def = await model.findUnique({ where: { id: defId } });
    if (!def) {
      throw new Error(`seedTestPowers: Definition "${defId}" not found in ${defTable}. Run seedDefinitions first.`);
    }

    const rules = (def.rules && typeof def.rules === 'object') ? { ...(def.rules as Record<string, unknown>) } : {};
    const uniques: Record<string, { powers: unknown[] }> = (rules.uniques && typeof rules.uniques === 'object')
      ? { ...(rules.uniques as Record<string, { powers: unknown[] }>) }
      : {};

    for (const entry of entries) {
      uniques[entry.nftAssetId] = { powers: entry.powers };
    }
    rules.uniques = uniques;

    await model.update({ where: { id: defId }, data: { rules } });
    const nftIds = entries.map((e) => e.nftAssetId.slice(-8)).join(', ');
    console.log(`  ✓ ${defTable} "${defId}": seeded uniques for …${nftIds}`);
  }

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
          `seedTestPowers verification failed: nftAssetId "${entry.nftAssetId}" has no powers in ${defTable} "${defId}"`,
        );
      }
      for (const expected of entry.powers) {
        const found = stored.powers.find((p: any) => p.powerType === expected.powerType);
        if (!found) {
          throw new Error(
            `seedTestPowers verification failed: powerType "${expected.powerType}" missing for nftAssetId "${entry.nftAssetId}"`,
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
