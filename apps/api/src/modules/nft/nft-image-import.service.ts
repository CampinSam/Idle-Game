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
    errors: [],
  };

  constructor(private prisma: PrismaService) {}

  getStatus(): ImportStatus {
    return { ...this.state };
  }

  async importAllImages(): Promise<void> {
    if (this.state.status === 'running') return;

    this.state = {
      status: 'running',
      total: 0,
      done: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      startedAt: new Date().toISOString(),
    };

    try {
      const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
      const firstPath = publicSearchPaths.split(',').map(p => p.trim()).filter(Boolean)[0];
      if (!firstPath) throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not configured');
      const pathParts = firstPath.slice(1).split('/');
      const bucketName = pathParts[0];
      const prefix = pathParts.slice(1).join('/');
      const bucket = objectStorageClient.bucket(bucketName);

      const entities = await this.prisma.entity.findMany({
        where: { nftAssetId: { not: null } },
        select: { id: true, display: true },
      });

      const cidToEntityIds = new Map<string, string[]>();
      for (const entity of entities) {
        const display = (entity.display as any) || {};
        const imageUrl: string = display.imageUrl || '';
        if (!imageUrl.startsWith('ipfs://')) continue;
        const cid = imageUrl.replace('ipfs://', '');
        if (!cidToEntityIds.has(cid)) cidToEntityIds.set(cid, []);
        cidToEntityIds.get(cid)!.push(entity.id);
      }

      this.state.total = cidToEntityIds.size;
      this.logger.log(
        `Starting IPFS image import: ${cidToEntityIds.size} unique CIDs for ${entities.length} entities`
      );

      const entries = Array.from(cidToEntityIds.entries());
      let idx = 0;

      const worker = async () => {
        while (true) {
          const current = idx++;
          if (current >= entries.length) break;
          const [cid, entityIds] = entries[current];
          const objectName = prefix ? `${prefix}/nft/cardano/${cid}` : `nft/cardano/${cid}`;
          const hostedUrl = `/media/nft/cardano/${cid}`;

          try {
            const gcsFile = bucket.file(objectName);
            const [exists] = await gcsFile.exists();

            if (!exists) {
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
                `${this.state.failed} failed / ${this.state.total} total`
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
        `Import complete: ${this.state.done} downloaded, ${this.state.skipped} skipped, ${this.state.failed} failed`
      );
    } catch (err: any) {
      this.state.status = 'error';
      this.state.finishedAt = new Date().toISOString();
      this.state.errors.push(err?.message || String(err));
      this.logger.error(`Import failed: ${err?.message || err}`);
    }
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
