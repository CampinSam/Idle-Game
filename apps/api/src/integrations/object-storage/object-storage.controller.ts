import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ObjectStorageService, ObjectNotFoundError } from './objectStorage';

@Controller('media')
export class ObjectStorageController {
  private readonly logger = new Logger(ObjectStorageController.name);
  private readonly storageService = new ObjectStorageService();

  @Get('*')
  async serveAsset(@Param() params: any, @Res() res: Response) {
    const filePath = params['0'] || params[0];
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }

    try {
      const file = await this.storageService.searchPublicObject(filePath);
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
