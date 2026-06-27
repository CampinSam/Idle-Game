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
  'locationDefinition',
  'buildingDef',
  'roomDef',
  'entityDefinition',
  'missionCategoryDef',
  'missionDef',
  'recipeDef',
  'lootboxDef',
  'bundleDef',
  'itemDefinition',
  'giftDef',
  'shopItemDef',
  'eventDefinition',
  'checkInDef',
  'questDef',
  'modalDef',
  'defaultModalDef',
  'homeBannerDef',
  'systemIconDef',
  'synergyRule',
  // effectDef must come before powerDef so PowerDef.effectDefId slugs can be
  // resolved to UUID FK values during the seed pass (see upsertTable).
  'effectDef',
  'powerDef',
  'soundDef',
  'tagDef',
  'visualEffectDef',
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
    const { id, ...rest } = r;
    const c = { ...rest };
    const key: string = r.key ?? id;
    c.key = key;
    if (c.cap != null) c.cap = BigInt(c.cap);
    if (c.cntWithdrawalFee != null) c.cntWithdrawalFee = BigInt(c.cntWithdrawalFee);
    if (c.cntAutoApprovalThreshold != null) c.cntAutoApprovalThreshold = BigInt(c.cntAutoApprovalThreshold);
    return c;
  },
  regionDefinition: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  locationDefinition: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  buildingDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  roomDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  entityDefinition: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: MissionCategoryDef.id is now a UUID; slug lives in key. */
  missionCategoryDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: MissionDef.id is now a UUID; slug lives in key. */
  missionDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: RecipeDef.id is now a UUID; slug lives in key. */
  recipeDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  lootboxDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  bundleDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  itemDefinition: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  shopItemDef: (r) => {
    const c = { ...r };
    if (c.limitedUntil) c.limitedUntil = new Date(c.limitedUntil);
    return c;
  },
  /** UUID PK migration: DisplayDef.id is now a UUID; slug lives in key. */
  displayDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: ModalDef.id is now a UUID; slug lives in key. */
  modalDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: DefaultModalDef.id is now a UUID; slug lives in key. */
  defaultModalDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: HomeBannerDef.id is now a UUID; slug lives in key. */
  homeBannerDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    const c = { ...rest, key };
    if (c.startsAt) c.startsAt = new Date(c.startsAt);
    if (c.endsAt) c.endsAt = new Date(c.endsAt);
    return c;
  },
  /** UUID PK migration: SystemIconDef.id is now a UUID; slug lives in key. */
  systemIconDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: SynergyRule.id is now a UUID; slug lives in key. */
  synergyRule: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    const c = { ...rest, key };
    if (c.startsAt) c.startsAt = new Date(c.startsAt);
    if (c.endsAt) c.endsAt = new Date(c.endsAt);
    return c;
  },
  /** UUID PK migration: EventDefinition.id is now a UUID; slug lives in key. */
  eventDefinition: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: NftCollectionDef.id is now a UUID; slug lives in key. */
  nftCollectionDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: VisualEffectDef.id is now a UUID; slug already in key. */
  visualEffectDef: (r) => {
    const { id, ...rest } = r;
    return { ...rest };
  },
  /** UUID PK migration: TagDef.id is now a UUID; slug already in key. */
  tagDef: (r) => {
    const { id, ...rest } = r;
    return { ...rest };
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
   * effectDefId slug → UUID resolution is handled asynchronously in upsertTable
   * (see the powerDef special-case block) after effectDef rows are committed.
   */
  powerDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: QuestDef.id is now a UUID; the slug lives in key. */
  questDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: CheckInDef.id is now a UUID; the slug lives in key. */
  checkInDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
  /** UUID PK migration: GiftDef.id is now a UUID; the slug lives in key. */
  giftDef: (r) => {
    const { id, ...rest } = r;
    const key: string = r.key ?? id;
    return { ...rest, key };
  },
};

type WhereBuilder = (r: any) => any;

