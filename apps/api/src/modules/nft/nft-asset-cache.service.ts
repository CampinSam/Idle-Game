import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { NftMetadata } from './nft-ownership.interface';

const IMPORT_BATCH_SIZE = 5;
const IMPORT_BATCH_DELAY_MS = 300;

export function nftAssetRowToMetadata(asset: any): NftMetadata {
  return {
    assetId: asset.tokenName,
    name: asset.name ?? asset.tokenName,
    imageUrl: asset.imageUrl ?? '',
    attributes: (asset.nftAttributes as Record<string, string>) ?? {},
    rawMeta: (asset.rawMetadata as Record<string, any>) ?? {},
  };
}

@Injectable()
export class NftAssetCacheService {
  private readonly logger = new Logger(NftAssetCacheService.name);

  constructor(
    private prisma: PrismaService,
    private cardanoProvider: CardanoOwnershipProvider,
  ) {}

  /**
   * Bulk-fetch all tokens in a Cardano policy from Blockfrost and upsert them
   * into the NftAsset table. Runs in background; returns immediately with total count.
   * Does NOT create any game instances — that remains a separate step.
   */
  async importCollection(collectionId: string): Promise<{ started: true; total: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new NotFoundException(`Collection "${collectionId}" not found`);
    if (collection.chain !== 'CARDANO') {
      throw new BadRequestException(`Cache import is only supported for CARDANO collections`);
    }

    const allAssetIds = await this.cardanoProvider.getAllPolicyAssets(collection.collectionId);
    const total = allAssetIds.length;

    this.logger.log(
      `Starting background cache import of ${total} tokens for collection "${collectionId}"`,
    );

    this.runBulkImport(collection, allAssetIds).catch((err) =>
      this.logger.error(`Background cache import failed for collection "${collectionId}": ${err}`),
    );

    return { started: true, total };
  }

  private async runBulkImport(collection: any, assetIds: string[]): Promise<void> {
    let upserted = 0;
    let failed = 0;

    for (let i = 0; i < assetIds.length; i += IMPORT_BATCH_SIZE) {
      const batch = assetIds.slice(i, i + IMPORT_BATCH_SIZE);

      await Promise.all(
        batch.map(async (tokenName) => {
          const nftAssetId = `${collection.chain}:${collection.collectionId}:${tokenName}`;
          try {
            const meta = await this.cardanoProvider.getAssetMetadata(
              collection.collectionId,
              tokenName,
            );
            if (!meta) {
              this.logger.warn(`No metadata returned for ${nftAssetId} during bulk import`);
              failed++;
              return;
            }
            await this.upsertAsset(collection, tokenName, nftAssetId, meta, null);
            upserted++;
          } catch (err) {
            this.logger.error(`Cache import failed for ${nftAssetId}: ${err}`);
            failed++;
          }
        }),
      );

      const processed = Math.min(i + IMPORT_BATCH_SIZE, assetIds.length);
      if (processed % 100 === 0 || processed === assetIds.length) {
        this.logger.log(
          `Cache import progress [${collection.id}]: ${processed}/${assetIds.length} — upserted: ${upserted}, failed: ${failed}`,
        );
      }

      if (i + IMPORT_BATCH_SIZE < assetIds.length) {
        await new Promise((r) => setTimeout(r, IMPORT_BATCH_DELAY_MS));
      }
    }

    this.logger.log(
      `Cache import complete [${collection.id}]: upserted=${upserted}, failed=${failed}`,
    );
  }

