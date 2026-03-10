import { Controller, Get, Query, UseGuards, Req, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'))
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('items')
  async listItemDefs() {
    return this.inventoryService.listItemDefs();
  }

  @Get()
  async getInventory(@Req() req: any) {
    return this.inventoryService.getInventory(req.user.id);
  }

  @Get('ledger')
  async getLedger(
    @Req() req: any,
    @Query('itemId') itemId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.inventoryService.getLedger(
      req.user.id,
      itemId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
