import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { NftCollectionService, CreateCollectionDto, UpdateCollectionDto } from './nft-collection.service';

@Controller('nft/collections')
export class NftCollectionController {
  constructor(private nftCollectionService: NftCollectionService) {}

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
}
