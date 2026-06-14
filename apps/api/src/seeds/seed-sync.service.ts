import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { objectStorageClient } from '../integrations/object-storage/objectStorage';

export const SEED_STORAGE_KEY = 'seed/seed-data.json';
const SNAPSHOT_PREFIX = 'seed/snapshots/seed-data-v';

export const SEED_TABLE_ORDER = [
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

export type SeedTableName = typeof SEED_TABLE_ORDER[number];

const ADMIN_TABLE_TO_MODEL: Record<string, SeedTableName> = {
  currency: 'currency',
  regionDefinition: 'regionDefinition',
  displayDef: 'displayDef',
  entityDefinition: 'entityDefinition',
  locationDefinition: 'locationDefinition',
  buildingDef: 'buildingDef',
  roomDef: 'roomDef',
  missionCategoryDef: 'missionCategoryDef',
  missionDef: 'missionDef',
  recipeDef: 'recipeDef',
  itemDef: 'itemDefinition',
  itemDefinition: 'itemDefinition',
  giftDef: 'giftDef',
  shopItemDef: 'shopItemDef',
  eventDefinition: 'eventDefinition',
  lootboxDef: 'lootboxDef',
  bundleDef: 'bundleDef',
  checkInDef: 'checkInDef',
  questDef: 'questDef',
  modalDef: 'modalDef',
  defaultModalDef: 'defaultModalDef',
  homeBannerDef: 'homeBannerDef',
  systemIconDef: 'systemIconDef',
  synergyRule: 'synergyRule',
  powerDef: 'powerDef',
  soundDef: 'soundDef',
  tagDef: 'tagDef',
  visualEffectDef: 'visualEffectDef',
  effectDef: 'effectDef',
  nftCollectionDef: 'nftCollectionDef',
  'game-definitions': 'gameDefinition',
  gameDefinition: 'gameDefinition',
};

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
  /**
   * UUID PK migration: EffectDef.id is now a UUID; the slug lives in key.
   * Old seed records have id=slug and no key field.
   * New seed records (post-migration) have id=UUID and key=slug.
   * In both cases we strip id (Prisma auto-generates or ignores it) and set key from the slug.
   */
  effectDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /**
   * UUID PK migration: PowerDef.id is now a UUID; the slug lives in key.
   * effectDefId in legacy seed data may be a slug rather than a UUID.
   * If effectDefId is a slug (not a UUID), omit it from the record so the
   * DB-authoritative UUID value (set by the migration) is not overwritten.
   */
  powerDef: (r) => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { id, effectDefId, ...rest } = r;
    const key: string = r.key ?? id;
    // Only include effectDefId if it is already a UUID (post-migration format).
    // Legacy slug values are excluded so the migrated UUID FK is preserved.
    const effectDefEntry = (effectDefId == null || UUID_V4.test(effectDefId))
      ? { effectDefId }
      : {};
    return { ...rest, key, ...effectDefEntry };
  },
};

type WhereBuilder = (r: any) => any;

const TABLE_WHERE: Partial<Record<SeedTableName, WhereBuilder>> = {
  soundDef: (r) => ({ key: r.key }),
  tagDef: (r) => ({ key: r.key }),
  visualEffectDef: (r) => ({ key: r.key }),
  gameDefinition: (r) => ({ type_key_version: { type: r.type, key: r.key, version: r.version } }),
  // After UUID PK migration: look up by key slug, not by auto-generated UUID id.
  effectDef: (r) => ({ key: r.key }),
  powerDef: (r) => ({ key: r.key }),
};

function getBucketName(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '').split(',')[0];
  const path = (dir || '').trim();
  if (!path) throw new Error('No object storage path configured (PRIVATE_OBJECT_DIR or PUBLIC_OBJECT_SEARCH_PATHS)');
  const parts = (path.startsWith('/') ? path.slice(1) : path).split('/');
  const name = parts[0];
  if (!name) throw new Error('Could not parse bucket name from object storage path');
  return name;
}

