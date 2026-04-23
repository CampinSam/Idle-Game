import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ObjectStorageService } from './objectStorage';
import { NftImageImportService } from '../../modules/nft/nft-image-import.service';

const NFT_THUMB_SUFFIX = '.thumb.webp';
const NFT_THUMB_PREFIX = 'nft/cardano/';

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

      // Lazy NFT thumbnail generation: if a request for a *.thumb.webp under
      // nft/cardano/ misses, generate it on the fly from the original.
      if (
        !file &&
        filePath.startsWith(NFT_THUMB_PREFIX) &&
        filePath.endsWith(NFT_THUMB_SUFFIX)
      ) {
        const cid = filePath.slice(NFT_THUMB_PREFIX.length, -NFT_THUMB_SUFFIX.length);
        if (cid) {
          try {
            await this.nftImageImportService.ensureThumbnail(cid);
            file = await this.storageService.searchPublicObject(filePath);
          } catch (err: any) {
            this.logger.warn(
              `Lazy thumb generation failed for CID ${cid}: ${err?.message || err}`,
            );
          }
        }
      }

      if (!file) {
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
