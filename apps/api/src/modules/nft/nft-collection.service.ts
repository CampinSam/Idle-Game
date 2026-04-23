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

  async syncUserCollections(userId: string): Promise<SyncResult> {
    const wallets = await (this.prisma as any).linkedWallet.findMany({ where: { userId } });
    const collections = await (this.prisma as any).nftCollectionDef.findMany({ where: { active: true } });

    let claimed = 0;
    let alreadyClaimed = 0;
    let notImported = 0;
    const claimedEntityIds: string[] = [];
    const newEntities: any[] = [];

    for (const collection of collections) {
      const matchingWallets = wallets.filter((w: any) => w.chain === collection.chain);

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
          continue;
        }

        for (const asset of ownedAssets) {
          const nftAssetId = `${collection.chain}:${collection.collectionId}:${asset.assetId}`;

          const existingEntity = await (this.prisma as any).entity.findFirst({
            where: { nftAssetId },
          });

          if (!existingEntity) {
            notImported++;
            continue;
          }

          if (existingEntity.ownerUserId !== null) {
            alreadyClaimed++;
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
    }

    if (claimedEntityIds.length > 0) {
      try {
        const fullEntities = await (this.prisma as any).entity.findMany({
          where: { id: { in: claimedEntityIds } },
          include: { equipment: true },
        });

        const patches = fullEntities.map((e: any) => ({
          op: 'upsert',
          entity: 'entity',
          id: e.id,
          data: serializeEntity(e),
        }));

        const delta = await (this.prisma as any).playerDelta.create({
          data: {
            userId,
            patches: patches as any,
            ui: [] as any,
          },
        });

        this.pubsub.publish(`player:${userId}`, {
          userId,
          deltaId: delta.id.toString(),
        });

        this.logger.log(`Pushed ${patches.length} entity upsert deltas for user ${userId}`);
      } catch (err) {
        this.logger.error(`Failed to push entity deltas after NFT sync: ${err}`);
      }
    }

    return { claimed, alreadyClaimed, notImported, entities: newEntities };
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
