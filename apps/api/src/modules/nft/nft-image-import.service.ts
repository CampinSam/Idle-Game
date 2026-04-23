import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { objectStorageClient } from '../../integrations/object-storage';

const IPFS_GATEWAYS = [
  'https://dweb.link/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://ipfs.io/ipfs',
];

const CONCURRENCY = 20;
const TIMEOUT_MS = 45000;

export interface ImportStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  alreadyHosted: number;
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
    errors: [],
  };

  constructor(private prisma: PrismaService) {}

  getStatus(): ImportStatus {
    return { ...this.state };
  }

  ensureEntityImageHosted(entityId: string): void {
    this.fetchAndHostEntityImage(entityId).catch((err) =>
      this.logger.warn(`Lazy image fetch failed for entity ${entityId}: ${err?.message || err}`),
    );
  }

  private async fetchAndHostEntityImage(entityId: string): Promise<void> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { display: true },
    });
    if (!entity) return;

    const display = (entity.display as any) || {};
    const imageUrl: string = display.imageUrl || '';
    if (!imageUrl.startsWith('ipfs://')) return;

    const cid = imageUrl.replace('ipfs://', '');
    const hostedUrl = `/media/nft/cardano/${cid}`;

    try {
      const { bucketName, objectName } = this.resolveObjectPath(`nft/cardano/${cid}`);
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      const [exists] = await gcsFile.exists();

      if (!exists) {
        const { buffer, contentType } = await this.downloadFromIpfs(cid);
        await gcsFile.save(buffer, { contentType, resumable: false });
        this.logger.log(`Lazy-loaded image for entity ${entityId} (CID: ${cid})`);
      }

      await this.prisma.entity.update({
        where: { id: entityId },
        data: { display: { ...display, imageUrl: hostedUrl } },
      });
    } catch (err: any) {
      throw new Error(`CID ${cid}: ${err?.message || err}`);
    }
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
      errors: [],
      startedAt: new Date().toISOString(),
    };

    try {
      const entities = await this.prisma.entity.findMany({
        where: { nftAssetId: { not: null } },
        select: { id: true, display: true },
      });

      const cidToEntityIds = new Map<string, string[]>();
      let alreadyHostedEntities = 0;
      for (const entity of entities) {
        const display = (entity.display as any) || {};
        const imageUrl: string = display.imageUrl || '';
        if (imageUrl.startsWith('/media/')) {
          alreadyHostedEntities++;
          continue;
        }
        if (!imageUrl.startsWith('ipfs://')) continue;
        const cid = imageUrl.replace('ipfs://', '');
        if (!cidToEntityIds.has(cid)) cidToEntityIds.set(cid, []);
        cidToEntityIds.get(cid)!.push(entity.id);
      }

      this.state.alreadyHosted = alreadyHostedEntities;
      this.state.total = cidToEntityIds.size;
      this.logger.log(
        `Starting IPFS image import: ${cidToEntityIds.size} unique CIDs to process, ` +
          `${alreadyHostedEntities} entities already hosted (skipped) out of ${entities.length} total`,
      );

      if (cidToEntityIds.size === 0) {
        this.state.status = 'done';
        this.state.finishedAt = new Date().toISOString();
        this.logger.log(
          `Import complete: nothing to do (${alreadyHostedEntities} already hosted)`,
        );
        return;
      }

      const existingObjects = await this.listExistingObjects('nft/cardano/');
      this.logger.log(
        `Bulk listing found ${existingObjects.size} existing objects under nft/cardano/`,
      );

      const entries = Array.from(cidToEntityIds.entries());
      let idx = 0;

      const worker = async () => {
        while (true) {
          const current = idx++;
          if (current >= entries.length) break;
          const [cid, entityIds] = entries[current];
          const hostedUrl = `/media/nft/cardano/${cid}`;

          try {
            const exists = existingObjects.has(cid);

            if (!exists) {
              const { bucketName, objectName } = this.resolveObjectPath(`nft/cardano/${cid}`);
              const bucket = objectStorageClient.bucket(bucketName);
              const gcsFile = bucket.file(objectName);
              const { buffer, contentType } = await this.downloadFromIpfs(cid);
              await gcsFile.save(buffer, { contentType, resumable: false });
            }

            await this.updateEntityImageUrls(entityIds, hostedUrl);

            if (exists) {
              this.state.skipped++;
            } else {
              this.state.done++;
            }

            const progress = this.state.done + this.state.skipped + this.state.failed;
            if (progress % 100 === 0) {
              this.logger.log(
                `Progress: ${this.state.done} downloaded, ${this.state.skipped} skipped, ` +
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

      this.state.status = 'done';
      this.state.finishedAt = new Date().toISOString();
      this.logger.log(
        `Import complete: ${this.state.done} downloaded, ${this.state.skipped} already in storage, ` +
          `${this.state.alreadyHosted} entities already hosted, ${this.state.failed} failed`,
      );
    } catch (err: any) {
      this.state.status = 'error';
      this.state.finishedAt = new Date().toISOString();
      this.state.errors.push(err?.message || String(err));
      this.logger.error(`Import failed: ${err?.message || err}`);
    }
  }

  private async listExistingObjects(subPath: string): Promise<Set<string>> {
    const { bucketName, objectName: prefix } = this.resolveObjectPath(subPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix });
    const cids = new Set<string>();
    for (const file of files) {
      const name: string = file.name;
      if (!name.startsWith(prefix)) continue;
      const cid = name.slice(prefix.length);
      if (cid) cids.add(cid);
    }
    return cids;
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
