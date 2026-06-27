import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NftOwnershipService, SupportedChain } from './nft-ownership.service';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { NftAssetCacheService, nftAssetRowToMetadata } from './nft-asset-cache.service';
import { buildEntityDataFromNftMetadata } from './nft-entity-builder';
import { buildLocationDataFromNftMetadata } from './nft-location-builder';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NftImageImportService } from './nft-image-import.service';
import { LocationService } from '../location/location.service';
import { PowerGrantService } from '../global-power/power-grant.service';
import {
  PatchBuilder,
  fetchFullLocation,
  fetchBuildingJobs,
  fetchCurrencyIds,
} from '../commands/patch-builder';

export interface CreateCollectionDto {
  id: string;
  name: string;
  chain: string;
  collectionId: string;
  entityDefinitionId?: string;
  locationDefinitionId?: string;
  itemDefinitionId?: string;
  mintMode?: string;
  data?: Record<string, any>;
}

export interface UpdateCollectionDto {
  name?: string;
  entityDefinitionId?: string;
  locationDefinitionId?: string;
  itemDefinitionId?: string;
  mintMode?: string;
  active?: boolean;
  data?: Record<string, any>;
}

export interface SyncResult {
  claimed: number;
  alreadyClaimed: number;
  notImported: number;
  unclaimed: number;
  /** Collections that were skipped from unclaim reconciliation because at least
   *  one wallet's chain query failed. Useful for surfacing partial-sync state. */
  reconciliationSkippedCollections: string[];
  entities: any[];
  locations: any[];
}

function extractDisplayImageUrl(display: unknown): string | undefined {
  if (display !== null && typeof display === 'object' && !Array.isArray(display)) {
    const url = (display as Record<string, unknown>).imageUrl;
    return typeof url === 'string' ? url : undefined;
  }
  return undefined;
}

function serializeEntity(entity: any) {
  const progression = (entity.progression as any) || {};
  if (progression && typeof progression.xp === 'bigint') {
    progression.xp = Number(progression.xp);
  }
  const display = (entity.display as any) || {};
  const state = (entity.state as any) || {};
  return {
    ...entity,
    progression,
    name: display.name || entity.speciesId || 'Entity',
    level: progression.level || 1,
    xp: Number(progression.xp || 0),
    status: state.status || 'idle',
    ...(display.imageUrl ? { imageUrl: display.imageUrl } : {}),
  };
}

@Injectable()
export class NftCollectionService {
  private readonly logger = new Logger(NftCollectionService.name);
  private readonly createInstancesJobs = new Map<string, {
    status: 'idle' | 'running' | 'done' | 'error';
    total: number;
    processed: number;
    upserted: number;
    failed: number;
    startedAt?: string;
    finishedAt?: string;
  }>();

  constructor(
    private prisma: PrismaService,
    private nftOwnership: NftOwnershipService,
    private cardanoProvider: CardanoOwnershipProvider,
    private nftAssetCache: NftAssetCacheService,
    private pubsub: PubSubService,
    private nftImageImport: NftImageImportService,
    private locationService: LocationService,
    private powerGrantService: PowerGrantService,
  ) {}

