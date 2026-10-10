import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { objectStorageClient } from '../../integrations/object-storage';

const IPFS_GATEWAYS = [
  'https://dweb.link/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://ipfs.io/ipfs',
];

const CONCURRENCY = 20;
const TIMEOUT_MS = 8000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

const THUMB_SUFFIX = '.thumb.webp';
const THUMB_SIZE = 256;
const THUMB_QUALITY = 78;
const THUMB_CONTENT_TYPE = 'image/webp';

export interface ImportStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  alreadyHosted: number;
  thumbsGenerated: number;
  thumbsAlreadyPresent: number;
  thumbsFailed: number;
  errors: string[];
  startedAt?: string;
  finishedAt?: string;
}

@Injectable()
export class NftImageImportService {
  private readonly logger = new Logger(NftImageImportService.name);
  private state: ImportStatus = {
    status: 'idle',
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    alreadyHosted: 0,
    thumbsGenerated: 0,
    thumbsAlreadyPresent: 0,
    thumbsFailed: 0,
    errors: [],
  };

  /**
   * Single-flight map for thumbnail generation. Multiple concurrent requests
   * for the same CID share one in-flight Promise so we don't resize and
   * upload the same image multiple times.
   */
  private inflightThumbs = new Map<string, Promise<{ generated: boolean }>>();

  /**
   * Single-flight map for original-image fetches from IPFS. Same idea as
   * `inflightThumbs` but for the (much larger) original download path.
   */
  private inflightOriginals = new Map<string, Promise<{ fetched: boolean }>>();

  /**
   * Negative cache for CIDs that recently failed to download from IPFS.
   * Prevents the entities page (which renders dozens of birds at once) from
   * re-blocking on long gateway timeouts every render. Entries expire after
   * {@link NEGATIVE_CACHE_TTL_MS}.
   */
  private failedCidUntil = new Map<string, number>();

  /**
   * Allow-list of CIDs that belong to entities in our database. Refreshed
   * periodically so the lazy /media endpoint cannot be abused as an open
   * IPFS proxy for arbitrary CIDs.
   */
  private knownCidCache: Set<string> | null = null;
  private knownCidCacheLoadedAt = 0;
  private knownCidCacheLoading: Promise<Set<string>> | null = null;
  private static readonly KNOWN_CID_TTL_MS = 60_000;

  constructor(private prisma: PrismaService) {}

  getStatus(): ImportStatus {
    return { ...this.state };
  }

