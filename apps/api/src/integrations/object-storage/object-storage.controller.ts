import { Controller, Get, Param, Res, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ObjectStorageService } from './objectStorage';
import { NftImageImportService } from '../../modules/nft/nft-image-import.service';

const STATIC_DIR = path.resolve(__dirname, '../../../static');

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const STATIC_DIR_RESOLVED = path.resolve(STATIC_DIR);

function serveLocalFile(filePath: string, res: Response): boolean {
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(filePath);
  const rawCandidates = hasExt
    ? [filePath, filePath.replace(/\.[^.]+$/, '.svg'), filePath.replace(/\.[^.]+$/, '.png')]
    : [filePath, filePath + '.svg', filePath + '.png'];

  for (const raw of rawCandidates) {
    const resolved = path.resolve(path.join(STATIC_DIR_RESOLVED, raw));
    if (!resolved.startsWith(STATIC_DIR_RESOLVED + path.sep)) continue;
    if (!fs.existsSync(resolved)) continue;
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(resolved).pipe(res);
    return true;
  }
  return false;
}

const NFT_THUMB_SUFFIX = '.thumb.webp';
const NFT_PREFIX = 'nft/cardano/';

@Controller('media')
export class ObjectStorageController {
  private readonly logger = new Logger(ObjectStorageController.name);
  private readonly storageService = new ObjectStorageService();

  constructor(private readonly nftImageImportService: NftImageImportService) {}

  @Get('*')
  async serveAsset(@Param() params: any, @Res() res: Response) {
    const filePath = params['0'] || params[0];
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }

    try {
      let file = await this.storageService.searchPublicObject(filePath);

      // Lazy NFT image hydration: if a request for an NFT original or its
      // thumbnail misses, fetch from IPFS / generate the thumb on the fly,
      // then re-serve. The service validates the CID is one we recognize so
      // this endpoint can't be used as an open IPFS proxy.
      if (!file && filePath.startsWith(NFT_PREFIX)) {
        const isThumb = filePath.endsWith(NFT_THUMB_SUFFIX);
        const cid = isThumb
          ? filePath.slice(NFT_PREFIX.length, -NFT_THUMB_SUFFIX.length)
          : filePath.slice(NFT_PREFIX.length);

        if (cid && !cid.includes('/')) {
          try {
            if (isThumb) {
              await this.nftImageImportService.ensureThumbnail(cid);
            } else {
              await this.nftImageImportService.ensureOriginal(cid);
            }
            file = await this.storageService.searchPublicObject(filePath);
          } catch (err: any) {
            // Log every failure path so missing-image issues are visible in
            // ops logs. NotFoundException covers two real problems we want
            // to see: unknown CIDs (could indicate stale allow-list cache)
            // and CIDs in the negative-cache cooldown after IPFS failures.
            const reason = err instanceof NotFoundException ? 'not-found' : 'error';
            this.logger.warn(
              `Lazy NFT hydrate ${reason} for ${filePath}: ${err?.message || err}`,
            );
          }
        }
      }

      if (!file) {
        if (serveLocalFile(filePath, res)) return;
        return res.status(404).json({ error: 'Asset not found' });
      }
      await this.storageService.downloadObject(file, res, 86400);
    } catch (error) {
      this.logger.error(`Error serving asset ${filePath}: ${error}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to serve asset' });
      }
    }
  }
}
