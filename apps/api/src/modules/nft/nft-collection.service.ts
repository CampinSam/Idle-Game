import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NftOwnershipService, SupportedChain } from './nft-ownership.service';
import { generateEntityData } from '../entity/entity-generator.util';

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
  created: number;
  alreadyClaimed: number;
  entities: any[];
}

@Injectable()
export class NftCollectionService {
  private readonly logger = new Logger(NftCollectionService.name);

  constructor(
    private prisma: PrismaService,
    private nftOwnership: NftOwnershipService,
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

  async syncUserCollections(userId: string): Promise<SyncResult> {
    const wallets = await (this.prisma as any).linkedWallet.findMany({ where: { userId } });
    const collections = await (this.prisma as any).nftCollectionDef.findMany({ where: { active: true } });

    let created = 0;
    let alreadyClaimed = 0;
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

          if (existingEntity) {
            alreadyClaimed++;
            continue;
          }

          try {
            const entityData = await generateEntityData(
              this.prisma,
              userId,
              collection.entityDefinitionId,
              `${collection.name} #${asset.assetId.slice(-6)}`,
            );

            const entity = await (this.prisma as any).entity.create({
              data: {
                ...entityData,
                nftAssetId,
                nftCollectionDefId: collection.id,
              },
            });

            created++;
            newEntities.push({
              id: entity.id,
              nftAssetId,
              collectionName: collection.name,
              chain: collection.chain,
              assetId: asset.assetId,
              display: entity.display,
              progression: entity.progression,
            });
          } catch (err) {
            this.logger.error(`Failed to create entity for NFT ${nftAssetId}: ${err}`);
          }
        }
      }
    }

    return { created, alreadyClaimed, entities: newEntities };
  }

  async getUserNftEntities(userId: string) {
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
}
