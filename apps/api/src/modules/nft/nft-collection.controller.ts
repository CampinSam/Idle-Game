import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { NftCollectionService, CreateCollectionDto, UpdateCollectionDto } from './nft-collection.service';
import { NftImageImportService } from './nft-image-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { seedNftEntities } from '../../seeds/nft-entities.seed';

@Controller('nft/collections')
export class NftCollectionController {
  constructor(
    private nftCollectionService: NftCollectionService,
    private nftImageImportService: NftImageImportService,
    private prisma: PrismaService,
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

  @Post('seed/entities')
  @UseGuards(AdminGuard)
  async seedEntities() {
    return seedNftEntities(this.prisma);
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

  @Post(':id/import')
  @UseGuards(AdminGuard)
  importCollection(@Param('id') id: string) {
    return this.nftCollectionService.importCollection(id);
  }
}