const TABLE_WHERE: Partial<Record<SeedTableName, WhereBuilder>> = {
  soundDef: (r) => ({ key: r.key }),
  tagDef: (r) => ({ key: r.key }),
  visualEffectDef: (r) => ({ key: r.key }),
  displayDef: (r) => ({ key: r.key }),
  modalDef: (r) => ({ key: r.key }),
  defaultModalDef: (r) => ({ key: r.key }),
  homeBannerDef: (r) => ({ key: r.key }),
  systemIconDef: (r) => ({ key: r.key }),
  synergyRule: (r) => ({ key: r.key }),
  eventDefinition: (r) => ({ key: r.key }),
  nftCollectionDef: (r) => ({ key: r.key }),
  gameDefinition: (r) => ({ type_key_version: { type: r.type, key: r.key, version: r.version } }),
  // After UUID PK migration: look up by key slug, not by auto-generated UUID id.
  effectDef: (r) => ({ key: r.key }),
  powerDef: (r) => ({ key: r.key }),
  questDef: (r) => ({ key: r.key }),
  checkInDef: (r) => ({ key: r.key }),
  giftDef: (r) => ({ key: r.key }),
  currency: (r) => ({ key: r.key }),
  regionDefinition: (r) => ({ key: r.key }),
  locationDefinition: (r) => ({ key: r.key }),
  buildingDef: (r) => ({ key: r.key }),
  roomDef: (r) => ({ key: r.key }),
  entityDefinition: (r) => ({ key: r.key }),
  missionCategoryDef: (r) => ({ key: r.key }),
  missionDef: (r) => ({ key: r.key }),
  recipeDef: (r) => ({ key: r.key }),
  lootboxDef: (r) => ({ key: r.key }),
  bundleDef: (r) => ({ key: r.key }),
  itemDefinition: (r) => ({ key: r.key }),
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
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Build displayDef key → UUID map for displayDefId resolution.
      const displayDefs = await (this.prisma as any).displayDef.findMany({ select: { id: true, key: true } });
      const displayDefByKey = new Map(displayDefs.map((d: any) => [d.key, d.id]));

      const parents = records.filter((r) => !r.parentId);
      const children = records.filter((r) => r.parentId);

      // Upsert parents first so their UUIDs are stable before children reference them.
      for (const raw of parents) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);
        const rawDisplayId: string | null = raw.displayDefId ?? null;
        if (rawDisplayId !== null && !UUID_V4.test(rawDisplayId)) {
          record.displayDefId = displayDefByKey.get(rawDisplayId) ?? null;
          if (record.displayDefId === null) {
            this.logger.warn(`upsertTable(missionCategoryDef): displayDefId slug "${rawDisplayId}" not found — setting null`);
          }
        }
        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        await model.upsert({ where, update: rest, create: record });
      }

      // Build key → UUID map so child parentId slugs can be resolved.
      const categoryRows = await model.findMany({ select: { id: true, key: true } });
      const categoryUuidByKey = new Map(categoryRows.map((r: any) => [r.key, r.id]));

      for (const raw of children) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);
        // parentId may arrive as slug; after UUID migration it must be UUID.
        const rawParentId: string | null = raw.parentId ?? null;
        if (rawParentId !== null && !UUID_V4.test(rawParentId)) {
          record.parentId = categoryUuidByKey.get(rawParentId) ?? null;
          if (record.parentId === null) {
            this.logger.warn(
              `upsertTable(missionCategoryDef): parentId slug "${rawParentId}" not found — setting null`,
            );
          }
        }
        const rawDisplayId2: string | null = raw.displayDefId ?? null;
        if (rawDisplayId2 !== null && !UUID_V4.test(rawDisplayId2)) {
          record.displayDefId = displayDefByKey.get(rawDisplayId2) ?? null;
          if (record.displayDefId === null) {
            this.logger.warn(`upsertTable(missionCategoryDef): displayDefId slug "${rawDisplayId2}" not found — setting null`);
          }
        }
        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        await model.upsert({ where, update: rest, create: record });
      }
      return;
    }

    if (modelName === 'missionDef') {
      // missionCategoryDefId and displayDefId FKs may arrive as slugs; must be UUIDs.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const missionCategories = await (this.prisma as any).missionCategoryDef.findMany({
        select: { id: true, key: true },
      });
      const categoryUuidByKey = new Map(missionCategories.map((r: any) => [r.key, r.id]));
      const displayDefs = await (this.prisma as any).displayDef.findMany({ select: { id: true, key: true } });
      const displayDefByKey = new Map(displayDefs.map((d: any) => [d.key, d.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);
        const rawCatId: string | null = raw.missionCategoryDefId ?? null;
        if (rawCatId !== null && !UUID_V4.test(rawCatId)) {
          record.missionCategoryDefId = categoryUuidByKey.get(rawCatId) ?? null;
          if (record.missionCategoryDefId === null) {
            this.logger.warn(
              `upsertTable(missionDef): missionCategoryDefId slug "${rawCatId}" not found — setting null`,
            );
          }
        }
        const rawDisplayId: string | null = raw.displayDefId ?? null;
        if (rawDisplayId !== null && !UUID_V4.test(rawDisplayId)) {
          record.displayDefId = displayDefByKey.get(rawDisplayId) ?? null;
          if (record.displayDefId === null) {
            this.logger.warn(`upsertTable(missionDef): displayDefId slug "${rawDisplayId}" not found — setting null`);
          }
        }
        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        await model.upsert({ where, update: rest, create: record });
      }
      return;
    }

    if (modelName === 'recipeDef') {
      // displayDefId FK may arrive as slug; after UUID migration it must be UUID.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const displayDefs = await (this.prisma as any).displayDef.findMany({ select: { id: true, key: true } });
      const displayDefByKey = new Map(displayDefs.map((d: any) => [d.key, d.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);
        const rawDisplayId: string | null = raw.displayDefId ?? null;
        if (rawDisplayId !== null && !UUID_V4.test(rawDisplayId)) {
          record.displayDefId = displayDefByKey.get(rawDisplayId) ?? null;
          if (record.displayDefId === null) {
            this.logger.warn(`upsertTable(recipeDef): displayDefId slug "${rawDisplayId}" not found — setting null`);
          }
        }
        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        try {
          await model.upsert({ where, update: rest, create: record });
        } catch (err: any) {
          this.logger.error(`upsertTable: failed to upsert recipeDef (where=${JSON.stringify(where)}): ${err?.message}`);
          throw err;
        }
      }
      return;
    }

    if (modelName === 'buildingDef') {
      // displayDefId FK may arrive as slug; after UUID migration it must be UUID.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const displayDefs = await (this.prisma as any).displayDef.findMany({ select: { id: true, key: true } });
      const displayDefByKey = new Map(displayDefs.map((d: any) => [d.key, d.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);
        const rawDisplayId: string | null = raw.displayDefId ?? null;
        if (rawDisplayId !== null && !UUID_V4.test(rawDisplayId)) {
          record.displayDefId = displayDefByKey.get(rawDisplayId) ?? null;
          if (record.displayDefId === null) {
            this.logger.warn(`upsertTable(buildingDef): displayDefId slug "${rawDisplayId}" not found — setting null`);
          }
        }
        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        try {
          await model.upsert({ where, update: rest, create: record });
        } catch (err: any) {
          this.logger.error(`upsertTable: failed to upsert buildingDef (where=${JSON.stringify(where)}): ${err?.message}`);
          throw err;
        }
      }
      return;
    }

    if (modelName === 'locationDefinition') {
      // UUID PK migration: LocationDefinition.regionId may arrive as a slug.
      // regionDefinition is seeded before locationDefinition (see SEED_TABLE_ORDER),
      // so we can resolve slug → UUID via a single DB query.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const regionDefs = await this.prisma.regionDefinition.findMany({ select: { id: true, key: true } });
      const regionDefByKey = new Map(regionDefs.map((r) => [r.key, r.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);

        const rawRegionId: string | null = raw.regionId ?? null;
        if (rawRegionId !== null && !UUID_V4.test(rawRegionId)) {
          record.regionId = regionDefByKey.get(rawRegionId) ?? null;
          if (record.regionId === null) {
            this.logger.warn(
              `upsertTable(locationDefinition): regionId slug "${rawRegionId}" not found in region_definitions — setting null`,
            );
          }
        }

        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        try {
          await model.upsert({ where, update: rest, create: record });
        } catch (err: any) {
          this.logger.error(
            `upsertTable: failed to upsert locationDefinition (where=${JSON.stringify(where)}): ${err?.message}`,
          );
          throw err;
        }
      }
      return;
    }

    if (modelName === 'itemDefinition') {
      // UUID PK migration: ItemDefinition.lootboxDefId may arrive as a slug
      // in legacy seed records.  lootboxDef is seeded before itemDefinition (see
      // SEED_TABLE_ORDER), so we can resolve slug → UUID via a single DB query.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const lootboxDefs = await (this.prisma as any).lootboxDef.findMany({ select: { id: true, key: true } });
      const lootboxDefByKey = new Map(lootboxDefs.map((l: any) => [l.key, l.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const record = this.normalizeDates(base);

        // Resolve slug lootboxDefId → UUID. If already a UUID or null, leave it.
        const rawLootboxDefId: string | null = raw.lootboxDefId ?? null;
        if (rawLootboxDefId !== null && !UUID_V4.test(rawLootboxDefId)) {
          record.lootboxDefId = lootboxDefByKey.get(rawLootboxDefId) ?? null;
          if (record.lootboxDefId === null) {
            this.logger.warn(
              `upsertTable(itemDefinition): lootboxDefId slug "${rawLootboxDefId}" not found in lootbox_defs — setting null`,
            );
          }
        }

        const where = buildWhere(record);
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = record;
        try {
          await model.upsert({ where, update: rest, create: record });
        } catch (err: any) {
          this.logger.error(
            `upsertTable: failed to upsert itemDefinition (where=${JSON.stringify(where)}): ${err?.message}`,
          );
          throw err;
        }
      }
      return;
    }

    if (modelName === 'powerDef') {
      // PowerDef special handling:
      //  1. Resolve effectDefId slug → UUID (effectDef is seeded before powerDef).
      //  2. Strip stale fields that no longer exist in the schema (defaultDailyLimit).
      //  3. Use Prisma relation syntax for effectDef to avoid checked-input conflicts.
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const effectDefs = await this.prisma.effectDef.findMany({ select: { id: true, key: true } });
      const effectDefByKey = new Map(effectDefs.map((e) => [e.key, e.id]));

      for (const raw of records) {
        const base = transform ? transform(raw) : raw;
        const normalized = this.normalizeDates(base);

        // Resolve slug effectDefId → UUID.  If already a UUID, leave it as-is.
        let resolvedEffectDefId: string | null = normalized.effectDefId ?? null;
        if (resolvedEffectDefId !== null && !UUID_V4.test(resolvedEffectDefId)) {
          resolvedEffectDefId = effectDefByKey.get(resolvedEffectDefId) ?? null;
          if (resolvedEffectDefId === null) {
            this.logger.warn(
              `upsertTable(powerDef): effectDefId slug "${normalized.effectDefId}" not found in effect_defs — setting null`,
            );
          }
        }

        // Build a clean record: strip stale fields, keep valid scalars.
        const {
          id: _id,
          createdAt: _ca,
          updatedAt: _ua,
          effectDefId: _eId,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          defaultDailyLimit: _ddl,
          ...scalarRest
        } = normalized as any;

        // Use raw SQL to bypass Prisma's runtime input validation for PowerDef.
        // PowerDef has two relations (effectDef + grants) that make the checked-input
        // type ambiguous — raw SQL is the simplest stable upsert path.
        const id = _id ?? crypto.randomUUID();
        try {
          await this.prisma.$executeRaw`
            INSERT INTO power_defs (
              id, key, name, description, "powerType", "effectDefId",
              "defaultValue", "defaultValueMode", "defaultDurationMinutes",
              "chargeConfig", "defaultScope", selection, enabled,
              "createdAt", "updatedAt"
            ) VALUES (
              ${id},
              ${scalarRest.key},
              ${scalarRest.name},
              ${scalarRest.description ?? null},
              ${scalarRest.powerType},
              ${resolvedEffectDefId},
              ${scalarRest.defaultValue ?? 0},
              ${scalarRest.defaultValueMode ?? 'percent_add'},
              ${scalarRest.defaultDurationMinutes ?? 30},
              ${scalarRest.chargeConfig ? JSON.stringify(scalarRest.chargeConfig) : null}::jsonb,
              ${scalarRest.defaultScope ?? 'global'},
              ${scalarRest.selection ? JSON.stringify(scalarRest.selection) : null}::jsonb,
              ${scalarRest.enabled ?? true},
              NOW(), NOW()
            )
            ON CONFLICT (key) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              "powerType" = EXCLUDED."powerType",
              "effectDefId" = EXCLUDED."effectDefId",
              "defaultValue" = EXCLUDED."defaultValue",
              "defaultValueMode" = EXCLUDED."defaultValueMode",
              "defaultDurationMinutes" = EXCLUDED."defaultDurationMinutes",
              "chargeConfig" = EXCLUDED."chargeConfig",
              "defaultScope" = EXCLUDED."defaultScope",
              selection = EXCLUDED.selection,
              enabled = EXCLUDED.enabled,
              "updatedAt" = NOW()
          `;
        } catch (err: any) {
          this.logger.error(
            `upsertTable: failed to upsert powerDef key="${scalarRest.key}": ${err?.message}`,
          );
          throw err;
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