  async listCollections() {
    const collections = await (this.prisma as any).nftCollectionDef.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { nftAssets: true } } },
    });

    const entityCounts: { nftCollectionDefId: string; count: number }[] = await (this.prisma as any).$queryRaw`
      SELECT "nftCollectionDefId", COUNT(*)::int AS count
      FROM entities
      WHERE "nftCollectionDefId" IS NOT NULL
      GROUP BY "nftCollectionDefId"
    `;

    const locationCounts: { collectionId: string; count: number }[] = await (this.prisma as any).$queryRaw`
      SELECT na."collectionId", COUNT(*)::int AS count
      FROM location_instances li
      JOIN nft_assets na ON na."nftAssetId" = li."nftAssetId"
      WHERE li."nftAssetId" IS NOT NULL
      GROUP BY na."collectionId"
    `;

    const entityCountMap = new Map(entityCounts.map(r => [r.nftCollectionDefId, Number(r.count)]));
    const locationCountMap = new Map(locationCounts.map(r => [r.collectionId, Number(r.count)]));

    return collections.map((c: any) => ({
      ...c,
      instanceCount: entityCountMap.get(c.id) ?? locationCountMap.get(c.id) ?? 0,
    }));
  }

  private validateCollectionMode(
    entityDefinitionId?: string | null,
    locationDefinitionId?: string | null,
    itemDefinitionId?: string | null,
  ): void {
    const modes = [!!entityDefinitionId, !!locationDefinitionId, !!itemDefinitionId].filter(Boolean).length;
    if (modes > 1) {
      throw new BadRequestException(
        `A collection must target exactly one of: entityDefinitionId, locationDefinitionId, or itemDefinitionId`,
      );
    }
    if (modes === 0) {
      throw new BadRequestException(
        `A collection must have exactly one of: entityDefinitionId, locationDefinitionId, or itemDefinitionId`,
      );
    }
  }

  async createCollection(dto: CreateCollectionDto) {
    this.validateCollectionMode(dto.entityDefinitionId, dto.locationDefinitionId, dto.itemDefinitionId);
    return (this.prisma as any).nftCollectionDef.create({
      data: {
        id: dto.id,
        name: dto.name,
        chain: dto.chain,
        collectionId: dto.collectionId,
        entityDefinitionId: dto.entityDefinitionId ?? null,
        locationDefinitionId: dto.locationDefinitionId ?? null,
        itemDefinitionId: dto.itemDefinitionId ?? null,
        mintMode: dto.mintMode ?? 'one_per_token',
        data: dto.data ?? {},
      },
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    const existing = await (this.prisma as any).nftCollectionDef.findFirst({ where: { OR: [{ id }, { key: id }] } });
    if (!existing) throw new NotFoundException(`Collection "${id}" not found`);

    const nextEntityId = 'entityDefinitionId' in dto ? dto.entityDefinitionId : existing.entityDefinitionId;
    const nextLocationId = 'locationDefinitionId' in dto ? dto.locationDefinitionId : existing.locationDefinitionId;
    const nextItemId = 'itemDefinitionId' in dto ? dto.itemDefinitionId : existing.itemDefinitionId;
    this.validateCollectionMode(nextEntityId, nextLocationId, nextItemId);

    const updated = await (this.prisma as any).nftCollectionDef.update({
      where: { id: existing.id },
      data: dto,
    });

    const isBeingDisabled = 'active' in dto && dto.active === false && existing.active !== false;
    if (isBeingDisabled) {
      this.pushCollectionDisabledDeltas(id).catch((err) =>
        this.logger.warn(`Failed to push disabled-collection deltas for "${id}": ${err}`),
      );
    }

    const isBeingEnabled = 'active' in dto && dto.active === true && existing.active === false;
    if (isBeingEnabled) {
      this.pushCollectionEnabledDeltas(id).catch((err) =>
        this.logger.warn(`Failed to push enabled-collection deltas for "${id}": ${err}`),
      );
    }

    return updated;
  }

  async deactivateCollection(id: string) {
    const existing = await (this.prisma as any).nftCollectionDef.findFirst({ where: { OR: [{ id }, { key: id }] } });
    if (!existing) throw new NotFoundException(`Collection "${id}" not found`);
    await (this.prisma as any).nftCollectionDef.update({
      where: { id: existing.id },
      data: { active: false },
    });

    if (existing.active !== false) {
      this.pushCollectionDisabledDeltas(id).catch((err) =>
        this.logger.warn(`Failed to push disabled-collection deltas for "${id}": ${err}`),
      );
    }
  }

  /**
   * After a collection is disabled, find all affected entities, locations, and
   * items that were backed by this collection and push delete patches to every
   * user who owns them so active sessions reflect the change without a reload.
   */
  private async pushCollectionDisabledDeltas(collectionId: string): Promise<void> {
    // Collect delete patches per user: Map<userId, Patch[]>
    const patchesByUser = new Map<string, Array<{ op: 'delete'; entity: string; id: string }>>();

    const addPatch = (userId: string, entity: string, id: string) => {
      const list = patchesByUser.get(userId) ?? [];
      list.push({ op: 'delete', entity, id });
      patchesByUser.set(userId, list);
    };

    // --- Entities ---
    const affectedEntities = await (this.prisma as any).entity.findMany({
      where: { nftCollectionDefId: collectionId },
      select: { id: true, ownerUserId: true },
    });
    for (const e of affectedEntities) {
      if (e.ownerUserId) addPatch(e.ownerUserId, 'entity', e.id);
    }

    // --- Locations (linked via nftAsset → collectionId) ---
    const collectionAssets = await (this.prisma as any).nftAsset.findMany({
      where: { collectionId },
      select: { nftAssetId: true },
    });
    if (collectionAssets.length > 0) {
      const assetIds: string[] = collectionAssets.map((a: any) => a.nftAssetId as string);
      const affectedLocations = await (this.prisma as any).locationInstance.findMany({
        where: { nftAssetId: { in: assetIds } },
        select: { id: true, ownerUserId: true },
      });
      for (const loc of affectedLocations) {
        if (loc.ownerUserId) addPatch(loc.ownerUserId, 'location', loc.id);
      }
    }

    // --- Items ---
    const affectedItems = await (this.prisma as any).itemInstance.findMany({
      where: { nftCollectionDefId: collectionId },
      select: { id: true, userId: true },
    });
    for (const item of affectedItems) {
      if (item.userId) addPatch(item.userId, 'item', item.id);
    }

    if (patchesByUser.size === 0) {
      this.logger.log(`pushCollectionDisabledDeltas: no affected sessions for collection "${collectionId}"`);
      return;
    }

    this.logger.log(
      `pushCollectionDisabledDeltas: pushing to ${patchesByUser.size} user(s) for collection "${collectionId}"`,
    );

    for (const [userId, patches] of patchesByUser) {
      try {
        const delta = await (this.prisma as any).playerDelta.create({
          data: { userId, patches: patches as any, ui: [] as any },
        });
        this.pubsub.publish(`player:${userId}`, {
          userId,
          deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
        });
      } catch (err) {
        this.logger.warn(`pushCollectionDisabledDeltas: failed for user ${userId}: ${err}`);
      }
    }
  }

  /**
   * After a collection is re-enabled, find all affected entities, locations, and
   * items that are backed by this collection and push upsert patches to every
   * user who owns them so active sessions see their assets return without a reload.
   */
  private async pushCollectionEnabledDeltas(collectionId: string): Promise<void> {
    const patchesByUser = new Map<string, any[]>();

    const addPatches = (userId: string, patches: any[]) => {
      const list = patchesByUser.get(userId) ?? [];
      list.push(...patches);
      patchesByUser.set(userId, list);
    };

    // --- Entities ---
    const affectedEntities = await (this.prisma as any).entity.findMany({
      where: { nftCollectionDefId: collectionId },
      select: { id: true, ownerUserId: true },
    });
    const entityIds = affectedEntities.filter((e: any) => e.ownerUserId).map((e: any) => e.id);

    if (entityIds.length > 0) {
      const fullEntities = await (this.prisma as any).entity.findMany({
        where: { id: { in: entityIds } },
        include: { equipment: true },
      });
      for (const e of fullEntities) {
        if (e.ownerUserId) {
          addPatches(e.ownerUserId, [{ op: 'upsert', entity: 'entity', id: e.id, data: serializeEntity(e) }]);
        }
      }
    }

    // --- Locations (linked via nftAsset → collectionId) ---
    const collectionAssets = await (this.prisma as any).nftAsset.findMany({
      where: { collectionId },
      select: { nftAssetId: true },
    });

    if (collectionAssets.length > 0) {
      const assetIds: string[] = collectionAssets.map((a: any) => a.nftAssetId as string);
      const affectedLocations = await (this.prisma as any).locationInstance.findMany({
        where: { nftAssetId: { in: assetIds }, ownerUserId: { not: null } },
        select: { id: true, ownerUserId: true },
      });

      if (affectedLocations.length > 0) {
        const currencyIds = await fetchCurrencyIds(this.prisma);
        const ownerIds: string[] = [...new Set<string>(affectedLocations.map((l: any) => l.ownerUserId as string))];
        const buildingJobsByUser = new Map<string, any[]>();
        for (const ownerId of ownerIds) {
          buildingJobsByUser.set(ownerId, await fetchBuildingJobs(this.prisma, ownerId));
        }

        for (const loc of affectedLocations) {
          const fullLocation = await fetchFullLocation(this.prisma, loc.id);
          if (fullLocation && loc.ownerUserId) {
            const pb = new PatchBuilder();
            pb.upsertLocation(fullLocation, buildingJobsByUser.get(loc.ownerUserId) ?? [], currencyIds);
            addPatches(loc.ownerUserId, pb.build());
          }
        }
      }
    }

    // --- Items ---
    const affectedItems = await (this.prisma as any).itemInstance.findMany({
      where: { nftCollectionDefId: collectionId, userId: { not: null } },
      include: { definition: true },
    });
    for (const item of affectedItems) {
      if (item.userId) {
        addPatches(item.userId, [{ op: 'upsert', entity: 'item', id: item.id, data: item }]);
      }
    }

    if (patchesByUser.size === 0) {
      this.logger.log(`pushCollectionEnabledDeltas: no affected sessions for collection "${collectionId}"`);
      return;
    }

    this.logger.log(
      `pushCollectionEnabledDeltas: pushing to ${patchesByUser.size} user(s) for collection "${collectionId}"`,
    );

    for (const [userId, patches] of patchesByUser) {
      try {
        const delta = await (this.prisma as any).playerDelta.create({
          data: { userId, patches: patches as any, ui: [] as any },
        });
        this.pubsub.publish(`player:${userId}`, {
          userId,
          deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
        });
      } catch (err) {
        this.logger.warn(`pushCollectionEnabledDeltas: failed for user ${userId}: ${err}`);
      }
    }
  }

  /**
   * Create game entity instances for all tokens in the collection whose
   * metadata is already cached in the NftAsset table. Does not call Blockfrost
   * directly — run POST /:id/import first to populate the cache, then call this.
   * fetchAndCache() is still invoked per asset so any cache-miss is filled on
   * demand, but the work list comes from the local DB rather than from the chain.
   */
  getCreateInstancesStatus(id: string) {
    return this.createInstancesJobs.get(id) ?? { status: 'idle' as const, total: 0, processed: 0, upserted: 0, failed: 0 };
  }

  async createInstances(id: string): Promise<{ started: true; total: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findFirst({ where: { OR: [{ id }, { key: id }] } });
    if (!collection) throw new NotFoundException(`Collection "${id}" not found`);
    if (!collection.entityDefinitionId && !collection.locationDefinitionId && !collection.itemDefinitionId) {
      throw new BadRequestException(`Collection "${id}" has neither entityDefinitionId, locationDefinitionId, nor itemDefinitionId`);
    }

    const cachedAssets = await (this.prisma as any).nftAsset.findMany({
      where: { collectionId: id },
      select: { nftAssetId: true },
    });

    if (cachedAssets.length === 0) {
      throw new BadRequestException(
        `No cached assets found for collection "${id}" — run POST /:id/import to populate the NftAsset cache first`,
      );
    }

    const nftAssetIds: string[] = cachedAssets.map((a: any) => a.nftAssetId as string);
    const total = nftAssetIds.length;

    this.createInstancesJobs.set(id, {
      status: 'running',
      total,
      processed: 0,
      upserted: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
    });

    this.logger.log(`Starting background instance creation of ${total} tokens for collection "${id}"`);

    const runner = collection.entityDefinitionId
      ? this.runEntityInstanceCreation(collection, nftAssetIds)
      : collection.locationDefinitionId
        ? this.runLocationInstanceCreation(collection, nftAssetIds)
        : this.runItemInstanceCreation(collection, nftAssetIds);

    runner.catch((err) => {
      this.logger.error(`Background instance creation failed for collection "${id}": ${err}`);
      const prev = this.createInstancesJobs.get(id);
      if (prev) {
        this.createInstancesJobs.set(id, { ...prev, status: 'error', finishedAt: new Date().toISOString() });
      }
    });

    return { started: true, total };
  }

  private async runEntityInstanceCreation(collection: any, nftAssetIds: string[]) {
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 300;
    let upserted = 0;
    let failed = 0;

    for (let i = 0; i < nftAssetIds.length; i += BATCH_SIZE) {
      const batch = nftAssetIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (nftAssetId) => {
          try {
            const existing = await (this.prisma as any).entity.findFirst({ where: { nftAssetId } });
            if (existing) {
              upserted++;
              return;
            }

            const cachedAsset = await this.nftAssetCache.fetchAndCache(nftAssetId);
            const meta = nftAssetRowToMetadata(cachedAsset);
            // Generate a deterministic seed for this entity so that RND stat
            // resolution (and future rebuilds) are reproducible.
            const entitySeed = Math.random() * 0x7fffffff | 0;
            const entityData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta, entitySeed);

            const createdEntity = await (this.prisma as any).entity.create({
              data: { ...entityData, seed: entitySeed, nftAssetId, nftCollectionDefId: collection.id },
            });

            await this.powerGrantService.syncNftGrants(createdEntity.id).catch((err) => {
              this.logger.error(`Failed to sync NFT grants for entity ${createdEntity.id}: ${err}`);
            });

            this.nftImageImport.invalidateKnownCidCache();
            upserted++;
          } catch (err) {
            this.logger.error(`Failed to create entity instance for NFT ${nftAssetId}: ${err}`);
            failed++;
          }
        }),
      );

      const processed = Math.min(i + BATCH_SIZE, nftAssetIds.length);
      const job = this.createInstancesJobs.get(collection.id);
      if (job) this.createInstancesJobs.set(collection.id, { ...job, processed, upserted, failed });

      if (processed % 100 === 0 || processed === nftAssetIds.length) {
        this.logger.log(
          `Entity instance creation progress [${collection.id}]: ${processed}/${nftAssetIds.length} — upserted: ${upserted}, failed: ${failed}`,
        );
      }

      if (i + BATCH_SIZE < nftAssetIds.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    this.createInstancesJobs.set(collection.id, {
      status: 'done',
      total: nftAssetIds.length,
      processed: nftAssetIds.length,
      upserted,
      failed,
      startedAt: this.createInstancesJobs.get(collection.id)?.startedAt,
      finishedAt: new Date().toISOString(),
    });

    this.logger.log(`Entity instance creation complete [${collection.id}]: upserted=${upserted}, failed=${failed}`);
  }

  private async runLocationInstanceCreation(collection: any, nftAssetIds: string[]) {
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 300;
    let upserted = 0;
    let failed = 0;

    for (let i = 0; i < nftAssetIds.length; i += BATCH_SIZE) {
      const batch = nftAssetIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (nftAssetId) => {
          try {
            const existing = await (this.prisma as any).locationInstance.findFirst({ where: { nftAssetId } });
            if (existing) {
              upserted++;
              return;
            }

            const cachedAsset = await this.nftAssetCache.fetchAndCache(nftAssetId);
            const meta = nftAssetRowToMetadata(cachedAsset);
            const locationData = buildLocationDataFromNftMetadata(collection, meta, nftAssetId);

            const newLoc = await (this.prisma as any).locationInstance.create({
              data: { ...locationData, ownerUserId: null, enabled: false },
            });
            // Provision NFT_UNIQUE power grants immediately so trigger handlers
            // can find a grant without requiring a manual admin resync.
            await this.powerGrantService.syncNftGrantsForLocation(newLoc.id).catch((err: any) => {
              this.logger.warn(`syncNftGrantsForLocation failed for ${newLoc.id}: ${err}`);
            });

            upserted++;
          } catch (err) {
            this.logger.error(`Failed to create location instance for NFT ${nftAssetId}: ${err}`);
            failed++;
          }
        }),
      );

      const processed = Math.min(i + BATCH_SIZE, nftAssetIds.length);
      const job = this.createInstancesJobs.get(collection.id);
      if (job) this.createInstancesJobs.set(collection.id, { ...job, processed, upserted, failed });

      if (processed % 100 === 0 || processed === nftAssetIds.length) {
        this.logger.log(
          `Location instance creation progress [${collection.id}]: ${processed}/${nftAssetIds.length} — upserted: ${upserted}, failed: ${failed}`,
        );
      }

      if (i + BATCH_SIZE < nftAssetIds.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    this.createInstancesJobs.set(collection.id, {
      status: 'done',
      total: nftAssetIds.length,
      processed: nftAssetIds.length,
      upserted,
      failed,
      startedAt: this.createInstancesJobs.get(collection.id)?.startedAt,
      finishedAt: new Date().toISOString(),
    });

    this.logger.log(`Location instance creation complete [${collection.id}]: upserted=${upserted}, failed=${failed}`);
  }

  /**
   * Item instances cannot be bulk pre-minted because `ItemInstance.userId` is
   * required — every item must belong to a specific player from the moment it
   * is created.  Item NFT instances are therefore created on-demand during
   * `syncUserCollections` / `claimFromCachedOwnership` when a player's wallet
   * ownership is confirmed.
   *
   * This runner completes immediately so the job status is reported correctly,
   * and logs a clear explanation so operators know why no rows were written.
   */
  private async runItemInstanceCreation(collection: any, nftAssetIds: string[]) {
    this.logger.log(
      `Item instance creation [${collection.id}]: ItemInstances require a known owner and are created on-demand during player sync — no bulk pre-mint performed (${nftAssetIds.length} token(s) will be provisioned when the owning player next syncs their wallet).`,
    );
    this.createInstancesJobs.set(collection.id, {
      status: 'done',
      total: nftAssetIds.length,
      processed: nftAssetIds.length,
      upserted: 0,
      failed: 0,
      startedAt: this.createInstancesJobs.get(collection.id)?.startedAt,
      finishedAt: new Date().toISOString(),
    });
  }

  /**
   * DB-only login reconciliation: matches NftAsset.ownerAddress against the
   * user's linked wallets and claims/transfers any entity or location rows that
   * belong to this user according to the cached ownership data.
   *
   * No chain RPC is made — relies on ownerAddress populated by the nightly
   * entity-centric sweep.  New entity rows are NOT created here; use
   * syncUserCollections for that (e.g. first-time wallet link).
   */
  async claimFromCachedOwnership(userId: string): Promise<{ claimed: number; transfers: number }> {
    const wallets = await (this.prisma as any).linkedWallet.findMany({
      where: { userId },
      select: { address: true },
    });
    if (wallets.length === 0) return { claimed: 0, transfers: 0 };

    const rawAddresses: string[] = wallets.map((w: any) => w.address as string);
    // linked_wallets stores the stake key as `address` for Cardano (enforced at
    // write time and backfilled by the migration script).  nft_assets.ownerAddress
    // is also stored as a stake key by the sweep.  A direct IN-list match is
    // therefore sufficient — no address-expansion workaround is needed.
    const addresses = rawAddresses;

    const ownedAssets = await (this.prisma as any).nftAsset.findMany({
      where: { ownerAddress: { in: addresses } },
      select: { nftAssetId: true, collectionId: true },
    });
    if (ownedAssets.length === 0) return { claimed: 0, transfers: 0 };

    const collectionIds = [...new Set(ownedAssets.map((a: any) => a.collectionId as string))];
    const collections = await (this.prisma as any).nftCollectionDef.findMany({
      where: { id: { in: collectionIds }, active: true },
      select: { id: true, locationDefinitionId: true, itemDefinitionId: true },
    });
    const collectionMap = new Map<string, any>(collections.map((c: any) => [c.id as string, c]));

    const claimedEntityIds: string[] = [];
    const claimedLocationIds: string[] = [];
    const claimedItemIds: string[] = [];
    const prevOwnerDeletes: Array<{ userId: string; entity: string; id: string }> = [];
    let claimed = 0;
    let transfers = 0;

    for (const asset of ownedAssets) {
      const collection = collectionMap.get(asset.collectionId);
      if (!collection) continue;
      try {
        if (collection.locationDefinitionId) {
          const loc = await (this.prisma as any).locationInstance.findFirst({
            where: { nftAssetId: asset.nftAssetId },
            select: { id: true, ownerUserId: true },
          });
          if (!loc || loc.ownerUserId === userId) continue;
          const prevId: string | null = loc.ownerUserId;
          const autoActivate = await this.locationService.shouldAutoActivate(userId);
          await (this.prisma as any).locationInstance.update({
            where: { id: loc.id },
            data: { ownerUserId: userId, enabled: autoActivate },
          });
          claimedLocationIds.push(loc.id);
          if (prevId) {
            prevOwnerDeletes.push({ userId: prevId, entity: 'location', id: loc.id });
            transfers++;
          }
          claimed++;
        } else if (collection.itemDefinitionId) {
          const itemInst = await (this.prisma as any).itemInstance.findFirst({
            where: { nftAssetId: asset.nftAssetId },
            select: { id: true, userId: true },
          });
          if (!itemInst || itemInst.userId === userId) continue;
          const prevId: string | null = itemInst.userId;
          await (this.prisma as any).itemInstance.update({
            where: { id: itemInst.id },
            data: { userId },
          });
          claimedItemIds.push(itemInst.id);
          if (prevId) {
            prevOwnerDeletes.push({ userId: prevId, entity: 'item', id: itemInst.id });
            transfers++;
          }
          claimed++;
        } else {
          const entity = await (this.prisma as any).entity.findFirst({
            where: { nftAssetId: asset.nftAssetId },
            select: { id: true, ownerUserId: true },
          });
          if (!entity || entity.ownerUserId === userId) continue;
          const prevId: string | null = entity.ownerUserId;
          await (this.prisma as any).entity.update({
            where: { id: entity.id },
            data: { ownerUserId: userId },
          });
          this.nftImageImport.invalidateKnownCidCache();
          claimedEntityIds.push(entity.id);
          if (prevId) {
            prevOwnerDeletes.push({ userId: prevId, entity: 'entity', id: entity.id });
            transfers++;
          }
          claimed++;
        }
      } catch (err) {
        this.logger.error(`claimFromCachedOwnership: failed for ${asset.nftAssetId}: ${err}`);
      }
    }

    if (claimed === 0) return { claimed: 0, transfers };

    for (const { userId: prevId, entity, id } of prevOwnerDeletes) {
      try {
        const delta = await (this.prisma as any).playerDelta.create({
          data: {
            userId: prevId,
            patches: [{ op: 'delete', entity, id }] as any,
            ui: [] as any,
          },
        });
        this.pubsub.publish(`player:${prevId}`, { userId: prevId, deltaId: delta.id.toString() });
      } catch (err) {
        this.logger.warn(`claimFromCachedOwnership: failed to notify previous owner ${prevId}: ${err}`);
      }
    }

    const allPatches: any[] = [];

    if (claimedEntityIds.length > 0) {
      try {
        const fullEntities = await (this.prisma as any).entity.findMany({
          where: { id: { in: claimedEntityIds } },
          include: { equipment: true },
        });
        for (const e of fullEntities) {
          allPatches.push({ op: 'upsert', entity: 'entity', id: e.id, data: serializeEntity(e) });
        }
      } catch (err) {
        this.logger.error(`claimFromCachedOwnership: failed to load entity rows: ${err}`);
      }
    }

    if (claimedLocationIds.length > 0) {
      try {
        const currencyIds = await fetchCurrencyIds(this.prisma);
        const buildingJobs = await fetchBuildingJobs(this.prisma, userId);
        for (const locationId of claimedLocationIds) {
          const fullLocation = await fetchFullLocation(this.prisma, locationId);
          if (fullLocation) {
            const pb = new PatchBuilder();
            pb.upsertLocation(fullLocation, buildingJobs, currencyIds);
            allPatches.push(...pb.build());
          }
        }
      } catch (err) {
        this.logger.error(`claimFromCachedOwnership: failed to load location rows: ${err}`);
      }
    }

    if (claimedItemIds.length > 0) {
      try {
        const fullItems = await (this.prisma as any).itemInstance.findMany({
          where: { id: { in: claimedItemIds } },
          include: { definition: true },
        });
        for (const item of fullItems) {
          allPatches.push({ op: 'upsert', entity: 'item', id: item.id, data: item });
        }
      } catch (err) {
        this.logger.error(`claimFromCachedOwnership: failed to load item rows: ${err}`);
      }
    }

    if (allPatches.length > 0) {
      try {
        const delta = await (this.prisma as any).playerDelta.create({
          data: { userId, patches: allPatches as any, ui: [] as any },
        });
        this.pubsub.publish(`player:${userId}`, { userId, deltaId: delta.id.toString() });
        this.logger.log(
          `claimFromCachedOwnership: user ${userId} — claimed=${claimed} transfers=${transfers}`,
        );
      } catch (err) {
        this.logger.error(`claimFromCachedOwnership: failed to push delta: ${err}`);
      }
    }

    return { claimed, transfers };
  }

  async syncUserCollections(userId: string): Promise<SyncResult> {
    const wallets = await (this.prisma as any).linkedWallet.findMany({ where: { userId } });
    const collections = await (this.prisma as any).nftCollectionDef.findMany({ where: { active: true } });

    let claimed = 0;
    let alreadyClaimed = 0;
    let notImported = 0;
    let unclaimed = 0;
    const claimedEntityIds: string[] = [];
    const unclaimedEntityIds: string[] = [];
    const claimedLocationIds: string[] = [];
    const unclaimedLocationIds: string[] = [];
    const newEntities: any[] = [];
    const newLocations: any[] = [];
    const reconciliationSkippedCollections: string[] = [];

    for (const collection of collections) {
      const matchingWallets = wallets.filter((w: any) => w.chain === collection.chain);

      const ownedAssetIdsThisCollection = new Set<string>();
      let isDefinitive = true;

      if (collection.locationDefinitionId) {
        // ── Location-backed collection (e.g. Derp Outposts) ──────────────────
        for (const wallet of matchingWallets) {
          const ownershipResult = await this.nftOwnership.getOwnedInCollectionWithResult(
            collection.chain as SupportedChain,
            wallet.address,
            collection.collectionId,
          );
          if (!ownershipResult.isDefinitive) {
            isDefinitive = false;
            continue;
          }
          const ownedAssets = ownershipResult.assets;

          for (const asset of ownedAssets) {
            const nftAssetId = `${collection.chain}:${collection.collectionId}:${asset.assetId}`;
            ownedAssetIdsThisCollection.add(nftAssetId);

            const existingLocation = await (this.prisma as any).locationInstance.findFirst({
              where: { nftAssetId },
            });

            if (!existingLocation) {
              // No location row yet — create one on-demand (no pre-import step needed for locations).
              // fetchAndCache throws if Blockfrost fails; that error propagates to the outer catch
              // and the location is not created (no silent fallback).
              try {
                const cachedAsset = await this.nftAssetCache.fetchAndCache(nftAssetId);
                const meta = nftAssetRowToMetadata(cachedAsset);

                const locationData = buildLocationDataFromNftMetadata(collection, meta, nftAssetId);
                const autoActivate = await this.locationService.shouldAutoActivate(userId);
                const created = await (this.prisma as any).locationInstance.create({
                  data: {
                    ...locationData,
                    ownerUserId: userId,
                    enabled: autoActivate,
                  },
                });
                // Provision NFT_UNIQUE power grants immediately so trigger
                // handlers can resolve a grant without a manual admin resync.
                await this.powerGrantService.syncNftGrantsForLocation(created.id).catch((err: any) => {
                  this.logger.warn(`syncNftGrantsForLocation failed for ${created.id}: ${err}`);
                });
                this.nftImageImport.prewarmThumbnail(meta.imageUrl);
                claimed++;
                claimedLocationIds.push(created.id);
                newLocations.push({
                  id: created.id,
                  nftAssetId,
                  collectionName: collection.name,
                  chain: collection.chain,
                  assetId: asset.assetId,
                });
              } catch (err) {
                this.logger.error(`Failed to create location for NFT ${nftAssetId}: ${err}`);
              }
              continue;
            }

            if (existingLocation.ownerUserId === userId) {
              alreadyClaimed++;
              continue;
            }

            // Transfer ownership to current wallet holder.
            const previousOwnerId = existingLocation.ownerUserId;
            try {
              const autoActivate = await this.locationService.shouldAutoActivate(userId);
              await (this.prisma as any).locationInstance.update({
                where: { id: existingLocation.id },
                data: { ownerUserId: userId, enabled: autoActivate },
              });
              claimed++;
              claimedLocationIds.push(existingLocation.id);
              newLocations.push({
                id: existingLocation.id,
                nftAssetId,
                collectionName: collection.name,
                chain: collection.chain,
                assetId: asset.assetId,
              });

              if (previousOwnerId) {
                try {
                  await (this.prisma as any).playerDelta.create({
                    data: {
                      userId: previousOwnerId,
                      patches: [{ op: 'delete', entity: 'location', id: existingLocation.id }] as any,
                      ui: [] as any,
                    },
                  });
                  this.pubsub.publish(`player:${previousOwnerId}`, {
                    userId: previousOwnerId,
                    deltaId: 'transfer',
                  });
                } catch (err) {
                  this.logger.warn(`Failed to notify previous owner ${previousOwnerId} of location transfer: ${err}`);
                }
              }
            } catch (err) {
              this.logger.error(`Failed to transfer location for NFT ${nftAssetId}: ${err}`);
            }
          }
        }

        // Reconciliation: unclaim location instances the user holds for this
        // collection that are no longer present in their wallet.
        if (isDefinitive) {
          const collectionPrefix = `${collection.chain}:${collection.collectionId}:`;
          const userOwnedLocations = await (this.prisma as any).locationInstance.findMany({
            where: {
              ownerUserId: userId,
              nftAssetId: { startsWith: collectionPrefix },
            },
            select: { id: true, nftAssetId: true },
          });

          for (const loc of userOwnedLocations) {
            if (loc.nftAssetId && !ownedAssetIdsThisCollection.has(loc.nftAssetId)) {
              try {
                await (this.prisma as any).locationInstance.update({
                  where: { id: loc.id },
                  data: { ownerUserId: null },
                });
                unclaimed++;
                unclaimedLocationIds.push(loc.id);
              } catch (err) {
                this.logger.error(`Failed to unclaim location ${loc.id}: ${err}`);
              }
            }
          }
        } else if (matchingWallets.length > 0) {
          reconciliationSkippedCollections.push(collection.id);
        }
      } else {
        // ── Entity-backed collection (existing behaviour) ─────────────────────
        for (const wallet of matchingWallets) {
          const ownershipResult = await this.nftOwnership.getOwnedInCollectionWithResult(
            collection.chain as SupportedChain,
            wallet.address,
            collection.collectionId,
          );
          if (!ownershipResult.isDefinitive) {
            isDefinitive = false;
            continue;
          }
          const ownedAssets = ownershipResult.assets;

          for (const asset of ownedAssets) {
            const nftAssetId = `${collection.chain}:${collection.collectionId}:${asset.assetId}`;
            ownedAssetIdsThisCollection.add(nftAssetId);

            let existingEntity = await (this.prisma as any).entity.findFirst({
              where: { nftAssetId },
            });

            if (!existingEntity) {
              if (collection.chain !== 'CARDANO') {
                notImported++;
                continue;
              }
              try {
                // fetchAndCache throws if Blockfrost fails — propagates to outer catch (notImported++).
                const cachedAsset = await this.nftAssetCache.fetchAndCache(nftAssetId);
                const meta = nftAssetRowToMetadata(cachedAsset);
                const entityData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta);
                try {
                  existingEntity = await (this.prisma as any).entity.create({
                    data: {
                      ...entityData,
                      nftAssetId,
                      nftCollectionDefId: collection.id,
                    },
                  });
                  this.nftImageImport.invalidateKnownCidCache();
                  this.nftImageImport.prewarmThumbnail(meta.imageUrl);
                  await this.powerGrantService.syncNftGrants(existingEntity.id).catch((err) => {
                    this.logger.error(`Failed to sync NFT grants for entity ${existingEntity.id}: ${err}`);
                  });
                } catch (createErr: any) {
                  // Another concurrent sync won the race and created the row first.
                  // Re-fetch so we can still claim/transfer it below.
                  if (createErr?.code === 'P2002') {
                    this.logger.warn(`Concurrent lazy-create race for ${nftAssetId}, re-fetching existing row`);
                    existingEntity = await (this.prisma as any).entity.findFirst({ where: { nftAssetId } });
                    if (!existingEntity) {
                      this.logger.error(`Re-fetch after P2002 returned null for ${nftAssetId}`);
                      notImported++;
                      continue;
                    }
                  } else {
                    throw createErr;
                  }
                }
              } catch (err) {
                this.logger.error(`Failed to lazy-create entity for Cardano NFT ${nftAssetId}: ${err}`);
                notImported++;
                continue;
              }
            }

            if (existingEntity.ownerUserId === userId) {
              alreadyClaimed++;
              continue;
            }

            if (existingEntity.ownerUserId !== null) {
              try {
                const updated = await (this.prisma as any).entity.update({
                  where: { id: existingEntity.id },
                  data: { ownerUserId: userId },
                });
                this.nftImageImport.invalidateKnownCidCache();
                this.nftImageImport.prewarmThumbnail(extractDisplayImageUrl(updated.display));
                claimed++;
                claimedEntityIds.push(updated.id);
                newEntities.push({
                  id: updated.id,
                  nftAssetId,
                  collectionName: collection.name,
                  chain: collection.chain,
                  assetId: asset.assetId,
                  display: updated.display,
                  progression: updated.progression,
                });
                try {
                  await (this.prisma as any).playerDelta.create({
                    data: {
                      userId: existingEntity.ownerUserId,
                      patches: [{ op: 'delete', entity: 'entity', id: updated.id }] as any,
                      ui: [] as any,
                    },
                  });
                  this.pubsub.publish(`player:${existingEntity.ownerUserId}`, {
                    userId: existingEntity.ownerUserId,
                    deltaId: 'transfer',
                  });
                } catch (err) {
                  this.logger.warn(`Failed to notify previous owner ${existingEntity.ownerUserId} of transfer: ${err}`);
                }
              } catch (err) {
                this.logger.error(`Failed to re-claim entity for NFT ${nftAssetId}: ${err}`);
              }
              continue;
            }

            try {
              const updated = await (this.prisma as any).entity.update({
                where: { id: existingEntity.id },
                data: { ownerUserId: userId },
              });

              this.nftImageImport.invalidateKnownCidCache();
              this.nftImageImport.prewarmThumbnail(extractDisplayImageUrl(updated.display));

              claimed++;
              claimedEntityIds.push(updated.id);
              newEntities.push({
                id: updated.id,
                nftAssetId,
                collectionName: collection.name,
                chain: collection.chain,
                assetId: asset.assetId,
                display: updated.display,
                progression: updated.progression,
              });
            } catch (err) {
              this.logger.error(`Failed to claim entity for NFT ${nftAssetId}: ${err}`);
            }
          }
        }

        if (isDefinitive) {
          const collectionPrefix = `${collection.chain}:${collection.collectionId}:`;
          const userOwnedInCollection = await (this.prisma as any).entity.findMany({
            where: {
              ownerUserId: userId,
              nftAssetId: { startsWith: collectionPrefix },
            },
            select: { id: true, nftAssetId: true },
          });

          for (const entity of userOwnedInCollection) {
            if (entity.nftAssetId && !ownedAssetIdsThisCollection.has(entity.nftAssetId)) {
              try {
                await (this.prisma as any).entity.update({
                  where: { id: entity.id },
                  data: { ownerUserId: null },
                });
                unclaimed++;
                unclaimedEntityIds.push(entity.id);
              } catch (err) {
                this.logger.error(`Failed to unclaim entity ${entity.id}: ${err}`);
              }
            }
          }
        } else if (matchingWallets.length > 0) {
          reconciliationSkippedCollections.push(collection.id);
        }
      }
    }

    // Build a single delta containing entity and location patches (upserts for
    // newly claimed, deletes for newly unclaimed) so the client reflects
    // everything atomically without a full page refresh.
    const allPatches: any[] = [];

    if (claimedEntityIds.length > 0) {
      try {
        const fullEntities = await (this.prisma as any).entity.findMany({
          where: { id: { in: claimedEntityIds } },
          include: { equipment: true },
        });
        for (const e of fullEntities) {
          allPatches.push({
            op: 'upsert',
            entity: 'entity',
            id: e.id,
            data: serializeEntity(e),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to load claimed entity rows for delta: ${err}`);
      }
    }

    for (const id of unclaimedEntityIds) {
      allPatches.push({ op: 'delete', entity: 'entity', id });
    }

    if (claimedLocationIds.length > 0) {
      try {
        const currencyIds = await fetchCurrencyIds(this.prisma);
        const buildingJobs = await fetchBuildingJobs(this.prisma, userId);
        for (const locationId of claimedLocationIds) {
          const fullLocation = await fetchFullLocation(this.prisma, locationId);
          if (fullLocation) {
            const pb = new PatchBuilder();
            pb.upsertLocation(fullLocation, buildingJobs, currencyIds);
            allPatches.push(...pb.build());
          }
        }
      } catch (err) {
        this.logger.error(`Failed to load claimed location rows for delta: ${err}`);
      }
    }

    for (const id of unclaimedLocationIds) {
      allPatches.push({ op: 'delete', entity: 'location', id });
    }

    if (allPatches.length > 0) {
      try {
        const delta = await (this.prisma as any).playerDelta.create({
          data: {
            userId,
            patches: allPatches as any,
            ui: [] as any,
          },
        });
        this.pubsub.publish(`player:${userId}`, {
          userId,
          deltaId: delta.id.toString(),
        });
        this.logger.log(
          `Pushed NFT sync delta for user ${userId}: claimed entities=${claimedEntityIds.length} locations=${claimedLocationIds.length} unclaimed entities=${unclaimedEntityIds.length} locations=${unclaimedLocationIds.length}`,
        );
      } catch (err) {
        this.logger.error(`Failed to push deltas after NFT sync: ${err}`);
      }
    }

    if (notImported > 0) {
      this.logger.log(
        `NFT sync for user ${userId}: ${notImported} on-chain asset(s) held but not yet in entities table — awaiting on-chain reconciler worker.`,
      );
    }

    return {
      claimed,
      alreadyClaimed,
      notImported,
      unclaimed,
      reconciliationSkippedCollections,
      entities: newEntities,
      locations: newLocations,
    };
  }

  /**
   * Entity-centric ownership sweep: iterates every Cardano NftAsset row,
   * queries the on-chain owner via getAssetOwner (throws on RPC failure so
   * the asset is skipped rather than cleared), updates NftAsset.ownerAddress,
   * and propagates changes to the associated Entity/LocationInstance rows.
   * EVM assets are silently skipped (not yet supported).
   */
  async entityCentricOwnershipSweep(): Promise<{
    processed: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    const BATCH_SIZE = 50;
    const BATCH_DELAY_MS = 500;

    const total = await (this.prisma as any).nftAsset.count({ where: { chain: 'CARDANO' } });
    this.logger.log(`Entity-centric NFT sweep: ${total} Cardano assets to process`);

    if (total === 0) return { processed: 0, updated: 0, skipped: 0, errors: 0 };

    const collections = await (this.prisma as any).nftCollectionDef.findMany({
      where: { active: true },
      select: { id: true, locationDefinitionId: true },
    });
    const collectionMap = new Map<string, any>(collections.map((c: any) => [c.id as string, c]));

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let offset = 0;

    while (offset < total) {
      const batch = await (this.prisma as any).nftAsset.findMany({
        where: { chain: 'CARDANO' },
        select: { nftAssetId: true, policyId: true, tokenName: true, collectionId: true, ownerAddress: true },
        skip: offset,
        take: BATCH_SIZE,
        orderBy: { nftAssetId: 'asc' },
      });

      for (const asset of batch) {
        try {
          // Throws on RPC failure — skip this asset rather than clearing ownership.
          const onChainOwnerAddress = await this.nftOwnership.getAssetOwner(
            'CARDANO',
            asset.policyId,
            asset.tokenName,
          );

          // Normalize to stake-key canonical form before storing and matching.
          // Blockfrost /assets/{unit}/addresses returns payment/base addresses;
          // users may have linked their stake address — normalizing ensures both
          // forms resolve to the same user without an address-form mismatch.
          const canonicalOwner = onChainOwnerAddress
            ? this.cardanoProvider.normalizeToStakeKey(onChainOwnerAddress)
            : null;

          await (this.prisma as any).nftAsset.update({
            where: { nftAssetId: asset.nftAssetId },
            data: { ownerAddress: canonicalOwner, lastSyncedAt: new Date() },
          });

          // Build candidate address set: canonical (stake-key) form PLUS the
          // original payment address, to match wallets linked in either form.
          const ownerCandidates: string[] = [
            ...(canonicalOwner ? [canonicalOwner] : []),
            ...(onChainOwnerAddress && onChainOwnerAddress !== canonicalOwner
              ? [onChainOwnerAddress]
              : []),
          ];

          const newOwnerUserId: string | null =
            ownerCandidates.length > 0
              ? await (this.prisma as any).linkedWallet
                  .findFirst({ where: { address: { in: ownerCandidates } }, select: { userId: true } })
                  .then((w: any) => w?.userId ?? null)
              : null;

          const collection = collectionMap.get(asset.collectionId);
          if (!collection) {
            skipped++;
            processed++;
            continue;
          }

          if (collection.locationDefinitionId) {
            const loc = await (this.prisma as any).locationInstance.findFirst({
              where: { nftAssetId: asset.nftAssetId },
              select: { id: true, ownerUserId: true },
            });
            if (loc && loc.ownerUserId !== newOwnerUserId) {
              const prevOwnerId: string | null = loc.ownerUserId;
              await (this.prisma as any).locationInstance.update({
                where: { id: loc.id },
                data: { ownerUserId: newOwnerUserId },
              });
              this.logger.log(
                `Entity sweep: location ${loc.id} owner ${prevOwnerId ?? 'none'} → ${newOwnerUserId ?? 'none'} (${asset.nftAssetId})`,
              );
              if (prevOwnerId) {
                try {
                  const delta = await (this.prisma as any).playerDelta.create({
                    data: {
                      userId: prevOwnerId,
                      patches: [{ op: 'delete', entity: 'location', id: loc.id }] as any,
                      ui: [] as any,
                    },
                  });
                  this.pubsub.publish(`player:${prevOwnerId}`, { userId: prevOwnerId, deltaId: delta.id.toString() });
                } catch {}
              }
              if (newOwnerUserId) {
                try {
                  const currencyIds = await fetchCurrencyIds(this.prisma);
                  const buildingJobs = await fetchBuildingJobs(this.prisma, newOwnerUserId);
                  const fullLocation = await fetchFullLocation(this.prisma, loc.id);
                  if (fullLocation) {
                    const pb = new PatchBuilder();
                    pb.upsertLocation(fullLocation, buildingJobs, currencyIds);
                    const patches = pb.build();
                    if (patches.length > 0) {
                      const delta = await (this.prisma as any).playerDelta.create({
                        data: { userId: newOwnerUserId, patches: patches as any, ui: [] as any },
                      });
                      this.pubsub.publish(`player:${newOwnerUserId}`, { userId: newOwnerUserId, deltaId: delta.id.toString() });
                    }
                  }
                } catch {}
              }
              updated++;
            } else {
              skipped++;
            }
          } else {
            const entity = await (this.prisma as any).entity.findFirst({
              where: { nftAssetId: asset.nftAssetId },
              select: { id: true, ownerUserId: true },
            });
            if (entity && entity.ownerUserId !== newOwnerUserId) {
              const prevOwnerId: string | null = entity.ownerUserId;
              await (this.prisma as any).entity.update({
                where: { id: entity.id },
                data: { ownerUserId: newOwnerUserId },
              });
              this.nftImageImport.invalidateKnownCidCache();
              this.logger.log(
                `Entity sweep: entity ${entity.id} owner ${prevOwnerId ?? 'none'} → ${newOwnerUserId ?? 'none'} (${asset.nftAssetId})`,
              );
              if (prevOwnerId) {
                try {
                  const delta = await (this.prisma as any).playerDelta.create({
                    data: {
                      userId: prevOwnerId,
                      patches: [{ op: 'delete', entity: 'entity', id: entity.id }] as any,
                      ui: [] as any,
                    },
                  });
                  this.pubsub.publish(`player:${prevOwnerId}`, { userId: prevOwnerId, deltaId: delta.id.toString() });
                } catch {}
              }
              if (newOwnerUserId) {
                try {
                  const fullEntities = await (this.prisma as any).entity.findMany({
                    where: { id: entity.id },
                    include: { equipment: true },
                  });
                  if (fullEntities.length > 0) {
                    const patch = { op: 'upsert', entity: 'entity', id: entity.id, data: serializeEntity(fullEntities[0]) };
                    const delta = await (this.prisma as any).playerDelta.create({
                      data: { userId: newOwnerUserId, patches: [patch] as any, ui: [] as any },
                    });
                    this.pubsub.publish(`player:${newOwnerUserId}`, { userId: newOwnerUserId, deltaId: delta.id.toString() });
                  }
                } catch {}
              }
              updated++;
            } else {
              skipped++;
            }
          }
        } catch (err) {
          this.logger.warn(`Entity sweep: skipping ${asset.nftAssetId} — ${err}`);
          errors++;
        }
        processed++;
      }

      offset += BATCH_SIZE;
      if (offset < total && BATCH_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
      if (processed % 500 === 0 || offset >= total) {
        this.logger.log(
          `Entity sweep progress: ${processed}/${total} — updated=${updated} skipped=${skipped} errors=${errors}`,
        );
      }
    }

    this.logger.log(
      `Entity-centric NFT sweep complete: processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`,
    );
    return { processed, updated, skipped, errors };
  }

  async getUserNftEntities(userId: string) {
    if (!userId) return [];
    const entities = await (this.prisma as any).entity.findMany({
      where: {
        ownerUserId: userId,
        nftAssetId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    const collectionIds = [...new Set(entities.map((e: any) => e.nftCollectionDefId).filter(Boolean))];
    const collections = collectionIds.length
      ? await (this.prisma as any).nftCollectionDef.findMany({
          where: { id: { in: collectionIds } },
        })
      : [];
    const collectionMap = Object.fromEntries(collections.map((c: any) => [c.id, c]));

    return entities.map((e: any) => {
      const parts = (e.nftAssetId || '').split(':');
      return {
        id: e.id,
        nftAssetId: e.nftAssetId,
        chain: parts[0] || null,
        collectionId: parts[1] || null,
        assetId: parts[2] || null,
        collectionName: collectionMap[e.nftCollectionDefId]?.name || null,
        display: e.display,
        progression: e.progression,
        createdAt: e.createdAt,
      };
    });
  }

  async seedNftEntities(): Promise<{ skipped: boolean; inserted: number }> {
    const { seedNftEntities } = await import('../../seeds/nft-entities.seed');
    return seedNftEntities(this.prisma);
  }

  /**
   * Rebuild traits, stats, definitionId, and speciesId for all existing NFT
   * entities in the given collection (or all collections if omitted) using
   * cached metadata stored in `entity.state.nftAttributes`.  No on-chain
   * request is made — the rebuild is fully offline.  Useful after an
   * attributeMap is added or a body schema changes.
   */
  async rebuildNftEntityTraits(
    collectionDefId?: string,
  ): Promise<{ total: number; updated: number; skipped: number; failed: number }> {
    const where = collectionDefId ? { id: collectionDefId } : {};
    const collectionDefs = await (this.prisma as any).nftCollectionDef.findMany({ where });

    let total = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const collection of collectionDefs) {
      if (!collection.entityDefinitionId) continue;

      const entities = await (this.prisma as any).entity.findMany({
        where: { nftCollectionDefId: collection.id },
        select: { id: true, nftAssetId: true, display: true, state: true, seed: true },
      });

      total += entities.length;

      for (const entity of entities) {
        const state = (entity.state as Record<string, any>) ?? {};
        let nftAttributes = state.nftAttributes as Record<string, string> | undefined;
        let nftRawMeta = (state.nftRawMeta as Record<string, any>) ?? {};

        // If attributes are absent or empty, try fetching from the blockchain
        // before giving up. This handles entities that were imported as shells
        // (nftAttributes: {}) before their on-chain metadata was pulled.
        const attributesEmpty =
          !nftAttributes || typeof nftAttributes !== 'object' || Object.keys(nftAttributes).length === 0;

        if (attributesEmpty && collection.chain === 'CARDANO' && entity.nftAssetId) {
          try {
            // fetchAndCache is the sole gateway to Blockfrost — no direct provider calls.
            const cachedAsset = await this.nftAssetCache.fetchAndCache(entity.nftAssetId as string);
            const fetched = nftAssetRowToMetadata(cachedAsset);
            nftAttributes = fetched.attributes;
            nftRawMeta = fetched.rawMeta ?? {};
            // Persist to entity state so offline rebuilds don't need to re-fetch.
            await (this.prisma as any).entity.update({
              where: { id: entity.id },
              data: {
                state: {
                  ...state,
                  nftAttributes: fetched.attributes,
                  nftRawMeta: fetched.rawMeta,
                },
              },
            });
          } catch (fetchErr) {
            this.logger.warn(
              `rebuildNftEntityTraits: could not fetch metadata for ${entity.nftAssetId}: ${fetchErr}`,
            );
          }
        }

        if (!nftAttributes || typeof nftAttributes !== 'object' || Object.keys(nftAttributes).length === 0) {
          skipped++;
          continue;
        }

        try {
          const display = (entity.display as Record<string, any>) ?? {};
          const meta = {
            assetId: (entity.nftAssetId as string).split(':')[2] ?? '',
            name: (display.name as string) ?? '',
            imageUrl: (display.imageUrl as string) ?? '',
            attributes: nftAttributes,
            rawMeta: nftRawMeta,
            ...(state.nftAttributesRaw !== undefined ? { attributesRaw: state.nftAttributesRaw as string } : {}),
          };

          const entitySeed = typeof entity.seed === 'number' ? entity.seed : undefined;
          const entityData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta, entitySeed);

          await (this.prisma as any).entity.update({
            where: { id: entity.id },
            data: {
              definitionId: entityData.definitionId,
              speciesId: entityData.speciesId,
              traits: entityData.traits,
              stats: entityData.stats,
            },
          });

          updated++;
        } catch (err) {
          this.logger.error(`rebuildNftEntityTraits: failed for entity ${entity.id}: ${err}`);
          failed++;
        }
      }

      this.logger.log(
        `rebuildNftEntityTraits [${collection.id}]: total=${entities.length}, updated=${updated}, skipped=${skipped}, failed=${failed}`,
      );
    }

    return { total, updated, skipped, failed };
  }

  async backfillNftMetadata(): Promise<{ updated: number; skipped: number; failed: number }> {
    if (!process.env.BLOCKFROST_API_KEY) {
      throw new BadRequestException('BLOCKFROST_API_KEY is not set — cannot fetch metadata');
    }

    const locations = await (this.prisma as any).locationInstance.findMany({
      where: { nftAssetId: { not: null } },
      select: { id: true, nftAssetId: true, state: true },
    });

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const loc of locations) {
      const state = (loc.state as Record<string, unknown>) ?? {};
      if (state.nftRawMeta !== undefined && state.nftRawMeta !== null) {
        this.nftImageImport.prewarmThumbnail(state.nftImageUrl as string | undefined);
        skipped++;
        continue;
      }

      const parts: string[] = (loc.nftAssetId as string).split(':');
      if (parts.length < 3 || parts[0] !== 'CARDANO') {
        this.logger.warn(`backfillNftMetadata: skipping non-Cardano asset ${loc.nftAssetId}`);
        skipped++;
        continue;
      }

      try {
        // Route through cache — no direct Blockfrost call.
        const cachedAsset = await this.nftAssetCache.fetchAndCache(loc.nftAssetId as string);
        const meta = nftAssetRowToMetadata(cachedAsset);

        await (this.prisma as any).locationInstance.update({
          where: { id: loc.id },
          data: {
            state: {
              ...state,
              nftAttributes: meta.attributes,
              nftRawMeta: meta.rawMeta,
            },
          },
        });
        this.nftImageImport.prewarmThumbnail(meta.imageUrl);
        updated++;
      } catch (err) {
        this.logger.error(`backfillNftMetadata: failed for ${loc.nftAssetId}: ${err}`);
        failed++;
      }
    }

    return { updated, skipped, failed };
  }
}
