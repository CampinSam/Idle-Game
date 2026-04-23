import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { objectStorageClient } from '../../integrations/object-storage';

const IPFS_GATEWAYS = [
  'https://dweb.link/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://ipfs.io/ipfs',
];

const CONCURRENCY = 20;
const TIMEOUT_MS = 45000;

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

  constructor(private prisma: PrismaService) {}

  getStatus(): ImportStatus {
    return { ...this.state };
  }

  ensureEntityImageHosted(entityId: string): void {
    this.fetchAndHostEntityImage(entityId).catch((err) =>
      this.logger.warn(`Lazy image fetch failed for entity ${entityId}: ${err?.message || err}`),
    );
  }

  /**
   * Generate a small WebP thumbnail and write it to object storage at
   * `<originalPath>.thumb.webp`. Returns true if a new thumb was written,
   * false if it already existed. Throws on resize/upload failure.
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

      const { objectName: originalObject } = this.resolveObjectPath(originalPath);
      const originalFile = bucket.file(originalObject);
      const [originalExists] = await originalFile.exists();
      if (!originalExists) {
        throw new Error(`Cannot generate thumb: original missing for CID ${cid}`);
      }

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

  private async fetchAndHostEntityImage(entityId: string): Promise<void> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { display: true },
    });
    if (!entity) return;

    const display = (entity.display as any) || {};
    const imageUrl: string = display.imageUrl || '';
    const cid = this.extractCid(imageUrl);
    if (!cid) return;

    const hostedUrl = `/media/nft/cardano/${cid}`;

    try {
      const { bucketName, objectName } = this.resolveObjectPath(`nft/cardano/${cid}`);
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      const [exists] = await gcsFile.exists();

      let originalBuffer: Buffer | null = null;
      let originalContentType = 'image/png';

      if (!exists) {
        const downloaded = await this.downloadFromIpfs(cid);
        originalBuffer = downloaded.buffer;
        originalContentType = downloaded.contentType;
        await gcsFile.save(originalBuffer, { contentType: originalContentType, resumable: false });
        this.logger.log(`Lazy-loaded image for entity ${entityId} (CID: ${cid})`);
      }

      // Best-effort thumbnail generation; never fails the parent operation.
      try {
        const thumbPath = `nft/cardano/${cid}${THUMB_SUFFIX}`;
        const { objectName: thumbObject } = this.resolveObjectPath(thumbPath);
        const thumbFile = bucket.file(thumbObject);
        const [thumbExists] = await thumbFile.exists();
        if (!thumbExists) {
          const buf = originalBuffer ?? (await gcsFile.download())[0];
          const thumb = await this.resizeToThumbnail(buf);
          await thumbFile.save(thumb, { contentType: THUMB_CONTENT_TYPE, resumable: false });
        }
      } catch (thumbErr: any) {
        this.logger.warn(`Lazy thumb generation failed for CID ${cid}: ${thumbErr?.message || thumbErr}`);
      }

      if (imageUrl !== hostedUrl) {
        await this.prisma.entity.update({
          where: { id: entityId },
          data: { display: { ...display, imageUrl: hostedUrl } },
        });
      }
    } catch (err: any) {
      throw new Error(`CID ${cid}: ${err?.message || err}`);
    }
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
      const entities = await this.prisma.entity.findMany({
        where: { nftAssetId: { not: null } },
        select: { id: true, display: true },
      });

      // Bucket per-CID work into two groups:
      //   - ipfsCidToEntityIds: needs original download + entity URL rewrite
      //   - hostedCids: original already in storage; only needs thumbnail backfill
      const ipfsCidToEntityIds = new Map<string, string[]>();
      const hostedCids = new Set<string>();
      let alreadyHostedEntities = 0;

      for (const entity of entities) {
        const display = (entity.display as any) || {};
        const imageUrl: string = display.imageUrl || '';
        const cid = this.extractCid(imageUrl);
        if (!cid) continue;

        if (imageUrl.startsWith('/media/')) {
          alreadyHostedEntities++;
          hostedCids.add(cid);
        } else if (imageUrl.startsWith('ipfs://')) {
          if (!ipfsCidToEntityIds.has(cid)) ipfsCidToEntityIds.set(cid, []);
          ipfsCidToEntityIds.get(cid)!.push(entity.id);
        }
      }

      this.state.alreadyHosted = alreadyHostedEntities;
      this.state.total = ipfsCidToEntityIds.size;

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

      this.logger.log(
        `Starting NFT image job: ${ipfsCidToEntityIds.size} CIDs to download, ` +
          `${alreadyHostedEntities} entities already hosted, ` +
          `${existingOriginals.size} originals + ${existingThumbs.size} thumbs in storage`,
      );

      // Phase 1: download originals from IPFS for ipfs:// entities and rewrite URLs.
      if (ipfsCidToEntityIds.size > 0) {
        const entries = Array.from(ipfsCidToEntityIds.entries());
        let idx = 0;

        const worker = async () => {
          while (true) {
            const current = idx++;
            if (current >= entries.length) break;
            const [cid, entityIds] = entries[current];
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
                // Original already in storage but thumb missing — backfill it now
                // so the URL rewrite below doesn't leave a thumb gap for ipfs:// entities.
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

              await this.updateEntityImageUrls(entityIds, hostedUrl);

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
    let lastErr: Error = new Error('No gateways available');

    for (const gateway of IPFS_GATEWAYS) {
      const url = `${gateway}/${cid}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${gateway}`);
        const arrayBuffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || 'image/png';
        return { buffer: Buffer.from(arrayBuffer), contentType };
      } catch (err: any) {
        lastErr = err;
      }
    }

    throw lastErr;
  }

  private async updateEntityImageUrls(entityIds: string[], imageUrl: string): Promise<void> {
    for (const id of entityIds) {
      const entity = await this.prisma.entity.findUnique({ where: { id }, select: { display: true } });
      const display = (entity?.display as any) || {};
      await this.prisma.entity.update({
        where: { id },
        data: { display: { ...display, imageUrl } },
      });
    }
  }
}
