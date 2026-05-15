import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Logger, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioBus } from '@prisma/client';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { BoostService } from '../tick/boost.service';
import { NotificationService } from '../notification/notification.service';
import { EventService } from '../event/event.service';
import { GiftService } from '../gift/gift.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { NftCollectionService } from '../nft/nft-collection.service';
import { PrismaService } from '../../prisma/prisma.service';
import { objectStorageClient } from '../../integrations/object-storage/objectStorage';

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
    private nftCollectionService: NftCollectionService,
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
      { key: 'lootboxDef', name: 'Lootbox Definitions', table: 'lootbox_defs' },
      { key: 'bundleDef', name: 'Bundle Definitions', table: 'bundle_defs' },
      { key: 'checkInDef', name: 'Check-In Definitions', table: 'checkin_defs' },
      { key: 'questDef', name: 'Quest Definitions', table: 'quest_defs' },
      { key: 'shopItemDef', name: 'Shop Item Definitions', table: 'shop_item_defs' },
      { key: 'nftCollectionDef', name: 'NFT Collection Definitions', table: 'nft_collection_defs' },
      { key: 'modalDef', name: 'Modal Definitions', table: 'modal_defs' },
      { key: 'effectDef', name: 'Effect Definitions', table: 'effect_defs' },
      { key: 'tagDef', name: 'Visual Tag Definitions', table: 'tag_defs' },
      { key: 'visualEffectDef', name: 'Visual Effect Definitions', table: 'visual_effect_defs' },
      { key: 'homeBannerDef', name: 'Home Banners', table: 'home_banner_defs' },
      { key: 'systemIconDef', name: 'System Icon Definitions', table: 'system_icon_defs' },
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
    @Body() body: { userId: string; giftDefId: string; contextData?: Record<string, unknown> },
  ) {
    return this.giftService.createGiftForPlayer(
      body.userId,
      body.giftDefId,
      'admin',
      undefined,
      undefined,
      body.contextData,
    );
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

  @Post('backfill/entity-stats')
  async backfillEntityStats() {
    return this.adminService.backfillEntityStats();
  }

  @Post('backfill/nft-metadata')
  async backfillNftMetadata() {
    return this.nftCollectionService.backfillNftMetadata();
  }

  @Post('backfill/nft-entity-traits')
  async rebuildNftEntityTraits(@Query('collectionId') collectionId?: string) {
    return this.nftCollectionService.rebuildNftEntityTraits(collectionId);
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

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Query('targetDir') targetDir?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = pathsStr.split(',').map(p => p.trim()).filter(Boolean);
    if (!paths.length) throw new BadRequestException('PUBLIC_OBJECT_SEARCH_PATHS not configured');
    const firstPath = paths[0];
    const parts = firstPath.slice(1).split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = targetDir ? targetDir.replace(/^\/+|\/+$/g, '') : 'images';
    const objectName = prefix ? `${prefix}/${dir}/${safeFilename}` : `${dir}/${safeFilename}`;
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsFile = bucket.file(objectName);
    await gcsFile.save(file.buffer, { contentType: file.mimetype, resumable: false });
    const assetKey = `/${dir}/${safeFilename}`;
    return { assetKey, url: `/media${assetKey}` };
  }

  @Get('media/list')
  async listMedia() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = pathsStr.split(',').map(p => p.trim()).filter(Boolean);
    if (!paths.length) return [];
    const firstPath = paths[0];
    const parts = firstPath.slice(1).split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const searchPrefix = prefix ? `${prefix}/` : '';
    const bucket = objectStorageClient.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: searchPrefix });
    return files
      .filter(f => !f.name.endsWith('/'))
      .map(f => {
        const rel = searchPrefix ? f.name.replace(searchPrefix, '') : f.name;
        const assetKey = `/${rel}`;
        return { assetKey, name: f.name, url: `/media${assetKey}`, contentType: (f.metadata as any)?.contentType || '', size: (f.metadata as any)?.size || 0 };
      })
      .filter(f => f.assetKey !== '/');
  }

  @Get('media/system-icons')
  async listSystemIconsStatus() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = pathsStr.split(',').map(p => p.trim()).filter(Boolean);
    if (!paths.length) throw new BadRequestException('PUBLIC_OBJECT_SEARCH_PATHS not configured');
    const firstPath = paths[0];
    const parts = firstPath.slice(1).split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const bucket = objectStorageClient.bucket(bucketName);

    const iconDefs = await (this.prisma as any).systemIconDef.findMany({
      orderBy: { name: 'asc' },
    });

    const results = await Promise.all(
      iconDefs.map(async (def: { id: string; name: string }) => {
        const relPath = `images/icons/${def.id}.png`;
        const objectName = prefix ? `${prefix}/${relPath}` : relPath;
        const file = bucket.file(objectName);
        const [exists] = await file.exists();
        return {
          id: def.id,
          name: def.name,
          iconKey: def.id,
          type: 'system' as const,
          exists,
          url: exists ? `/media/${relPath}` : null,
        };
      }),
    );

    return results.sort((a: any, b: any) => a.name.localeCompare(b.name));
  }

  @Post('media/system-icons')
  async createSystemIconDef(@Body() body: { id: string; name: string }) {
    if (!body.id || typeof body.id !== 'string' || !/^[a-z0-9_]+$/.test(body.id)) {
      throw new BadRequestException('id must be a lowercase snake_case string');
    }
    if (!body.name || typeof body.name !== 'string') {
      throw new BadRequestException('name is required');
    }
    return (this.prisma as any).systemIconDef.create({ data: { id: body.id, name: body.name } });
  }

  @Delete('media/system-icons/:key')
  async deleteSystemIconDef(@Param('key') key: string) {
    const existing = await (this.prisma as any).systemIconDef.findUnique({ where: { id: key } });
    if (!existing) throw new BadRequestException(`System icon key '${key}' not found`);
    return (this.prisma as any).systemIconDef.delete({ where: { id: key } });
  }

  @Get('media/icons')
  async listIconsStatus() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = pathsStr.split(',').map(p => p.trim()).filter(Boolean);
    if (!paths.length) throw new BadRequestException('PUBLIC_OBJECT_SEARCH_PATHS not configured');
    const firstPath = paths[0];
    const parts = firstPath.slice(1).split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const bucket = objectStorageClient.bucket(bucketName);

    const [itemDefs, currencies] = await Promise.all([
      (this.prisma as any).itemDefinition.findMany({
        where: { iconKey: { not: null } },
        select: { id: true, name: true, iconKey: true },
      }),
      (this.prisma as any).currency.findMany({
        where: { iconKey: { not: null } },
        select: { id: true, name: true, iconKey: true },
      }),
    ]);

    const allDefs = [
      ...itemDefs.map((d: any) => ({ ...d, type: 'item' as const })),
      ...currencies.map((d: any) => ({ ...d, type: 'currency' as const })),
    ];

    // Mirror iconResolver semantics on the server: a leading `/` or any value
    // containing a slash is treated as a literal path under the bucket; a bare
    // key (no slash, no extension) shortcuts to `images/icons/<key>.png`.
    // Absolute URLs (`http(s)://`, `data:`, `blob:`) are skipped — we cannot
    // verify their existence in the public bucket.
    const results = await Promise.all(
      allDefs.map(async (def: any) => {
        const iconKey: string = def.iconKey;
        const trimmed = iconKey.trim();
        const isAbsolute = /^(https?:|data:|blob:)/i.test(trimmed);

        let relPath: string | null = null;
        if (!isAbsolute) {
          if (!trimmed.includes('/') && !/\.[a-z0-9]{2,5}$/i.test(trimmed)) {
            relPath = `images/icons/${trimmed}.png`;
          } else {
            relPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
          }
        }

        let exists = false;
        if (relPath) {
          const objectName = prefix ? `${prefix}/${relPath}` : relPath;
          const file = bucket.file(objectName);
          [exists] = await file.exists();
        } else {
          exists = true; // absolute URL — assume reachable
        }

        return {
          id: def.id,
          name: def.name,
          iconKey,
          type: def.type,
          exists,
          url: exists ? (isAbsolute ? trimmed : `/media/${relPath}`) : null,
        };
      }),
    );

    return results.sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'currency' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  @Get('jobs/recent')
  getRecentJobs(@Query('limit') limit?: string) {
    return this.adminService.getRecentJobs(Math.min(parseInt(limit || '10', 10) || 10, 50));
  }

  @Get('players/:id/jobs')
  getPlayerJobs(@Param('id') id: string) {
    return this.adminService.getPlayerJobs(id);
  }

  @Post('players/:id/jobs/:jobId/force-complete')
  forceCompleteJob(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.adminService.forceCompleteJob(id, jobId);
  }

  @Post('players/:id/items')
  grantItems(
    @Param('id') id: string,
    @Body() body: { itemId: string; quantity: number },
  ) {
    return this.adminService.grantItems(id, body.itemId, body.quantity);
  }

  @Get('players/:id/items')
  getPlayerItems(@Param('id') id: string) {
    return this.adminService.getPlayerItems(id);
  }

  @Get('item-defs')
  listItemDefs() {
    return this.adminService.listItemDefs();
  }

  @Put('players/:id/entities/:entityId')
  updatePlayerEntity(
    @Param('id') id: string,
    @Param('entityId') entityId: string,
    @Body() body: { stats?: any; level?: number; name?: string },
  ) {
    return this.adminService.updatePlayerEntity(id, entityId, body);
  }

  @Post('players/:id/locations/:locationId/settle')
  forceSettleLocation(@Param('id') id: string, @Param('locationId') locationId: string) {
    return this.adminService.forceSettleLocation(id, locationId);
  }

  @Get('players/:id/effects')
  getPlayerEffects(@Param('id') id: string) {
    return this.adminService.getPlayerEffects(id);
  }

  @Delete('players/:id/effects/:effectId')
  deletePlayerEffect(@Param('id') id: string, @Param('effectId') effectId: string) {
    return this.adminService.deletePlayerEffect(id, effectId);
  }

  @Get('players/:id/telemetry')
  getPlayerTelemetry(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.adminService.getPlayerTelemetry(id, parseInt(limit || '30', 10) || 30);
  }

  @Post('seeds/nft-entities')
  seedNftEntities() {
    return this.nftCollectionService.seedNftEntities();
  }

  @Get('balance/bundle')
  getBalanceBundle() {
    return this.adminService.getBalanceBundle();
  }

  // Dry-run an outcome spec through the canonical resolver functions
  // (loadBundleDefs + expandBundleRefs + resolveOutcomes). Read-only — no
  // currency credit, no inventory write, no flag persistence. Used by the
  // OutcomeListEditor "Test outcome" button so authors can verify a draft
  // bundle behaves as expected before saving.
  @Post('outcomes/test')
  testOutcome(@Body() body: { spec: any; userId?: string; seed?: string; iterations?: number }) {
    return this.adminService.testOutcome(body);
  }

  // ── Audio: SoundDef CRUD ─────────────────────────────────────────────────

  @Get('audio/sounds')
  listSoundDefs() {
    return this.prisma.soundDef.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post('audio/sounds')
  createSoundDef(@Body() body: { key: string; name: string; bus: AudioBus; fileKey?: string; description?: string }) {
    return this.prisma.soundDef.create({ data: body });
  }

  @Put('audio/sounds/:id')
  updateSoundDef(@Param('id') id: string, @Body() body: { key?: string; name?: string; bus?: AudioBus; fileKey?: string; description?: string; enabled?: boolean }) {
    return this.prisma.soundDef.update({ where: { id }, data: body });
  }

  @Delete('audio/sounds/:id')
  deleteSoundDef(@Param('id') id: string) {
    return this.prisma.soundDef.delete({ where: { id } });
  }

  // ── Audio: SoundMapping CRUD ─────────────────────────────────────────────

  @Get('audio/mappings')
  listSoundMappings() {
    return this.prisma.soundMapping.findMany({
      include: { soundDef: { select: { id: true, key: true, name: true, bus: true } } },
      orderBy: { actionKey: 'asc' },
    });
  }

  @Post('audio/mappings')
  createSoundMapping(@Body() body: { actionKey: string; soundDefId: string; weight?: number }) {
    return this.prisma.soundMapping.create({ data: body });
  }

  @Put('audio/mappings/:id')
  updateSoundMapping(@Param('id') id: string, @Body() body: { actionKey?: string; soundDefId?: string; weight?: number; enabled?: boolean }) {
    return this.prisma.soundMapping.update({ where: { id }, data: body });
  }

  @Delete('audio/mappings/:id')
  deleteSoundMapping(@Param('id') id: string) {
    return this.prisma.soundMapping.delete({ where: { id } });
  }

  @Post('audio/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const allowed = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp3', 'audio/x-wav'];
    if (!allowed.includes(file.mimetype) && !file.originalname.match(/\.(mp3|ogg|wav)$/i)) {
      throw new BadRequestException('Only .mp3, .ogg, and .wav files are allowed');
    }
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = pathsStr.split(',').map(p => p.trim()).filter(Boolean);
    if (!paths.length) throw new BadRequestException('PUBLIC_OBJECT_SEARCH_PATHS not configured');
    const firstPath = paths[0];
    const parts = firstPath.slice(1).split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = prefix ? `${prefix}/audio/${safeFilename}` : `audio/${safeFilename}`;
    const bucket = objectStorageClient.bucket(bucketName);
    const gcsFile = bucket.file(objectName);
    await gcsFile.save(file.buffer, { contentType: file.mimetype, resumable: false });
    const fileKey = `/audio/${safeFilename}`;
    return { fileKey, url: `/media${fileKey}` };
  }

  @Put('players/:id/bonus-outpost-slots')
  setBonusOutpostSlots(
    @Param('id') id: string,
    @Body() body: { slots: number },
  ) {
    return this.adminService.setBonusOutpostSlots(id, body.slots);
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
