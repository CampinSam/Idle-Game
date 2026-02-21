import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { BoostService } from '../tick/boost.service';
import { NotificationService } from '../notification/notification.service';
import { EventService } from '../event/event.service';
import { GiftService } from '../gift/gift.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private adminService: AdminService,
    private boostService: BoostService,
    private notificationService: NotificationService,
    private eventService: EventService,
    private giftService: GiftService,
    private settlementService: LocationSettlementService,
    private prisma: PrismaService,
  ) {}

  @Get('tables')
  getTables() {
    return [
      { key: 'displayDef', name: 'Display Definitions', table: 'display_defs' },
      { key: 'missionCategoryDef', name: 'Mission Categories', table: 'mission_category_defs' },
      { key: 'missionDef', name: 'Mission Definitions', table: 'mission_defs' },
      { key: 'recipeDef', name: 'Recipe Definitions', table: 'recipe_defs' },
      { key: 'buildingDef', name: 'Building Definitions', table: 'building_defs' },
      { key: 'roomDef', name: 'Room Definitions', table: 'room_defs' },
      { key: 'currency', name: 'Currencies', table: 'currencies' },
      { key: 'itemDef', name: 'Item Definitions', table: 'item_defs' },
      { key: 'entityDefinition', name: 'Entity Definitions', table: 'entity_definitions' },
      { key: 'bodySchema', name: 'Body Schemas', table: 'body_schemas' },
      { key: 'progressionProfile', name: 'Progression Profiles', table: 'progression_profiles' },
      { key: 'equipmentSchema', name: 'Equipment Schemas', table: 'equipment_schemas' },
      { key: 'traitDefinition', name: 'Trait Definitions', table: 'trait_definitions' },
      { key: 'regionDefinition', name: 'Region Definitions', table: 'region_definitions' },
      { key: 'locationDefinition', name: 'Location Definitions', table: 'location_definitions' },
      { key: 'eventDefinition', name: 'Event Definitions', table: 'event_definitions' },
      { key: 'giftDef', name: 'Gift Definitions', table: 'gift_defs' },
    ];
  }

  @Get('players/search')
  searchPlayers(@Query('q') query: string) {
    return this.adminService.searchPlayers(query || '');
  }

  @Get('players/:id')
  getPlayer(@Param('id') id: string) {
    return this.adminService.getPlayerProfile(id);
  }

  @Put('players/:id')
  updatePlayer(
    @Param('id') id: string,
    @Body() body: { keeperLevel?: number; keeperXp?: number | string; flags?: any; prestigeTokens?: number },
  ) {
    return this.adminService.updatePlayer(id, body);
  }

  @Put('players/:id/currency')
  setPlayerCurrency(
    @Param('id') id: string,
    @Body() body: { currencyId: string; balance: string | number },
  ) {
    return this.adminService.setPlayerCurrency(id, body.currencyId, body.balance);
  }

  @Post('players/:id/reset')
  resetPlayer(@Param('id') id: string) {
    return this.adminService.resetPlayer(id);
  }

  @Post('notifications/send')
  sendNotification(
    @Body() body: { userId: string; type: string; category: string; priority: string; title: string; body: string },
  ) {
    return this.notificationService.createNotification({
      userId: body.userId,
      type: body.type,
      category: body.category,
      priority: body.priority,
      title: body.title,
      body: body.body,
    });
  }

  @Post('events/dispatch')
  dispatchEvent(
    @Body() body: { userId: string; defId: string; payload?: any },
  ) {
    return this.eventService.dispatch(body.defId, body.payload || {}, {
      userId: body.userId,
      sourceType: 'admin',
    });
  }

  @Post('gifts/send')
  sendGift(
    @Body() body: { userId: string; giftDefId: string },
  ) {
    return this.giftService.createGiftForPlayer(body.userId, body.giftDefId, 'admin');
  }

  @Get('boosts/list')
  listBoosts() {
    return this.boostService.getAllBoosts();
  }

  @Post('boosts/create')
  createBoost(
    @Body() body: { name: string; description?: string; multiplier: number; durationMinutes: number },
  ) {
    return this.boostService.createBoost(body);
  }

  @Put('boosts/:id')
  async updateBoost(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.adminService.updateBoost(id, body);
  }

  @Delete('boosts/:id')
  cancelBoost(@Param('id') id: string) {
    return this.boostService.cancelBoost(id);
  }

  @Post('backfill/production-rates')
  async backfillProductionRates() {
    const locations = await (this.prisma as any).locationInstance.findMany({
      select: { id: true },
    });
    let updated = 0;
    let failed = 0;
    for (const loc of locations) {
      try {
        await this.settlementService.recalculateLocationMeta(loc.id);
        updated++;
      } catch (err) {
        this.logger.warn(`Backfill failed for location ${loc.id}: ${err}`);
        failed++;
      }
    }
    return { total: locations.length, updated, failed };
  }

  @Get(':table')
  list(@Param('table') table: string) {
    return this.adminService.listTable(table);
  }

  @Get(':table/:id')
  get(@Param('table') table: string, @Param('id') id: string) {
    return this.adminService.getRecord(table, id);
  }

  @Post(':table')
  create(@Param('table') table: string, @Body() body: any) {
    return this.adminService.createRecord(table, body);
  }

  @Put(':table/:id')
  update(@Param('table') table: string, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateRecord(table, id, body);
  }

  @Delete(':table/:id')
  remove(@Param('table') table: string, @Param('id') id: string) {
    return this.adminService.deleteRecord(table, id);
  }
}
