import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { NftCollectionService, CreateCollectionDto, UpdateCollectionDto } from './nft-collection.service';
import { NftImageImportService } from './nft-image-import.service';
import { NftAssetCacheService } from './nft-asset-cache.service';

@Controller('nft/collections')
export class NftCollectionController {
  constructor(
    private nftCollectionService: NftCollectionService,
    private nftImageImportService: NftImageImportService,
    private nftAssetCache: NftAssetCacheService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  listCollections() {
    return this.nftCollectionService.listCollections();
  }

  @Post()
  @UseGuards(AdminGuard)
  createCollection(@Body() dto: CreateCollectionDto) {
    return this.nftCollectionService.createCollection(dto);
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'))
  syncCollections(@Request() req: any) {
    return this.nftCollectionService.syncUserCollections(req.user.id);
  }

  @Get('entities')
  @UseGuards(AuthGuard('jwt'))
  getNftEntities(@Request() req: any) {
    return this.nftCollectionService.getUserNftEntities(req.user.id);
  }

  @Post('images/import')
  @UseGuards(AdminGuard)
  startImageImport() {
    const status = this.nftImageImportService.getStatus();
    if (status.status === 'running') {
      return { status: 'already_running', progress: status };
    }
    this.nftImageImportService.importAllImages();
    return { status: 'started' };
  }

  @Get('images/import/status')
  @UseGuards(AdminGuard)
  getImageImportStatus() {
    return this.nftImageImportService.getStatus();
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  updateCollection(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.nftCollectionService.updateCollection(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  deactivateCollection(@Param('id') id: string) {
    return this.nftCollectionService.deactivateCollection(id);
  }

  /**
   * Bulk-fetch all tokens in a policy from Blockfrost and populate the NftAsset
   * cache table. Does NOT create any game instances.
   */
  @Post(':id/import')
  @UseGuards(AdminGuard)
  importCollectionCache(@Param('id') id: string) {
    return this.nftAssetCache.importCollection(id);
  }

  /**
   * Return the current progress of a running (or completed) cache import job.
   */
  @Get(':id/import/status')
  @UseGuards(AdminGuard)
  getImportStatus(@Param('id') id: string) {
    return this.nftAssetCache.getImportStatus(id);
  }

  /**
   * (Renamed from POST /:id/import) Create game entity instances for all tokens
   * in the given collection. Reads metadata from the NftAsset cache — run
   * POST /:id/import first to populate it.
   */
  @Post(':id/create-instances')
  @UseGuards(AdminGuard)
  createInstances(@Param('id') id: string) {
    return this.nftCollectionService.createInstances(id);
  }

  /**
   * Return the current progress of a running (or completed) create-instances job.
   */
  @Get(':id/create-instances/status')
  @UseGuards(AdminGuard)
  getCreateInstancesStatus(@Param('id') id: string) {
    return this.nftCollectionService.getCreateInstancesStatus(id);
  }

  /**
   * Re-fetch current on-chain holder addresses for all NftAsset rows in a
   * collection and update ownerAddress + lastSyncedAt.
   */
  @Post(':id/refresh')
  @UseGuards(AdminGuard)
  refreshOwnership(@Param('id') id: string) {
    return this.nftAssetCache.refreshOwnership(id);
  }

  /**
   * Return the current progress of a running (or completed) ownership refresh job.
   */
  @Get(':id/refresh/status')
  @UseGuards(AdminGuard)
  getRefreshStatus(@Param('id') id: string) {
    return this.nftAssetCache.getRefreshStatus(id);
  }

  /**
   * List cached NftAsset rows for a collection. Paginated via ?page=&limit=.
   * Optional ?owner=<address> filter.
   */
  @Get(':id/assets')
  @UseGuards(AdminGuard)
  listAssets(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('owner') owner?: string,
  ) {
    return this.nftAssetCache.listAssets(
      id,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 100,
      owner,
    );
  }
}
