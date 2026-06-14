import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { NftMetadata } from './nft-ownership.interface';

const IMPORT_BATCH_SIZE = 5;
const IMPORT_BATCH_DELAY_MS = 300;

export interface CacheImportStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  processed: number;
  upserted: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface CacheRefreshStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

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
  private readonly importJobs = new Map<string, CacheImportStatus>();
  private readonly refreshJobs = new Map<string, CacheRefreshStatus>();

  constructor(
    private prisma: PrismaService,
    private cardanoProvider: CardanoOwnershipProvider,
  ) {}

  getImportStatus(collectionId: string): CacheImportStatus {
    return this.importJobs.get(collectionId) ?? { status: 'idle', total: 0, processed: 0, upserted: 0, failed: 0 };
  }

  getRefreshStatus(collectionId: string): CacheRefreshStatus {
    return this.refreshJobs.get(collectionId) ?? { status: 'idle', total: 0, processed: 0, updated: 0, failed: 0 };
  }

  /**
   * Bulk-fetch all tokens in a Cardano policy from Blockfrost and upsert them
   * into the NftAsset table. Runs in background; returns immediately with total count.
   * Does NOT create any game instances — that remains a separate step.
   */
  async importCollection(collectionId: string): Promise<{ started: true; total: number }> {
    const collection = await (this.prisma as any).nftCollectionDef.findFirst({
      where: { OR: [{ id: collectionId }, { key: collectionId }] },
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

    this.importJobs.set(collectionId, {
      status: 'running',
      total,
      processed: 0,
      upserted: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
    });

    this.runBulkImport(collection, allAssetIds).catch((err) => {
      this.logger.error(`Background cache import failed for collection "${collectionId}": ${err}`);
      const prev = this.importJobs.get(collectionId);
      if (prev) {
        this.importJobs.set(collectionId, { ...prev, status: 'error', finishedAt: new Date().toISOString() });
      }
    });

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
              this.logger.warn(
                `Asset ${nftAssetId} not found on-chain (Blockfrost 404) — skipping during bulk import`,
              );
              failed++;
              return;
            }

            // Fetch current owner alongside metadata so the cache row is
            // immediately useful for owner-filtered queries without a separate
            // refresh pass. A holders fetch failure is non-fatal: we still cache
            // the metadata with ownerAddress=null and log a warning.
            let ownerAddress: string | null = null;
            try {
              const holders = await this.cardanoProvider.getAssetHolders(
                collection.collectionId,
                tokenName,
              );
              ownerAddress = holders.length > 0 ? holders[0] : null;
            } catch (holdersErr) {
              this.logger.warn(
                `Could not fetch holders for ${nftAssetId} during import (will set ownerAddress=null): ${holdersErr}`,
              );
            }

            await this.upsertAsset(collection, tokenName, nftAssetId, meta, ownerAddress);
            upserted++;
          } catch (err) {
            this.logger.error(`Cache import failed for ${nftAssetId}: ${err}`);
            failed++;
          }
        }),
      );

      const processed = Math.min(i + IMPORT_BATCH_SIZE, assetIds.length);

      const currentJob = this.importJobs.get(collection.id);
      if (currentJob) {
        this.importJobs.set(collection.id, { ...currentJob, processed, upserted, failed });
      }

      if (processed % 100 === 0 || processed === assetIds.length) {
        this.logger.log(
          `Cache import progress [${collection.id}]: ${processed}/${assetIds.length} — upserted: ${upserted}, failed: ${failed}`,
        );
      }

      if (i + IMPORT_BATCH_SIZE < assetIds.length) {
        await new Promise((r) => setTimeout(r, IMPORT_BATCH_DELAY_MS));
      }
    }

    this.importJobs.set(collection.id, {
      status: 'done',
      total: assetIds.length,
      processed: assetIds.length,
      upserted,
      failed,
      startedAt: this.importJobs.get(collection.id)?.startedAt,
      finishedAt: new Date().toISOString(),
    });

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

    // getAssetMetadata returns null only for HTTP 404 (asset not found on chain);
    // any transient/upstream failure throws instead, so null here is unambiguous.
    const meta = await this.cardanoProvider.getAssetMetadata(policyId, tokenName);
    if (!meta) {
      throw new Error(
        `Asset "${nftAssetId}" was not found on Blockfrost (HTTP 404) — ` +
        `the token may not exist on-chain or the policy ID may be incorrect`,
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
    const collection = await (this.prisma as any).nftCollectionDef.findFirst({
      where: { OR: [{ id: collectionId }, { key: collectionId }] },
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

    this.refreshJobs.set(collectionId, {
      status: 'running',
      total,
      processed: 0,
      updated: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
    });

    this.runOwnershipRefresh(collection, assets).catch((err) => {
      this.logger.error(`Ownership refresh failed for collection "${collectionId}": ${err}`);
      const prev = this.refreshJobs.get(collectionId);
      if (prev) {
        this.refreshJobs.set(collectionId, { ...prev, status: 'error', finishedAt: new Date().toISOString() });
      }
    });

    return { started: true, total };
  }

  private async runOwnershipRefresh(collection: any, assets: any[]): Promise<void> {
    let updated = 0;
    let failed = 0;
    const isLocationBacked = !!collection.locationDefinitionId;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
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

        if (isLocationBacked) {
          // Resolve on-chain address to an in-game userId via the linked wallets table.
          const ownerUserId = ownerAddress
            ? await (this.prisma as any).linkedWallet
                .findFirst({ where: { address: ownerAddress }, select: { userId: true } })
                .then((w: any) => w?.userId ?? null)
            : null;

          const locationInstance = await (this.prisma as any).locationInstance.findFirst({
            where: { nftAssetId: asset.nftAssetId },
            select: { id: true, ownerUserId: true },
          });

          if (locationInstance && locationInstance.ownerUserId !== ownerUserId) {
            await (this.prisma as any).locationInstance.update({
              where: { id: locationInstance.id },
              data: { ownerUserId },
            });
            this.logger.log(
              `Transferred location ${locationInstance.id} ownership: ${locationInstance.ownerUserId ?? 'none'} → ${ownerUserId ?? 'none'} (asset: ${asset.nftAssetId})`,
            );
          }
        }

        updated++;
      } catch (err) {
        this.logger.error(`refreshOwnership failed for ${asset.nftAssetId}: ${err}`);
        failed++;
      }

      const processed = i + 1;
      const currentJob = this.refreshJobs.get(collection.id);
      if (currentJob) {
        this.refreshJobs.set(collection.id, { ...currentJob, processed, updated, failed });
      }

      if (processed % 100 === 0 || processed === assets.length) {
        this.logger.log(
          `Ownership refresh progress [${collection.id}]: ${processed}/${assets.length} — updated: ${updated}, failed: ${failed}`,
        );
      }
    }

    this.refreshJobs.set(collection.id, {
      status: 'done',
      total: assets.length,
      processed: assets.length,
      updated,
      failed,
      startedAt: this.refreshJobs.get(collection.id)?.startedAt,
      finishedAt: new Date().toISOString(),
    });

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
    const collection = await (this.prisma as any).nftCollectionDef.findFirst({
      where: { OR: [{ id: collectionId }, { key: collectionId }] },
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