function serializeForStorage(data: any): string {
  return JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

@Injectable()
export class SeedSyncService {
  private readonly logger = new Logger(SeedSyncService.name);

  constructor(private prisma: PrismaService) {}

  private async downloadFromStorage(): Promise<any | null> {
    let bucketName: string;
    try {
      bucketName = getBucketName();
    } catch {
      // env not configured → no storage; git fallback is safe
      return null;
    }
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(SEED_STORAGE_KEY);
    const [exists] = await file.exists();
    // key absent → fresh environment; git fallback is safe
    if (!exists) return null;
    // key present but download fails → storage is broken; do NOT fall back to stale git data
    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf-8'));
  }

  private async uploadToStorage(data: any): Promise<void> {
    const bucketName = getBucketName();
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(SEED_STORAGE_KEY);
    await file.save(Buffer.from(serializeForStorage(data), 'utf-8'), {
      contentType: 'application/json',
      resumable: false,
    });
  }

  resolveModelName(adminTableKey: string): SeedTableName | null {
    return ADMIN_TABLE_TO_MODEL[adminTableKey] ?? null;
  }

  async syncTable(adminTableKey: string): Promise<void> {
    const modelName = this.resolveModelName(adminTableKey);
    if (!modelName) {
      return;
    }
    try {
      const model = (this.prisma as any)[modelName];
      if (!model) {
        this.logger.warn(`SeedSyncService.syncTable: Prisma model "${modelName}" not found`);
        return;
      }
      const current = await this.downloadFromStorage();
      if (!current) {
        // No canonical file exists yet — bootstrap a full export rather than
        // creating a one-table partial document.
        await this.syncAll();
        this.logger.debug(`SeedSyncService.syncTable: bootstrapped full syncAll for "${modelName}" (storage was empty)`);
        return;
      }
      current[modelName] = await model.findMany();
      const tableSet = new Set<string>(Array.isArray(current._meta?.tables) ? current._meta.tables : []);
      tableSet.add(modelName);
      current._meta = {
        ...current._meta,
        updatedAt: new Date().toISOString(),
        tables: [...tableSet],
      };
      await this.uploadToStorage(current);
      this.logger.debug(`SeedSyncService.syncTable: synced "${modelName}" to Object Storage`);
    } catch (err: any) {
      this.logger.warn(`SeedSyncService.syncTable("${modelName}") failed (non-fatal): ${err?.message}`);
    }
  }

  async syncAll(): Promise<any> {
    const data: any = {
      _meta: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tables: [...SEED_TABLE_ORDER],
      },
    };
    for (const modelName of SEED_TABLE_ORDER) {
      const model = (this.prisma as any)[modelName];
      if (!model) {
        this.logger.warn(`SeedSyncService.syncAll: Prisma model "${modelName}" not found, skipping`);
        data[modelName] = [];
        continue;
      }
      data[modelName] = await model.findMany();
    }
    await this.uploadToStorage(data);
    return data;
  }

  async runSeed(tables?: string[]): Promise<Record<string, string>> {
    let seedData = await this.downloadFromStorage();
    if (!seedData) {
      // Cold-start fallback: load committed prisma/seed-data.json, upload it to
      // Object Storage as the canonical source, then seed from it.
      const fallbackPath = join(__dirname, '../../../..', 'prisma', 'seed-data.json');
      const altPath = join(process.cwd(), 'prisma', 'seed-data.json');
      const resolvedPath = existsSync(fallbackPath) ? fallbackPath : existsSync(altPath) ? altPath : null;
      if (!resolvedPath) {
        throw new Error('No seed data in Object Storage and prisma/seed-data.json not found. Run `pnpm export-seed` first.');
      }
      this.logger.warn('SeedSyncService.runSeed: Object Storage empty — using prisma/seed-data.json fallback and uploading to storage');
      seedData = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
      try {
        await this.uploadToStorage(seedData);
      } catch (uploadErr: any) {
        this.logger.warn(`SeedSyncService.runSeed: failed to upload fallback to storage (non-fatal): ${uploadErr?.message}`);
      }
    }
    return this.applySeedData(seedData, tables);
  }

  async applySeedData(seedData: any, tables?: string[]): Promise<Record<string, string>> {
    const allowedSet = tables && tables.length > 0 ? new Set(tables) : null;
    const results: Record<string, string> = {};

    for (const modelName of SEED_TABLE_ORDER) {
      if (allowedSet && !allowedSet.has(modelName)) continue;
      const records: any[] = seedData[modelName];
      if (!records || records.length === 0) {
        results[modelName] = 'skipped (no data)';
        continue;
      }
      try {
        await this.upsertTable(modelName, records);
        results[modelName] = `ok (${records.length})`;
      } catch (err: any) {
        results[modelName] = `error: ${err?.message ?? String(err)}`;
        this.logger.error(`Seed table "${modelName}" failed: ${err?.message}`, err?.stack);
      }
    }
    return results;
  }

  /**
   * row_to_json in PostgreSQL serialises TIMESTAMP (no tz) columns without a
   * timezone suffix, e.g. "2026-05-26T22:03:25.753". Prisma rejects those
   * because it expects a full ISO-8601 string. This helper converts any
   * date-like string values to proper Date objects so Prisma accepts them.
   */
  private normalizeDates(record: any): any {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const out: any = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = typeof v === 'string' && ISO_RE.test(v) ? new Date(v) : v;
    }
    return out;
  }

  private async upsertTable(modelName: SeedTableName, records: any[]): Promise<void> {
    const model = (this.prisma as any)[modelName];
    if (!model) {
      this.logger.warn(`upsertTable: Prisma model "${modelName}" not found`);
      return;
    }

    const transform = TABLE_TRANSFORMS[modelName];
    const buildWhere = TABLE_WHERE[modelName] ?? ((r: any) => ({ id: r.id }));

    if (modelName === 'missionCategoryDef') {
      const parents = records.filter((r) => !r.parentId);
      const children = records.filter((r) => r.parentId);
      for (const batch of [parents, children]) {
        for (const raw of batch) {
          const base = transform ? transform(raw) : raw;
          const record = this.normalizeDates(base);
          const where = buildWhere(record);
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
          await model.upsert({ where, update: rest, create: record });
        }
      }
      return;
    }

    for (const raw of records) {
      const base = transform ? transform(raw) : raw;
      const record = this.normalizeDates(base);
      const where = buildWhere(record);
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
      try {
        await model.upsert({ where, update: rest, create: record });
      } catch (err: any) {
        this.logger.error(`upsertTable: failed to upsert ${modelName} (where=${JSON.stringify(where)}): ${err?.message}`);
        throw err;
      }
    }
  }

  async createSnapshot(): Promise<{ version: number; storageKey: string }> {
    const data = await this.syncAll();
    const bucketName = getBucketName();
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: 'seed/snapshots/' });
    let maxVersion = 0;
    for (const f of files) {
      const match = f.name.match(/seed-data-v(\d+)\.json$/);
      if (match) {
        const v = parseInt(match[1], 10);
        if (v > maxVersion) maxVersion = v;
      }
    }
    const version = maxVersion + 1;
    const storageKey = `${SNAPSHOT_PREFIX}${version}.json`;
    const snapshotFile = bucket.file(storageKey);
    await snapshotFile.save(Buffer.from(serializeForStorage(data), 'utf-8'), {
      contentType: 'application/json',
      resumable: false,
    });
    this.logger.log(`Snapshot v${version} created at ${storageKey}`);
    return { version, storageKey };
  }
}
