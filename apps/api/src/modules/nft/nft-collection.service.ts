import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NftOwnershipService, SupportedChain } from './nft-ownership.service';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { buildEntityDataFromNftMetadata } from './nft-entity-builder';
import { buildLocationDataFromNftMetadata } from './nft-location-builder';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NftImageImportService } from './nft-image-import.service';
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
  mintMode?: string;
  data?: Record<string, any>;
}

export interface UpdateCollectionDto {
  name?: string;
  entityDefinitionId?: string;
  locationDefinitionId?: string;
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

  constructor(
    private prisma: PrismaService,
    private nftOwnership: NftOwnershipService,
    private cardanoProvider: CardanoOwnershipProvider,
    private pubsub: PubSubService,
    private nftImageImport: NftImageImportService,
  ) {}

  async listCollections() {
    return (this.prisma as any).nftCollectionDef.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  private validateCollectionMode(entityDefinitionId?: string | null, locationDefinitionId?: string | null): void {
    const hasEntity = !!entityDefinitionId;
    const hasLocation = !!locationDefinitionId;
    if (hasEntity && hasLocation) {
      throw new BadRequestException(
        `A collection must target either an entityDefinitionId or a locationDefinitionId, not both`,
      );
    }
    if (!hasEntity && !hasLocation) {
      throw new BadRequestException(
        `A collection must have either an entityDefinitionId or a locationDefinitionId`,
      );
    }
  }

  async createCollection(dto: CreateCollectionDto) {
    this.validateCollectionMode(dto.entityDefinitionId, dto.locationDefinitionId);
    return (this.prisma as any).nftCollectionDef.create({
      data: {
        id: dto.id,
        name: dto.name,
        chain: dto.chain,
        collectionId: dto.collectionId,
        entityDefinitionId: dto.entityDefinitionId ?? null,
        locationDefinitionId: dto.locationDefinitionId ?? null,
        mintMode: dto.mintMode ?? 'one_per_token',
        data: dto.data ?? {},
      },
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    const existing = await (this.prisma as any).nftCollectionDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Collection "${id}" not found`);

    const nextEntityId = 'entityDefinitionId' in dto ? dto.entityDefinitionId : existing.entityDefinitionId;
    const nextLocationId = 'locationDefinitionId' in dto ? dto.locationDefinitionId : existing.locationDefinitionId;
    this.validateCollectionMode(nextEntityId, nextLocationId);

    return (this.prisma as any).nftCollectionDef.update({
      where: { id },
      data: dto,
    });
  }

  async deactivateCollection(id: string) {
    const existing = await (this.prisma as any).nftCollectionDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Collection "${id}" not found`);
    await (this.prisma as any).nftCollectionDef.update({
      where: { id },
      data: { active: false },
    });
  }

  async importCollection(id: string): Promise<{ started: true; total: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException(`Collection "${id}" not found`);
    if (collection.chain !== 'CARDANO') {
      throw new BadRequestException(`Import is only supported for CARDANO collections`);
    }
    if (!collection.entityDefinitionId) {
      throw new BadRequestException(`Import is only supported for entity-backed collections (entityDefinitionId is required)`);
    }

    const allAssetIds = await this.cardanoProvider.getAllPolicyAssets(collection.collectionId);
    const total = allAssetIds.length;

    this.logger.log(`Starting background import of ${total} tokens for collection "${id}"`);

    this.runImport(collection, allAssetIds).catch((err) =>
      this.logger.error(`Background import failed for collection "${id}": ${err}`),
    );

    return { started: true, total };
  }

  private async runImport(collection: any, assetIds: string[]) {
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 300;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
      const batch = assetIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (assetId) => {
          const nftAssetId = `${collection.chain}:${collection.collectionId}:${assetId}`;
          try {
            const existing = await (this.prisma as any).entity.findFirst({ where: { nftAssetId } });
            if (existing) {
              skipped++;
              return;
            }

            const meta = await this.cardanoProvider.getAssetMetadata(collection.collectionId, assetId);
            if (!meta) {
              failed++;
              return;
            }

            const entityData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta);

            await (this.prisma as any).entity.create({
              data: {
                ...entityData,
                nftAssetId,
                nftCollectionDefId: collection.id,
              },
            });

            this.nftImageImport.invalidateKnownCidCache();

            created++;
          } catch (err) {
            this.logger.error(`Failed to import NFT ${nftAssetId}: ${err}`);
            failed++;
          }
        }),
      );

      const processed = Math.min(i + BATCH_SIZE, assetIds.length);
      if (processed % 100 === 0 || processed === assetIds.length) {
        this.logger.log(
          `Import progress [${collection.id}]: ${processed}/${assetIds.length} processed — created: ${created}, skipped: ${skipped}, failed: ${failed}`,
        );
      }

      if (i + BATCH_SIZE < assetIds.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    this.logger.log(
      `Import complete [${collection.id}]: created=${created}, skipped=${skipped}, failed=${failed}`,
    );
  }

  static readonly DEFAULT_SYNC_THROTTLE_MS = 5 * 60 * 1000;