  /**
   * Return the cached NftAsset for `nftAssetId`, fetching and caching it from
   * Blockfrost if it is not yet in the database.
   *
   * Throws a descriptive error if:
   * - The nftAssetId format is invalid
   * - The chain is not CARDANO
   * - No NftCollectionDef exists for the given chain+policy
   * - Blockfrost returns no metadata for the asset
   *
   * Callers (builders, sync paths) MUST NOT catch and swallow this error —
   * if fetchAndCache fails the instance must not be created.
   */
  async fetchAndCache(nftAssetId: string): Promise<any> {
    const existing = await (this.prisma as any).nftAsset.findUnique({ where: { nftAssetId } });
    if (existing) return existing;

    const parts = nftAssetId.split(':');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid nftAssetId format: "${nftAssetId}" (expected CHAIN:POLICY:TOKEN)`,
      );
    }
    const [chain, policyId, tokenName] = parts;

    if (chain !== 'CARDANO') {
      throw new Error(
        `fetchAndCache only supports CARDANO assets; got chain "${chain}" for "${nftAssetId}"`,
      );
    }

    const collection = await (this.prisma as any).nftCollectionDef.findFirst({
      where: { chain, collectionId: policyId },
    });
    if (!collection) {
      throw new Error(
        `No NftCollectionDef found for chain "${chain}" and policy "${policyId}" — cannot cache "${nftAssetId}"`,
      );
    }

    const meta = await this.cardanoProvider.getAssetMetadata(policyId, tokenName);
    if (!meta) {
      throw new Error(
        `Blockfrost returned no metadata for "${nftAssetId}" — cannot create game instance`,
      );
    }

    return this.upsertAsset(collection, tokenName, nftAssetId, meta, null);
  }

  /**
   * Re-fetch current holder addresses from Blockfrost for all NftAsset rows in
   * the given collection and update ownerAddress + lastSyncedAt. Does not touch
   * game instances (Entity/LocationInstance) — that remains the wallet-sync path.
   */
  async refreshOwnership(
    collectionId: string,
  ): Promise<{ started: true; total: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new NotFoundException(`Collection "${collectionId}" not found`);
    if (collection.chain !== 'CARDANO') {
      throw new BadRequestException(
        `Ownership refresh is only supported for CARDANO collections`,
      );
    }

    const assets = await (this.prisma as any).nftAsset.findMany({
      where: { collectionId },
      select: { nftAssetId: true, tokenName: true },
    });

    const total = assets.length;

    this.logger.log(
      `Starting background ownership refresh for ${total} cached assets in "${collectionId}"`,
    );

    this.runOwnershipRefresh(collection, assets).catch((err) =>
      this.logger.error(`Ownership refresh failed for collection "${collectionId}": ${err}`),
    );

    return { started: true, total };
  }

  private async runOwnershipRefresh(collection: any, assets: any[]): Promise<void> {
    let updated = 0;
    let failed = 0;

    for (const asset of assets) {
      try {
        const holders = await this.cardanoProvider.getAssetHolders(
          collection.collectionId,
          asset.tokenName,
        );
        const ownerAddress = holders.length > 0 ? holders[0] : null;
        await (this.prisma as any).nftAsset.update({
          where: { nftAssetId: asset.nftAssetId },
          data: { ownerAddress, lastSyncedAt: new Date() },
        });
        updated++;
      } catch (err) {
        this.logger.error(`refreshOwnership failed for ${asset.nftAssetId}: ${err}`);
        failed++;
      }
    }

    this.logger.log(
      `Ownership refresh complete [${collection.id}]: updated=${updated}, failed=${failed}`,
    );
  }

  /**
   * List cached assets for a collection, paginated. Optionally filter by ownerAddress.
   */
  async listAssets(
    collectionId: string,
    page: number,
    limit: number,
    ownerAddress?: string,
  ): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new NotFoundException(`Collection "${collectionId}" not found`);

    const where: any = { collectionId };
    if (ownerAddress) where.ownerAddress = ownerAddress;

    const [items, total] = await Promise.all([
      (this.prisma as any).nftAsset.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (this.prisma as any).nftAsset.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Update the imageUrl of a cached NftAsset row (called by the image import job
   * after it has uploaded the original to object storage).
   */
  async updateImageUrl(nftAssetId: string, imageUrl: string): Promise<void> {
    await (this.prisma as any).nftAsset.update({
      where: { nftAssetId },
      data: { imageUrl },
    });
  }

  private async upsertAsset(
    collection: any,
    tokenName: string,
    nftAssetId: string,
    meta: NftMetadata,
    ownerAddress: string | null,
  ): Promise<any> {
    return (this.prisma as any).nftAsset.upsert({
      where: { nftAssetId },
      create: {
        nftAssetId,
        collectionId: collection.id,
        chain: collection.chain,
        policyId: collection.collectionId,
        tokenName,
        ownerAddress,
        name: meta.name,
        imageUrl: meta.imageUrl || null,
        rawMetadata: meta.rawMeta as any,
        nftAttributes: meta.attributes as any,
        lastSyncedAt: new Date(),
      },
      update: {
        name: meta.name,
        imageUrl: meta.imageUrl || null,
        rawMetadata: meta.rawMeta as any,
        nftAttributes: meta.attributes as any,
        lastSyncedAt: new Date(),
      },
    });
  }
}
