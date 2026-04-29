import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NftOwnershipService, SupportedChain } from './nft-ownership.service';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { buildEntityDataFromNftMetadata } from './nft-entity-builder';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NftImageImportService } from './nft-image-import.service';

export interface CreateCollectionDto {
  id: string;
  name: string;
  chain: string;
  collectionId: string;
  entityDefinitionId: string;
  mintMode?: string;
  data?: Record<string, any>;
}

export interface UpdateCollectionDto {
  name?: string;
  entityDefinitionId?: string;
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

  async createCollection(dto: CreateCollectionDto) {
    return (this.prisma as any).nftCollectionDef.create({
      data: {
        id: dto.id,
        name: dto.name,
        chain: dto.chain,
        collectionId: dto.collectionId,
        entityDefinitionId: dto.entityDefinitionId,
        mintMode: dto.mintMode ?? 'one_per_token',
        data: dto.data ?? {},
      },
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    const existing = await (this.prisma as any).nftCollectionDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Collection "${id}" not found`);
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

            // New CID is now eligible for the lazy /media endpoint.
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
   * Used by login flows and the daily background sweep so we don't hammer
   * chain RPC providers on every request.
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

  async syncUserCollections(userId: string): Promise<SyncResult> {
    const wallets = await (this.prisma as any).linkedWallet.findMany({ where: { userId } });
    const collections = await (this.prisma as any).nftCollectionDef.findMany({ where: { active: true } });

    let claimed = 0;
    let alreadyClaimed = 0;
    let notImported = 0;
    let unclaimed = 0;
    const claimedEntityIds: string[] = [];
    const unclaimedEntityIds: string[] = [];
    const newEntities: any[] = [];
    const reconciliationSkippedCollections: string[] = [];

    for (const collection of collections) {
      const matchingWallets = wallets.filter((w: any) => w.chain === collection.chain);

      // Build the set of nftAssetIds the user currently holds across all of
      // their wallets for this collection. Only trust this set for unclaim
      // reconciliation when EVERY wallet query succeeded — a transient RPC
      // failure must never wipe ownership.
      const ownedAssetIdsThisCollection = new Set<string>();
      let allWalletsSucceeded = true;

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
            // Held on-chain by this user's wallet but DB still says another user
            // owns it. This means the previous owner transferred it out without
            // a sync, so re-assign it to the current rightful owner.
            try {
              const updated = await (this.prisma as any).entity.update({
                where: { id: existingEntity.id },
                data: { ownerUserId: userId },
              });
              this.nftImageImport.invalidateKnownCidCache();
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
              // Also push a delete patch into the previous owner's delta so
              // their client drops the entity without waiting for their next sync.
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

            // Image is served lazily on first request via /media/nft/cardano/<cid>;
            // no eager fetch needed at claim time.
            this.nftImageImport.invalidateKnownCidCache();

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

      // Reconciliation pass: unclaim entities the user owns for this
      // collection that they no longer hold on-chain. Only safe when every
      // wallet for this chain succeeded.
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

    // Build a single delta containing both upserts (newly claimed) and
    // deletes (newly unclaimed) so the client reflects everything atomically.
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
          `Pushed NFT sync delta for user ${userId}: claimed=${claimedEntityIds.length} unclaimed=${unclaimedEntityIds.length}`,
        );
      } catch (err) {
        this.logger.error(`Failed to push entity deltas after NFT sync: ${err}`);
      }
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
}