  /**
   * Run syncUserCollections only if the user hasn't been synced within the
   * given throttle window. Returns null when skipped, the SyncResult otherwise.
   */
  async syncIfStale(
    userId: string,
    minIntervalMs: number = NftCollectionService.DEFAULT_SYNC_THROTTLE_MS,
  ): Promise<SyncResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastNftSyncAt: true } as any,
    });
    const last = (user as any)?.lastNftSyncAt as Date | null | undefined;
    if (last && Date.now() - new Date(last).getTime() < minIntervalMs) {
      return null;
    }
    return this.syncUserCollections(userId);
  }

  /**
   * Lazy ownership reconciliation for login flows. Always runs (no throttle).
   *
   * For entity-backed collections: claims/transfers existing Entity rows.
   * For location-backed collections: creates LocationInstance rows on-demand
   * (no pre-import needed) or transfers ownership to the rightful on-chain owner.
   */
  async lazySyncOnLogin(userId: string): Promise<SyncResult> {
    return this.syncUserCollections(userId);
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
      let allWalletsSucceeded = true;

      if (collection.locationDefinitionId) {
        // ── Location-backed collection (e.g. Derp Outposts) ──────────────────
        for (const wallet of matchingWallets) {
          let ownedAssets: { assetId: string; quantity: number }[] = [];
          try {
            ownedAssets = await this.nftOwnership.getOwnedInCollection(
              collection.chain as SupportedChain,
              wallet.address,
              collection.collectionId,
            );
          } catch (err) {
            this.logger.warn(`Failed to fetch NFTs for wallet ${wallet.address} on ${collection.chain}: ${err}`);
            allWalletsSucceeded = false;
            continue;
          }

          for (const asset of ownedAssets) {
            const nftAssetId = `${collection.chain}:${collection.collectionId}:${asset.assetId}`;
            ownedAssetIdsThisCollection.add(nftAssetId);

            const existingLocation = await (this.prisma as any).locationInstance.findFirst({
              where: { nftAssetId },
            });

            if (!existingLocation) {
              // No location row yet — create one on-demand (no pre-import step needed for locations).
              try {
                let meta: any = { name: asset.assetId, imageUrl: null, attributes: {} };
                try {
                  meta = await this.cardanoProvider.getAssetMetadata(collection.collectionId, asset.assetId) ?? meta;
                } catch (metaErr) {
                  this.logger.warn(`Could not fetch metadata for ${nftAssetId}, using defaults: ${metaErr}`);
                }

                const locationData = buildLocationDataFromNftMetadata(collection, meta, nftAssetId);
                const created = await (this.prisma as any).locationInstance.create({
                  data: {
                    ...locationData,
                    ownerUserId: userId,
                  },
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
              await (this.prisma as any).locationInstance.update({
                where: { id: existingLocation.id },
                data: { ownerUserId: userId },
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
        if (allWalletsSucceeded) {
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
          let ownedAssets: { assetId: string; quantity: number }[] = [];
          try {
            ownedAssets = await this.nftOwnership.getOwnedInCollection(
              collection.chain as SupportedChain,
              wallet.address,
              collection.collectionId,
            );
          } catch (err) {
            this.logger.warn(`Failed to fetch NFTs for wallet ${wallet.address} on ${collection.chain}: ${err}`);
            allWalletsSucceeded = false;
            continue;
          }

          for (const asset of ownedAssets) {
            const nftAssetId = `${collection.chain}:${collection.collectionId}:${asset.assetId}`;
            ownedAssetIdsThisCollection.add(nftAssetId);

            const existingEntity = await (this.prisma as any).entity.findFirst({
              where: { nftAssetId },
            });

            if (!existingEntity) {
              notImported++;
              continue;
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

        if (allWalletsSucceeded) {
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

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastNftSyncAt: new Date() } as any,
      });
    } catch (err) {
      this.logger.warn(`Failed to update lastNftSyncAt for user ${userId}: ${err}`);
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
        select: { id: true, nftAssetId: true, display: true, state: true },
      });

      total += entities.length;

      for (const entity of entities) {
        const state = (entity.state as Record<string, any>) ?? {};
        const nftAttributes = state.nftAttributes as Record<string, string> | undefined;

        if (!nftAttributes || typeof nftAttributes !== 'object') {
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
            rawMeta: (state.nftRawMeta as Record<string, any>) ?? {},
            ...(state.nftAttributesRaw !== undefined ? { attributesRaw: state.nftAttributesRaw as string } : {}),
          };

          const entityData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta);

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

      const policyId = parts[1];
      const assetId = parts[2];

      try {
        const meta = await this.cardanoProvider.getAssetMetadata(policyId, assetId);
        if (!meta) {
          this.logger.warn(`backfillNftMetadata: no metadata returned for ${loc.nftAssetId}`);
          failed++;
          continue;
        }

        await (this.prisma as any).locationInstance.update({
          where: { id: loc.id },
          data: {
            state: {
              ...state,
              nftAttributes: meta.attributes,
              nftRawMeta: meta.rawMeta,
              ...(meta.attributesRaw !== undefined ? { nftAttributesRaw: meta.attributesRaw } : {}),
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