  /**
   * Refresh and return the set of NFT CIDs referenced by entities in our DB.
   * Used as an allow-list before pulling anything from IPFS so the lazy
   * /media endpoint cannot be abused as an open IPFS proxy. Concurrent
   * callers share one in-flight refresh.
   */
  private async getKnownCids(): Promise<Set<string>> {
    const now = Date.now();
    if (
      this.knownCidCache &&
      now - this.knownCidCacheLoadedAt < NftImageImportService.KNOWN_CID_TTL_MS
    ) {
      return this.knownCidCache;
    }
    if (this.knownCidCacheLoading) return this.knownCidCacheLoading;

    this.knownCidCacheLoading = (async () => {
      const assetRows = await (this.prisma as any).nftAsset.findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true },
      });
      const cids = new Set<string>();
      for (const row of assetRows) {
        const cid = this.extractCid((row.imageUrl as string) || '');
        if (cid) cids.add(cid);
      }
      this.knownCidCache = cids;
      this.knownCidCacheLoadedAt = Date.now();
      this.logger.log(`Refreshed known NFT CID cache: ${cids.size} CIDs`);
      return cids;
    })().finally(() => {
      this.knownCidCacheLoading = null;
    });

    return this.knownCidCacheLoading;
  }

  /**
   * Force the next call to {@link getKnownCids} to hit the database. Call
   * after a new collection is seeded so its CIDs become servable without
   * waiting up to {@link KNOWN_CID_TTL_MS} for the cache to expire.
   */
  invalidateKnownCidCache(): void {
    this.knownCidCacheLoadedAt = 0;
  }

  /**
   * Fire-and-forget thumbnail pre-warm for a given NFT image URL. Extracts the
   * CID from either an `ipfs://` or `/media/nft/cardano/` URL and calls
   * {@link ensureThumbnail} in the background so the thumb is cached in object
   * storage before the first user page-load. Errors are logged but never thrown.
   */
  prewarmThumbnail(imageUrl: string | null | undefined): void {
    if (!imageUrl || typeof imageUrl !== 'string') return;
    const cid = this.extractCid(imageUrl);
    if (!cid) return;
    this.ensureThumbnail(cid).then(({ generated }) => {
      if (generated) {
        this.logger.log(`Pre-warmed thumbnail for CID ${cid}`);
      }
    }).catch((err: any) => {
      this.logger.warn(`Thumbnail pre-warm failed for CID ${cid}: ${err?.message || err}`);
    });
  }

  private async assertCidKnown(cid: string): Promise<void> {
    const known = await this.getKnownCids();
    if (!known.has(cid)) {
      throw new NotFoundException(`Unknown NFT CID: ${cid}`);
    }
  }

  /**
   * Ensure the original full-resolution image for `cid` is cached in object
   * storage. If it isn't, download it from IPFS and write it. Single-flight
   * per CID so concurrent requests share one IPFS fetch.
   *
   * Throws `NotFoundException` if the CID does not belong to any known NFT
   * entity in our database.
   */
  async ensureOriginal(cid: string): Promise<{ fetched: boolean }> {
    const existing = this.inflightOriginals.get(cid);
    if (existing) return existing;

    const work = (async (): Promise<{ fetched: boolean }> => {
      await this.assertCidKnown(cid);

      const { bucketName, objectName } = this.resolveObjectPath(`nft/cardano/${cid}`);
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);

      const [exists] = await gcsFile.exists();
      if (exists) return { fetched: false };

      // Fail fast if every gateway recently rejected this CID — protects
      // page renders that touch dozens of birds at once from re-blocking
      // on long IPFS timeouts.
      const cooldownUntil = this.failedCidUntil.get(cid);
      if (cooldownUntil && Date.now() < cooldownUntil) {
        throw new NotFoundException(`Recently failed to fetch CID ${cid} from IPFS`);
      }

      try {
        const { buffer, contentType } = await this.downloadFromIpfs(cid);
        await gcsFile.save(buffer, { contentType, resumable: false });
        this.failedCidUntil.delete(cid);
        this.logger.log(`Lazy-fetched original from IPFS for CID ${cid} (${buffer.length} bytes)`);
        return { fetched: true };
      } catch (err: any) {
        this.failedCidUntil.set(cid, Date.now() + NEGATIVE_CACHE_TTL_MS);
        throw err;
      }
    })();

    this.inflightOriginals.set(cid, work);
    try {
      return await work;
    } finally {
      this.inflightOriginals.delete(cid);
    }
  }

  /**
   * Generate a small WebP thumbnail and write it to object storage at
   * `<originalPath>.thumb.webp`. Returns true if a new thumb was written,
   * false if it already existed. If the original isn't cached yet, fetches
   * it lazily via {@link ensureOriginal}. Throws `NotFoundException` for
   * unknown CIDs.
   */
  async ensureThumbnail(cid: string): Promise<{ generated: boolean }> {
    const existing = this.inflightThumbs.get(cid);
    if (existing) return existing;

    const work = (async (): Promise<{ generated: boolean }> => {
      const originalPath = `nft/cardano/${cid}`;
      const thumbPath = `${originalPath}${THUMB_SUFFIX}`;
      const { bucketName, objectName: thumbObject } = this.resolveObjectPath(thumbPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const thumbFile = bucket.file(thumbObject);

      const [thumbExists] = await thumbFile.exists();
      if (thumbExists) return { generated: false };

      // Make sure the original is in storage; ensureOriginal validates the
      // CID is known and pulls from IPFS if needed.
      await this.ensureOriginal(cid);

      const { objectName: originalObject } = this.resolveObjectPath(originalPath);
      const originalFile = bucket.file(originalObject);
      const [originalBuffer] = await originalFile.download();
      const thumbBuffer = await this.resizeToThumbnail(originalBuffer);
      await thumbFile.save(thumbBuffer, { contentType: THUMB_CONTENT_TYPE, resumable: false });
      return { generated: true };
    })();

    this.inflightThumbs.set(cid, work);
    try {
      return await work;
    } finally {
      this.inflightThumbs.delete(cid);
    }
  }

  private async resizeToThumbnail(input: Buffer): Promise<Buffer> {
    return sharp(input)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
  }

  private extractCid(imageUrl: string): string | null {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('ipfs://')) {
      return imageUrl.replace('ipfs://', '') || null;
    }
    const mediaPrefix = '/media/nft/cardano/';
    if (imageUrl.startsWith(mediaPrefix)) {
      const cid = imageUrl.slice(mediaPrefix.length);
      // Defensive: strip an accidental thumb suffix if it was ever stored.
      return cid.endsWith(THUMB_SUFFIX) ? cid.slice(0, -THUMB_SUFFIX.length) : cid || null;
    }
    return null;
  }

  async importAllImages(): Promise<void> {
    if (this.state.status === 'running') return;

    this.state = {
      status: 'running',
      total: 0,
      done: 0,
      failed: 0,
      skipped: 0,
      alreadyHosted: 0,
      thumbsGenerated: 0,
      thumbsAlreadyPresent: 0,
      thumbsFailed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
    };

    try {
      const nftAssets = await (this.prisma as any).nftAsset.findMany({
        where: { imageUrl: { not: null } },
        select: { nftAssetId: true, imageUrl: true },
      });

      // Bucket per-CID work into two groups:
      //   - ipfsCidToNftAssetIds: needs original download + URL rewrite
      //   - hostedCids: original already in storage; only needs thumbnail backfill
      const ipfsCidToNftAssetIds = new Map<string, string[]>();
      const hostedCids = new Set<string>();
      let alreadyHostedCount = 0;

      for (const asset of nftAssets) {
        const imageUrl: string = (asset.imageUrl as string) || '';
        const cid = this.extractCid(imageUrl);
        if (!cid) continue;

        if (imageUrl.startsWith('/media/')) {
          alreadyHostedCount++;
          hostedCids.add(cid);
        } else if (imageUrl.startsWith('ipfs://')) {
          if (!ipfsCidToNftAssetIds.has(cid)) ipfsCidToNftAssetIds.set(cid, []);
          ipfsCidToNftAssetIds.get(cid)!.push(asset.nftAssetId as string);
        }
      }

      this.state.alreadyHosted = alreadyHostedCount;

      const existingObjects = await this.listObjectNames('nft/cardano/');
      const existingOriginals = new Set<string>();
      const existingThumbs = new Set<string>();
      for (const name of existingObjects) {
        if (name.endsWith(THUMB_SUFFIX)) {
          existingThumbs.add(name.slice(0, -THUMB_SUFFIX.length));
        } else {
          existingOriginals.add(name);
        }
      }

      // Recover orphaned hosted entries: a NftAsset's `imageUrl` may already
      // point at `/media/nft/cardano/<cid>`, but the original file can be
      // missing from object storage (e.g. partial migration, storage wipe, or
      // a previous run that updated the URL before the upload settled). Merge
      // them into Phase 1 with empty nftAssetIds so the URL update is a no-op
      // (URL is already correct) but the IPFS download + thumb generation happen.
      let recoveredOrphans = 0;
      for (const cid of hostedCids) {
        if (!existingOriginals.has(cid) && !ipfsCidToNftAssetIds.has(cid)) {
          ipfsCidToNftAssetIds.set(cid, []);
          recoveredOrphans++;
        }
      }
      this.state.total = ipfsCidToNftAssetIds.size;

      this.logger.log(
        `Starting NFT image job: ${ipfsCidToNftAssetIds.size} CIDs to download ` +
          `(${recoveredOrphans} orphaned hosted entries to recover), ` +
          `${alreadyHostedCount} assets already hosted, ` +
          `${existingOriginals.size} originals + ${existingThumbs.size} thumbs in storage`,
      );

      // Phase 1: download originals from IPFS and rewrite URLs.
      if (ipfsCidToNftAssetIds.size > 0) {
        const entries = Array.from(ipfsCidToNftAssetIds.entries());
        let idx = 0;

        const worker = async () => {
          while (true) {
            const current = idx++;
            if (current >= entries.length) break;
            const [cid, nftAssetIds] = entries[current];
            const hostedUrl = `/media/nft/cardano/${cid}`;

            try {
              const exists = existingOriginals.has(cid);

              if (!exists) {
                const { bucketName, objectName } = this.resolveObjectPath(`nft/cardano/${cid}`);
                const bucket = objectStorageClient.bucket(bucketName);
                const gcsFile = bucket.file(objectName);
                const { buffer, contentType } = await this.downloadFromIpfs(cid);
                await gcsFile.save(buffer, { contentType, resumable: false });
                existingOriginals.add(cid);

                // Generate thumbnail from the in-memory buffer — no extra GCS download.
                try {
                  const { objectName: thumbObject } = this.resolveObjectPath(
                    `nft/cardano/${cid}${THUMB_SUFFIX}`,
                  );
                  const thumbFile = bucket.file(thumbObject);
                  const thumb = await this.resizeToThumbnail(buffer);
                  await thumbFile.save(thumb, {
                    contentType: THUMB_CONTENT_TYPE,
                    resumable: false,
                  });
                  existingThumbs.add(cid);
                  this.state.thumbsGenerated++;
                } catch (thumbErr: any) {
                  this.state.thumbsFailed++;
                  this.logger.warn(
                    `Thumb generation failed for new CID ${cid}: ${thumbErr?.message || thumbErr}`,
                  );
                }
              } else if (!existingThumbs.has(cid)) {
                // Original already in storage but thumb missing — backfill it now.
                try {
                  const result = await this.ensureThumbnail(cid);
                  if (result.generated) {
                    existingThumbs.add(cid);
                    this.state.thumbsGenerated++;
                  } else {
                    this.state.thumbsAlreadyPresent++;
                  }
                } catch (thumbErr: any) {
                  this.state.thumbsFailed++;
                  this.logger.warn(
                    `Thumb backfill failed for existing-original CID ${cid}: ${thumbErr?.message || thumbErr}`,
                  );
                }
              } else {
                this.state.thumbsAlreadyPresent++;
              }

              // Propagate hosted URL to NftAsset and all game instances.
              for (const nftAssetId of nftAssetIds) {
                await this.propagateHostedImageUrl(nftAssetId, hostedUrl);
              }

              if (exists) this.state.skipped++;
              else this.state.done++;

              const progress = this.state.done + this.state.skipped + this.state.failed;
              if (progress % 100 === 0) {
                this.logger.log(
                  `Download progress: ${this.state.done} downloaded, ${this.state.skipped} skipped, ` +
                    `${this.state.failed} failed / ${this.state.total} total`,
                );
              }
            } catch (err: any) {
              this.state.failed++;
              const msg = `CID ${cid}: ${err?.message || err}`;
              if (this.state.errors.length < 50) this.state.errors.push(msg);
              this.logger.warn(msg);
            }
          }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      }

      // Phase 2: backfill thumbnails for already-hosted CIDs that don't have one yet.
      const cidsNeedingThumb: string[] = [];
      for (const cid of hostedCids) {
        if (existingThumbs.has(cid)) {
          this.state.thumbsAlreadyPresent++;
        } else if (existingOriginals.has(cid)) {
          cidsNeedingThumb.push(cid);
        }
      }

      if (cidsNeedingThumb.length > 0) {
        this.logger.log(`Backfilling ${cidsNeedingThumb.length} missing thumbnails`);
        let tIdx = 0;
        const thumbWorker = async () => {
          while (true) {
            const current = tIdx++;
            if (current >= cidsNeedingThumb.length) break;
            const cid = cidsNeedingThumb[current];
            try {
              const result = await this.ensureThumbnail(cid);
              if (result.generated) this.state.thumbsGenerated++;
              else this.state.thumbsAlreadyPresent++;
            } catch (err: any) {
              this.state.thumbsFailed++;
              const msg = `Thumb CID ${cid}: ${err?.message || err}`;
              if (this.state.errors.length < 50) this.state.errors.push(msg);
              this.logger.warn(msg);
            }
          }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, () => thumbWorker()));
      }

      this.state.status = 'done';
      this.state.finishedAt = new Date().toISOString();
      this.logger.log(
        `Import complete: ${this.state.done} downloaded, ${this.state.skipped} originals already in storage, ` +
          `${this.state.alreadyHosted} entities already hosted, ${this.state.failed} failed | ` +
          `thumbs: ${this.state.thumbsGenerated} generated, ${this.state.thumbsAlreadyPresent} present, ` +
          `${this.state.thumbsFailed} failed`,
      );
    } catch (err: any) {
      this.state.status = 'error';
      this.state.finishedAt = new Date().toISOString();
      this.state.errors.push(err?.message || String(err));
      this.logger.error(`Import failed: ${err?.message || err}`);
    }
  }

  private async listObjectNames(subPath: string): Promise<string[]> {
    const { bucketName, objectName: prefix } = this.resolveObjectPath(subPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix });
    const names: string[] = [];
    for (const file of files) {
      const name: string = file.name;
      if (!name.startsWith(prefix)) continue;
      const tail = name.slice(prefix.length);
      if (tail) names.push(tail);
    }
    return names;
  }

  private resolveObjectPath(path: string): { bucketName: string; objectName: string } {
    const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const firstPath = publicSearchPaths.split(',').map((p) => p.trim()).filter(Boolean)[0];
    if (!firstPath) throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not configured');
    const pathParts = firstPath.slice(1).split('/');
    const bucketName = pathParts[0];
    const prefix = pathParts.slice(1).join('/');
    const objectName = prefix ? `${prefix}/${path}` : path;
    return { bucketName, objectName };
  }

  private async downloadFromIpfs(cid: string): Promise<{ buffer: Buffer; contentType: string }> {
    // Race all gateways in parallel; the first successful response wins.
    // Slow/dead gateways no longer block fast ones serially.
    const sharedAbort = new AbortController();
    const attempts = IPFS_GATEWAYS.map(async (gateway) => {
      const url = `${gateway}/${cid}`;
      const controller = new AbortController();
      const onSharedAbort = () => controller.abort();
      sharedAbort.signal.addEventListener('abort', onSharedAbort);
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${gateway}`);
        const arrayBuffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || 'image/png';
        return { buffer: Buffer.from(arrayBuffer), contentType };
      } finally {
        clearTimeout(timer);
        sharedAbort.signal.removeEventListener('abort', onSharedAbort);
      }
    });

    try {
      const winner = await Promise.any(attempts);
      sharedAbort.abort();
      return winner;
    } catch (err: any) {
      const errors: any[] = err?.errors ?? [err];
      const last = errors[errors.length - 1];
      throw new Error(`All IPFS gateways failed for ${cid}: ${last?.message || last}`);
    }
  }

  /**
   * Propagate a hosted image URL to the NftAsset row and all game instances
   * (Entity, LocationInstance) that share the same nftAssetId. Called after
   * a CID's original has been uploaded to object storage.
   */
  private async propagateHostedImageUrl(nftAssetId: string, imageUrl: string): Promise<void> {
    await (this.prisma as any).nftAsset.update({
      where: { nftAssetId },
      data: { imageUrl },
    });

    const entity = await (this.prisma as any).entity.findFirst({
      where: { nftAssetId },
      select: { id: true, display: true },
    });
    if (entity) {
      const display = (entity.display as any) || {};
      await (this.prisma as any).entity.update({
        where: { id: entity.id },
        data: { display: { ...display, imageUrl } },
      });
    }

    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { nftAssetId },
      select: { id: true, state: true },
    });
    if (location) {
      const state = (location.state as any) || {};
      await (this.prisma as any).locationInstance.update({
        where: { id: location.id },
        data: { state: { ...state, nftImageUrl: imageUrl } },
      });
    }
  }
}
