import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Logger, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, ParseIntPipe, DefaultValuePipe, Req, ParseArrayPipe, MethodNotAllowedException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioBus } from '@prisma/client';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminDraftService } from './admin-draft.service';
import { TABLE_KEY_TO_GROUP } from './admin-permissions';
import { ScreensService } from '../screens/screens.service';
import { GlobalPowerService } from '../global-power/global-power.service';
import { PowerDefService } from '../global-power/power-def.service';
import { NotificationService } from '../notification/notification.service';
import { EventService } from '../event/event.service';
import { GiftService } from '../gift/gift.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { NftCollectionService } from '../nft/nft-collection.service';
import { WalletService } from '../player/wallet.service';
import { CryptoWalletService } from '../payment/crypto-wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { objectStorageClient } from '../../integrations/object-storage/objectStorage';
import { GameMetricsService } from './game-metrics.service';
import { SeedSyncService, SEED_TABLE_ORDER } from '../../seeds/seed-sync.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private adminService: AdminService,
    private adminAuthService: AdminAuthService,
    private adminAuditService: AdminAuditService,
    private adminDraftService: AdminDraftService,
    private screensService: ScreensService,
    private globalPowerService: GlobalPowerService,
    private powerDefService: PowerDefService,
    private notificationService: NotificationService,
    private eventService: EventService,
    private giftService: GiftService,
    private settlementService: LocationSettlementService,
    private nftCollectionService: NftCollectionService,
    private walletService: WalletService,
    private cryptoWalletService: CryptoWalletService,
    private prisma: PrismaService,
    private authService: AuthService,
    private gameMetricsService: GameMetricsService,
    private seedSyncService: SeedSyncService,
  ) {}

  // ─── Identity ────────────────────────────────────────────────────────────────

  @Get('me')
  async getMe(@Req() req: any) {
    const adminUser = req.adminUser;
    if (adminUser.isBootstrap) {
      return {
        id: '__bootstrap__',
        username: '__bootstrap__',
        roleId: 'role_super_admin',
        role: {
          id: 'role_super_admin',
          name: 'Super Admin',
          slug: 'super_admin',
          permissionFlags: adminUser.perms,
        },
        contentScopes: [],
        permissionFlagsOverride: {},
        effectivePermissions: adminUser.perms,
        enabled: true,
        isBootstrap: true,
      };
    }
    return this.adminAuthService.getMe(adminUser.id);
  }

  @Post('me/password')
  async changeOwnPassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    if (req.adminUser.isBootstrap) {
      throw new BadRequestException('Bootstrap account password cannot be changed via the panel');
    }
    await this.adminAuthService.changeOwnPassword(req.adminUser.id, body.currentPassword, body.newPassword);
    return { success: true };
  }

  // ─── Roles ───────────────────────────────────────────────────────────────────

  @Get('roles')
  listRoles() {
    return this.adminAuthService.listRoles();
  }

  // ─── Account Management (Super Admin only) ────────────────────────────────

  @Get('accounts')
  listAccounts() {
    return this.adminAuthService.listAccounts();
  }

  @Post('accounts')
  async createAccount(
    @Req() req: any,
    @Body() body: { username: string; password: string; roleId: string; contentScopes?: string[] },
  ) {
    const account = await this.adminAuthService.createAccount(body);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'create_account',
      recordId: account.id,
      metadata: { username: account.username, roleId: account.roleId },
    });
    return account;
  }

  @Put('accounts/:id')
  async updateAccount(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { username?: string; password?: string; roleId?: string; contentScopes?: string[]; enabled?: boolean; permissionFlagsOverride?: Record<string, boolean> },
  ) {
    const account = await this.adminAuthService.updateAccount(id, body, req.adminUser.id);
    const { password: _pw, ...logBody } = body;
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'update_account',
      recordId: id,
      metadata: { changes: _pw ? { ...logBody, password: '[redacted]' } : logBody },
    });
    return account;
  }

  @Delete('accounts/:id')
  async deleteAccount(@Req() req: any, @Param('id') id: string) {
    await this.adminAuthService.deleteAccount(id, req.adminUser.id);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'delete_account',
      recordId: id,
    });
    return { success: true };
  }

  // ─── Audit Log (Super Admin only) ─────────────────────────────────────────

  @Get('audit-log')
  getAuditLog(
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('tableName') tableName?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminAuditService.list({
      adminId,
      action,
      tableName,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('tables')
  getTables(@Req() req: any) {
    const adminUser = req.adminUser;
    const isSuperAdmin = adminUser.role === 'super_admin';
    const canRead = isSuperAdmin || adminUser.perms?.read;
    const scopes: string[] = adminUser.scopes ?? [];

    const ALL_TABLES = [
      { key: 'displayDef',        name: 'Display Definitions',        table: 'display_defs',         group: 'UI' },
      { key: 'missionCategoryDef',name: 'Mission Categories',         table: 'mission_category_defs',group: 'Missions' },
      { key: 'missionDef',        name: 'Mission Definitions',        table: 'mission_defs',         group: 'Missions' },
      { key: 'recipeDef',         name: 'Recipe Definitions',         table: 'recipe_defs',          group: 'Crafting' },
      { key: 'buildingDef',       name: 'Building Definitions',       table: 'building_defs',        group: 'Locations' },
      { key: 'roomDef',           name: 'Room Definitions',           table: 'room_defs',            group: 'Locations' },
      { key: 'currency',          name: 'Currencies',                 table: 'currencies',           group: 'Economy' },
      { key: 'itemDef',           name: 'Item Definitions',           table: 'item_defs',            group: 'Economy' },
      { key: 'entityDefinition',  name: 'Entity Definitions',         table: 'entity_definitions',   group: 'Entities' },
      { key: 'regionDefinition',  name: 'Region Definitions',         table: 'region_definitions',   group: 'Locations' },
      { key: 'locationDefinition',name: 'Location Definitions',       table: 'location_definitions', group: 'Locations' },
      { key: 'eventDefinition',   name: 'Event Definitions',          table: 'event_definitions',    group: 'System' },
      { key: 'giftDef',           name: 'Gift Definitions',           table: 'gift_defs',            group: 'Rewards' },
      { key: 'lootboxDef',        name: 'Lootbox Definitions',        table: 'lootbox_defs',         group: 'Rewards' },
      { key: 'bundleDef',         name: 'Bundle Definitions',         table: 'bundle_defs',          group: 'Rewards' },
      { key: 'checkInDef',        name: 'Check-In Definitions',       table: 'checkin_defs',         group: 'Rewards' },
      { key: 'questDef',          name: 'Quest Definitions',          table: 'quest_defs',           group: 'Rewards' },
      { key: 'shopHeroDef',       name: 'Shop Hero Banners',          table: 'shop_hero_defs',       group: 'Store' },
      { key: 'shopTabDef',        name: 'Shop Tab Definitions',       table: 'shop_tab_defs',        group: 'Store' },
      { key: 'shopSectionDef',    name: 'Shop Section Definitions',   table: 'shop_section_defs',    group: 'Store' },
      { key: 'shopItemDef',       name: 'Shop Item Definitions',      table: 'shop_item_defs',       group: 'Store' },
      { key: 'nftCollectionDef',  name: 'NFT Collection Definitions', table: 'nft_collection_defs',  group: 'NFT' },
      { key: 'modalDef',          name: 'Modal Definitions',          table: 'modal_defs',           group: 'UI' },
      { key: 'defaultModalDef',   name: 'Default Modal Definitions',  table: 'default_modal_defs',   group: 'UI' },
      { key: 'effectDef',         name: 'Effect Definitions',         table: 'effect_defs',          group: 'Effects' },
      { key: 'powerDef',          name: 'Power Definitions',          table: 'power_defs',           group: 'Effects' },
      { key: 'tagDef',            name: 'Visual Tag Definitions',     table: 'tag_defs',             group: 'UI' },
      { key: 'visualEffectDef',   name: 'Visual Effect Definitions',  table: 'visual_effect_defs',   group: 'UI' },
      { key: 'homeBannerDef',     name: 'Home Banners',              table: 'home_banner_defs',     group: 'UI' },
      { key: 'systemIconDef',     name: 'System Icon Definitions',    table: 'system_icon_defs',     group: 'UI' },
      { key: 'synergyRule',       name: 'Synergy Rules',              table: 'synergy_rules',        group: 'Synergy' },
      { key: 'selectionRuleDef',  name: 'Selection Rule Definitions', table: 'selection_rule_defs',  group: 'Rules' },
      { key: 'telemetryDef',      name: 'Telemetry Definitions',      table: 'telemetry_defs',       group: 'Telemetry' },
      { key: 'gemPacks',          name: 'Gem Pack Display',           table: 'stripe.products',      group: 'Store' },
      { key: 'game-definitions',  name: 'Game Definitions',           table: 'game_definitions',     group: 'Screens' },
      { key: 'cryptoRateConfig',  name: 'Crypto Rate Config',         table: 'crypto_rate_configs',  group: 'Payments' },
    ];

    if (!canRead) return [];
    if (isSuperAdmin) return ALL_TABLES;
    if (scopes.length === 0) return [];
    return ALL_TABLES.filter((t) => scopes.includes(t.group));
  }

  // ─── Game Definitions: dedicated CRUD ────────────────────────────────────

  @Get('game-definitions')
  listGameDefinitions(@Query('key') key?: string) {
    return this.screensService.listByKey(key);
  }

  @Get('game-definitions/:id')
  getGameDefinition(@Param('id') id: string) {
    return this.screensService.getById(id);
  }

  @Post('game-definitions')
  async createGameDefinition(
    @Req() req: any,
    @Body() body: {
      type: string;
      key: string;
      version: number;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
      data: Record<string, any>;
    },
  ) {
    if (req.adminUser.role !== 'super_admin') {
      const recordId = `${body.type}:${body.key}:v${body.version}`;
      const draft = await this.adminDraftService.createDraft({
        tableName: 'game-definitions',
        recordId,
        operation: 'create',
        payload: body,
        authorId: req.adminUser.id,
      });
      return { mode: 'draft' as const, draftId: draft.id, tableName: 'game-definitions', recordId, operation: 'create', status: 'pending', authorUsername: (draft as any).author?.username };
    }
    const result = await this.screensService.create(body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'game_definition_create', tableName: 'game_definitions', diff: { key: body.key, version: body.version, type: body.type }, metadata: { bypassReview: true } });
    void this.seedSyncService.syncTable('gameDefinition');
    return result;
  }

  @Put('game-definitions/:id')
  async updateGameDefinition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
      data?: Record<string, any>;
    },
  ) {
    if (req.adminUser.role !== 'super_admin') {
      const draft = await this.adminDraftService.createDraft({
        tableName: 'game-definitions',
        recordId: id,
        operation: 'update',
        payload: body,
        authorId: req.adminUser.id,
      });
      return { mode: 'draft' as const, draftId: draft.id, tableName: 'game-definitions', recordId: id, operation: 'update', status: 'pending', authorUsername: (draft as any).author?.username };
    }
    const result = await this.screensService.update(id, body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'game_definition_update', tableName: 'game_definitions', recordId: id, metadata: { bypassReview: true } });
    void this.seedSyncService.syncTable('gameDefinition');
    return result;
  }

  @Delete('game-definitions/:id')
  async archiveGameDefinition(@Req() req: any, @Param('id') id: string) {
    if (req.adminUser.role !== 'super_admin') {
      const draft = await this.adminDraftService.createDraft({
        tableName: 'game-definitions',
        recordId: id,
        operation: 'delete',
        payload: {},
        authorId: req.adminUser.id,
      });
      return { mode: 'draft' as const, draftId: draft.id, tableName: 'game-definitions', recordId: id, operation: 'delete', status: 'pending', authorUsername: (draft as any).author?.username };
    }
    const result = await this.screensService.archive(id);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'game_definition_archive', tableName: 'game_definitions', recordId: id, metadata: { bypassReview: true } });
    void this.seedSyncService.syncTable('gameDefinition');
    return result;
  }

  @Post('game-definitions/:key/:version/publish')
  async publishGameDefinition(
    @Req() req: any,
    @Param('key') key: string,
    @Param('version', ParseIntPipe) version: number,
    @Query('type') type?: string,
  ) {
    const result = await this.screensService.publish(key, version, type);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'game_definition_publish', tableName: 'game_definitions', diff: { key, version, type } });
    return result;
  }

  @Post('game-definitions/:key/:version/rollback')
  async rollbackGameDefinition(
    @Req() req: any,
    @Param('key') key: string,
    @Param('version', ParseIntPipe) version: number,
    @Query('type') type?: string,
  ) {
    const result = await this.screensService.rollback(key, version, type);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'game_definition_rollback', tableName: 'game_definitions', diff: { key, version, type } });
    return result;
  }

  @Get('instances/entities')
  async listEntityInstances(
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('userId') userId?: string,
    @Query('definitionId') definitionId?: string,
    @Query('status') status?: string,
    @Query('nftCollectionDefId') nftCollectionDefId?: string,
  ) {
    const search = (q ?? '').trim();
    const pageSize = Math.min(limit ?? 50, 100);
    const offset = (Math.max(page ?? 1, 1) - 1) * pageSize;
    const userIdParam = userId ?? null;
    const defIdParam = definitionId ?? null;
    const statusParam = status ?? null;
    const nftParam = nftCollectionDefId ?? null;

    const items = await this.prisma.$queryRaw<any[]>`
      SELECT
        e.id,
        COALESCE(e."display"->>'name', '') AS name,
        e."definitionId",
        COALESCE(ed.name, e."definitionId") AS "definitionName",
        COALESCE((e.progression->>'level')::int, 1) AS level,
        COALESCE(e."state"->>'status', 'idle') AS status,
        e."ownerUserId",
        u.username AS "ownerUsername",
        e."nftAssetId",
        e."nftCollectionDefId",
        e.stats,
        NULL::text AS rarity,
        e."createdAt"
      FROM entities e
      LEFT JOIN users u ON u.id = e."ownerUserId"
      LEFT JOIN entity_definitions ed ON ed.id = e."definitionId"
      WHERE (
        ${search} = ''
        OR e."display"->>'name' ILIKE ${'%' + search + '%'}
        OR e.id ILIKE ${'%' + search + '%'}
        OR u.username ILIKE ${'%' + search + '%'}
      )
        AND (${userIdParam}::text IS NULL OR e."ownerUserId" = ${userIdParam})
        AND (${defIdParam}::text IS NULL OR e."definitionId" = ${defIdParam})
        AND (${statusParam}::text IS NULL OR e."state"->>'status' = ${statusParam})
        AND (${nftParam}::text IS NULL OR e."nftCollectionDefId" = ${nftParam})
      ORDER BY e."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const [{ total }] = await this.prisma.$queryRaw<[{ total: number }]>`
      SELECT COUNT(*)::int AS total
      FROM entities e
      LEFT JOIN users u ON u.id = e."ownerUserId"
      WHERE (
        ${search} = ''
        OR e."display"->>'name' ILIKE ${'%' + search + '%'}
        OR e.id ILIKE ${'%' + search + '%'}
        OR u.username ILIKE ${'%' + search + '%'}
      )
        AND (${userIdParam}::text IS NULL OR e."ownerUserId" = ${userIdParam})
        AND (${defIdParam}::text IS NULL OR e."definitionId" = ${defIdParam})
        AND (${statusParam}::text IS NULL OR e."state"->>'status' = ${statusParam})
        AND (${nftParam}::text IS NULL OR e."nftCollectionDefId" = ${nftParam})
    `;

    return { items, total, page: page ?? 1, limit: pageSize };
  }

  @Get('instances/locations')
  async listLocationInstances(
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('userId') userId?: string,
    @Query('definitionId') definitionId?: string,
    @Query('enabled') enabled?: string,
    @Query('nftCollectionDefId') nftCollectionDefId?: string,
  ) {
    const search = (q ?? '').trim();
    const pageSize = Math.min(limit ?? 50, 100);
    const offset = (Math.max(page ?? 1, 1) - 1) * pageSize;
    const userIdParam = userId ?? null;
    const defIdParam = definitionId ?? null;
    const enabledParam = enabled === 'true' ? true : enabled === 'false' ? false : null;
    const nftParam = nftCollectionDefId ?? null;

    const items = await this.prisma.$queryRaw<any[]>`
      SELECT
        li.id,
        COALESCE(li."state"->>'nftName', li."definitionId") AS name,
        li."definitionId",
        COALESCE(ld.kind, li."definitionId") AS "definitionName",
        li.level,
        li.enabled,
        li."ownerUserId",
        u.username AS "ownerUsername",
        li."nftAssetId",
        na."collectionId" AS "nftCollectionDefId",
        li.storage,
        li."createdAt"
      FROM location_instances li
      LEFT JOIN users u ON u.id = li."ownerUserId"
      LEFT JOIN location_definitions ld ON ld.id = li."definitionId"
      LEFT JOIN nft_assets na ON na."nftAssetId" = li."nftAssetId"
      WHERE (
        ${search} = ''
        OR li."state"->>'nftName' ILIKE ${'%' + search + '%'}
        OR li.id ILIKE ${'%' + search + '%'}
        OR u.username ILIKE ${'%' + search + '%'}
      )
        AND (${userIdParam}::text IS NULL OR li."ownerUserId" = ${userIdParam})
        AND (${defIdParam}::text IS NULL OR li."definitionId" = ${defIdParam})
        AND (${enabledParam}::boolean IS NULL OR li.enabled = ${enabledParam})
        AND (${nftParam}::text IS NULL OR na."collectionId" = ${nftParam})
      ORDER BY li."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const [{ total }] = await this.prisma.$queryRaw<[{ total: number }]>`
      SELECT COUNT(*)::int AS total
      FROM location_instances li
      LEFT JOIN users u ON u.id = li."ownerUserId"
      LEFT JOIN nft_assets na ON na."nftAssetId" = li."nftAssetId"
      WHERE (
        ${search} = ''
        OR li."state"->>'nftName' ILIKE ${'%' + search + '%'}
        OR li.id ILIKE ${'%' + search + '%'}
        OR u.username ILIKE ${'%' + search + '%'}
      )
        AND (${userIdParam}::text IS NULL OR li."ownerUserId" = ${userIdParam})
        AND (${defIdParam}::text IS NULL OR li."definitionId" = ${defIdParam})
        AND (${enabledParam}::boolean IS NULL OR li.enabled = ${enabledParam})
        AND (${nftParam}::text IS NULL OR na."collectionId" = ${nftParam})
    `;

    return { items, total, page: page ?? 1, limit: pageSize };
  }

  @Get('entities')
  async listEntities(
    @Query('q') query?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const cap = Math.min(limit ?? 50, 100);
    const q = query?.trim() ?? '';
    type Row = { id: string; display: unknown };
    let rows: Row[];
    if (q) {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT id, display
        FROM entities
        WHERE display->>'name' ILIKE ${'%' + q + '%'}
           OR id ILIKE ${'%' + q + '%'}
        ORDER BY display->>'name' ASC NULLS LAST
        LIMIT ${cap}
      `;
    } else {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT id, display
        FROM entities
        ORDER BY display->>'name' ASC NULLS LAST
        LIMIT ${cap}
      `;
    }
    return rows.map(r => {
      const rawName = (r.display as any)?.name;
      const name = typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : r.id.slice(0, 12);
      return { id: r.id, name };
    });
  }

  @Get('players/count')
  getPlayerCount() {
    return this.adminService.getPlayerCount();
  }

  @Get('system/health')
  getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('players')
  listPlayers(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.adminService.listPlayers({
      q,
      page: parsedPage && !isNaN(parsedPage) ? parsedPage : undefined,
      limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Post('players/:id/nft/resync')
  resyncPlayerNfts(@Param('id') id: string) {
    return this.adminService.resyncPlayerNfts(id);
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
  async updatePlayer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { keeperLevel?: number; keeperXp?: number | string; flags?: any; prestigeTokens?: number },
  ) {
    const result = await this.adminService.updatePlayer(id, body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_update', recordId: id, diff: body });
    return result;
  }

  @Put('players/:id/currency')
  async setPlayerCurrency(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { currencyId: string; balance: string | number },
  ) {
    const result = await this.adminService.setPlayerCurrency(id, body.currencyId, body.balance);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_set_currency', recordId: id, diff: body });
    return result;
  }

  @Post('players/:id/reset')
  async resetPlayer(@Req() req: any, @Param('id') id: string) {
    const result = await this.adminService.resetPlayer(id);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_reset', recordId: id });
    return result;
  }

  @Post('players/:id/generate-reset-link')
  async generateResetLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { appUrl?: string },
  ) {
    const result = await this.authService.adminGenerateResetLink(id, body?.appUrl);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_generate_reset_link', recordId: id });
    return result;
  }

  @Post('notifications/send')
  async sendNotification(
    @Req() req: any,
    @Body() body: { userId: string; type: string; category: string; priority: string; title: string; body: string },
  ) {
    const result = await this.notificationService.createNotification({
      userId: body.userId,
      type: body.type,
      category: body.category,
      priority: body.priority,
      title: body.title,
      body: body.body,
    });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'notification_send', recordId: body.userId, diff: { type: body.type, title: body.title } });
    return result;
  }

  @Post('events/dispatch')
  async dispatchEvent(
    @Req() req: any,
    @Body() body: { userId: string; defId: string; payload?: any },
  ) {
    const result = await this.eventService.dispatch(body.defId, body.payload || {}, {
      userId: body.userId,
      sourceType: 'admin',
    });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'event_dispatch', recordId: body.userId, diff: { defId: body.defId } });
    return result;
  }

  @Post('gifts/send')
  async sendGift(
    @Req() req: any,
    @Body() body: { userId: string; giftDefId: string; contextData?: Record<string, unknown> },
  ) {
    const result = await this.giftService.createGiftForPlayer(
      body.userId,
      { giftDefId: body.giftDefId },
      'admin',
      undefined,
      undefined,
      body.contextData,
    );
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'gift_send', recordId: body.userId, diff: { giftDefId: body.giftDefId } });
    return result;
  }

  @Post('backfill/item-rarity')
  async backfillItemRarity(@Req() req: any) {
    const result = await this.adminService.backfillItemRarity();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_item_rarity' });
    return result;
  }

  @Post('backfill/entity-stats')
  async backfillEntityStats(@Req() req: any) {
    const result = await this.adminService.backfillEntityStats();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_entity_stats' });
    return result;
  }

  @Post('backfill/nft-metadata')
  async backfillNftMetadata(@Req() req: any) {
    const result = await this.nftCollectionService.backfillNftMetadata();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_nft_metadata' });
    return result;
  }

  @Post('backfill/nft-entity-traits')
  async rebuildNftEntityTraits(@Req() req: any, @Query('collectionId') collectionId?: string) {
    const result = await this.nftCollectionService.rebuildNftEntityTraits(collectionId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_nft_entity_traits', diff: { collectionId } });
    return result;
  }

  @Post('entities/:id/regenerate')
  async regenerateEntity(@Req() req: any, @Param('id') id: string) {
    if (req.adminUser.role !== 'super_admin') {
      throw new ForbiddenException('Requires super_admin role');
    }
    const result = await this.adminService.regenerateEntity(id);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'entity_regenerate',
      diff: { entityId: id, before: result.before, after: result.after },
    });
    return result;
  }

  @Get('entity-collections')
  async getEntityCollections(@Req() req: any) {
    return this.adminService.getEntityCollections();
  }

  @Get('entity-collections/:definitionId/job')
  async getEntityCollectionJob(@Req() req: any, @Param('definitionId') definitionId: string) {
    return this.adminService.getEntityCollectionJob(definitionId);
  }

  @Post('entity-collections/:definitionId/regenerate')
  async startEntityCollectionRebuild(@Req() req: any, @Param('definitionId') definitionId: string) {
    if (req.adminUser.role !== 'super_admin') {
      throw new ForbiddenException('Requires super_admin role');
    }
    const result = await this.adminService.startEntityCollectionRebuild(definitionId);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'entity_collection_rebuild_start',
      diff: { definitionId, total: result.total },
    });
    return result;
  }

  @Post('backfill/screen-composer-uuids')
  async backfillScreenComposerUuids(@Req() req: any) {
    const result = await this.adminService.backfillScreenComposerUuids();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_screen_composer_uuids', diff: { total: result.total, updated: result.updated, unresolvable: result.unresolvable.length } });
    return result;
  }

  @Post('backfill/def-blob-uuids')
  async backfillDefBlobUuids(@Req() req: any) {
    const result = await this.adminService.backfillDefBlobUuids();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_def_blob_uuids', diff: { totalUpdated: result.totalUpdated } });
    return result;
  }

  /**
   * GET /admin/audit/def-blob-uuids
   *
   * Read-only scan of all JSON blob fields covered by the def-blob-uuids backfill.
   * Reports every non-UUID key / bundleDefId / giftDefId that remains in the DB.
   *
   * Response shape:
   *   findings[]         — full list of stragglers with model, recordId, fieldPath, value
   *   summary            — per-model counts { total, clean, hasFinding }
   *   totalFindings      — integer count
   *   safeToRemoveFallback — true when totalFindings === 0 (fallback lookup can be dropped)
   */
  @Get('audit/def-blob-uuids')
  async auditDefBlobUuids() {
    return this.adminService.auditDefBlobUuids();
  }

  @Post('backfill/production-rates')
  async backfillProductionRates(@Req() req: any) {
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
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'backfill_production_rates', diff: { total: locations.length, updated, failed } });
    return { total: locations.length, updated, failed };
  }

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @Req() req: any,
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
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'media_upload', diff: { assetKey, contentType: file.mimetype } });
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
  async createSystemIconDef(@Req() req: any, @Body() body: { id: string; name: string }) {
    if (!body.id || typeof body.id !== 'string' || !/^[a-z0-9_]+$/.test(body.id)) {
      throw new BadRequestException('id must be a lowercase snake_case string');
    }
    if (!body.name || typeof body.name !== 'string') {
      throw new BadRequestException('name is required');
    }
    const result = await (this.prisma as any).systemIconDef.create({ data: { id: body.id, name: body.name } });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'system_icon_create', recordId: body.id, diff: body });
    void this.seedSyncService.syncTable('systemIconDef');
    return result;
  }

  @Delete('media/system-icons/:key')
  async deleteSystemIconDef(@Req() req: any, @Param('key') key: string) {
    const existing = await (this.prisma as any).systemIconDef.findFirst({ where: { OR: [{ id: key }, { key }] } });
    if (!existing) throw new BadRequestException(`System icon key '${key}' not found`);
    const result = await (this.prisma as any).systemIconDef.delete({ where: { id: existing.id } });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'system_icon_delete', recordId: key });
    void this.seedSyncService.syncTable('systemIconDef');
    return result;
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
  async forceCompleteJob(@Req() req: any, @Param('id') id: string, @Param('jobId') jobId: string) {
    const result = await this.adminService.forceCompleteJob(id, jobId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'job_force_complete', recordId: id, diff: { jobId } });
    return result;
  }

  @Post('players/:id/items')
  async grantItems(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { itemId: string; quantity: number },
  ) {
    const result = await this.adminService.grantItems(id, body.itemId, body.quantity);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_grant_items', recordId: id, diff: body });
    return result;
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
  async updatePlayerEntity(
    @Req() req: any,
    @Param('id') id: string,
    @Param('entityId') entityId: string,
    @Body() body: { stats?: any; level?: number; name?: string; traits?: unknown },
  ) {
    const result = await this.adminService.updatePlayerEntity(id, entityId, body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_update_entity', recordId: entityId, diff: body, metadata: { userId: id } });
    return result;
  }

  @Post('players/:id/locations/:locationId/settle')
  async forceSettleLocation(@Req() req: any, @Param('id') id: string, @Param('locationId') locationId: string) {
    const result = await this.adminService.forceSettleLocation(id, locationId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'location_force_settle', recordId: locationId, metadata: { userId: id } });
    return result;
  }

  @Get('players/:id/effects')
  getPlayerEffects(@Param('id') id: string) {
    return this.adminService.getPlayerEffects(id);
  }

  @Delete('players/:id/effects/:effectId')
  async deletePlayerEffect(@Req() req: any, @Param('id') id: string, @Param('effectId') effectId: string) {
    const result = await this.adminService.deletePlayerEffect(id, effectId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_delete_effect', recordId: effectId, metadata: { userId: id } });
    return result;
  }

  @Get('players/:id/wallets')
  listPlayerWallets(@Param('id') id: string) {
    return this.walletService.listWallets(id);
  }

  @Post('players/:id/wallets')
  async addPlayerWallet(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { chain: string; address: string },
  ) {
    const { chain, address } = body;
    if (!chain || !address?.trim()) {
      throw new BadRequestException('chain and address are required');
    }
    await this.walletService.addManualWallet(id, chain, address);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_add_wallet', recordId: id, diff: { chain } });
    return { success: true };
  }

  @Delete('players/:id/wallets/:walletId')
  async removePlayerWallet(@Req() req: any, @Param('id') id: string, @Param('walletId') walletId: string) {
    const result = await this.walletService.adminRemoveWallet(id, walletId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_remove_wallet', recordId: walletId, metadata: { userId: id } });
    return result;
  }

  @Post('players/:id/wallets/:walletId/normalize')
  async normalizePlayerWallet(@Req() req: any, @Param('id') id: string, @Param('walletId') walletId: string) {
    const result = await this.walletService.normalizeWalletAddress(id, walletId);
    if (result.changed) {
      await this.adminAuditService.log({
        adminId: req.adminUser.id,
        action: 'player_normalize_wallet_address',
        recordId: walletId,
        diff: { address: result.address },
        metadata: { userId: id },
      });
    }
    return result;
  }

  @Post('players/:userId/entities/:entityId/reconcile-status')
  async reconcileEntityStatus(
    @Req() req: any,
    @Param('userId') userId: string,
    @Param('entityId') entityId: string,
  ) {
    const result = await this.adminService.reconcileEntityStatus(userId, entityId);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'entity_reconcile_status', recordId: entityId, metadata: { userId } });
    return result;
  }

  @Get('players/:userId/entities/:entityId/power-usage')
  getEntityPowerUsage(
    @Param('userId') userId: string,
    @Param('entityId') entityId: string,
  ) {
    return this.adminService.getEntityPowerUsage(userId, entityId);
  }

  @Delete('players/:userId/entities/:entityId/power-usage/:powerKey')
  async resetEntityPowerUsage(
    @Req() req: any,
    @Param('userId') userId: string,
    @Param('entityId') entityId: string,
    @Param('powerKey') powerKey: string,
  ) {
    const result = await this.adminService.resetEntityPowerUsage(userId, entityId, powerKey);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'entity_reset_power_usage', recordId: entityId, diff: { powerKey }, metadata: { userId } });
    return result;
  }

  @Get('players/:id/telemetry')
  getPlayerTelemetry(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.adminService.getPlayerTelemetry(id, parseInt(limit || '30', 10) || 30);
  }

  @Get('player-events')
  listPlayerEvents(
    @Query('userId') userId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listPlayerEvents({
      userId: userId || undefined,
      eventType: eventType || undefined,
      limit: parseInt(limit || '50', 10) || 50,
    });
  }

  @Post('seeds/nft-entities')
  async seedNftEntities(@Req() req: any) {
    const result = await this.nftCollectionService.seedNftEntities();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'seeds_nft_entities', diff: result });
    return result;
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
  async createSoundDef(@Req() req: any, @Body() body: { key: string; name: string; bus: AudioBus; fileKey?: string; description?: string }) {
    const result = await this.prisma.soundDef.create({ data: body });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_sound_create', recordId: result.id, diff: { key: body.key, bus: body.bus } });
    void this.seedSyncService.syncTable('soundDef');
    return result;
  }

  @Put('audio/sounds/:id')
  async updateSoundDef(@Req() req: any, @Param('id') id: string, @Body() body: { key?: string; name?: string; bus?: AudioBus; fileKey?: string; description?: string; enabled?: boolean }) {
    const result = await this.prisma.soundDef.update({ where: { id }, data: body });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_sound_update', recordId: id, diff: body });
    void this.seedSyncService.syncTable('soundDef');
    return result;
  }

  @Delete('audio/sounds/:id')
  async deleteSoundDef(@Req() req: any, @Param('id') id: string) {
    const result = await this.prisma.soundDef.delete({ where: { id } });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_sound_delete', recordId: id });
    void this.seedSyncService.syncTable('soundDef');
    return result;
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
  async createSoundMapping(@Req() req: any, @Body() body: { actionKey: string; soundDefId: string; weight?: number }) {
    const result = await this.prisma.soundMapping.create({ data: body });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_mapping_create', recordId: result.id, diff: { actionKey: body.actionKey, soundDefId: body.soundDefId } });
    return result;
  }

  @Put('audio/mappings/:id')
  async updateSoundMapping(@Req() req: any, @Param('id') id: string, @Body() body: { actionKey?: string; soundDefId?: string; weight?: number; enabled?: boolean }) {
    const result = await this.prisma.soundMapping.update({ where: { id }, data: body });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_mapping_update', recordId: id, diff: body });
    return result;
  }

  @Delete('audio/mappings/:id')
  async deleteSoundMapping(@Req() req: any, @Param('id') id: string) {
    const result = await this.prisma.soundMapping.delete({ where: { id } });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_mapping_delete', recordId: id });
    return result;
  }

  @Post('audio/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @Req() req: any,
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
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'audio_upload', diff: { fileKey, contentType: file.mimetype } });
    return { fileKey, url: `/media${fileKey}` };
  }

  @Put('players/:id/bonus-outpost-slots')
  async setBonusOutpostSlots(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { slots: number },
  ) {
    const result = await this.adminService.setBonusOutpostSlots(id, body.slots);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'player_set_bonus_slots', recordId: id, diff: body });
    return result;
  }

  // ─── Effect Defs (read-only for admin power creation) ───────────────────────

  @Get('effect-defs')
  async getEffectDefs() {
    const defs = await (this.prisma as any).effectDef.findMany({
      where: { enabled: true },
      select: { id: true, name: true, category: true, valueMode: true, value: true, durationModel: true, targetType: true, description: true },
      orderBy: { name: 'asc' },
    });
    return defs;
  }

  // ─── Power Definitions ─────────────────────────────────────────────────────

  @Get('power-defs')
  listPowerDefs(@Query('enabled') enabled?: string) {
    const opts = enabled !== undefined ? { enabled: enabled !== 'false' } : {};
    return this.powerDefService.list(opts);
  }

  @Get('power-defs/:id')
  getPowerDef(@Param('id') id: string) {
    return this.powerDefService.getById(id);
  }

  @Post('power-defs')
  async createPowerDef(
    @Req() req: any,
    @Body() body: {
      id: string;
      name: string;
      description?: string;
      powerType: string;
      effectDefId?: string | null;
      defaultValue?: number;
      defaultValueMode?: string;
      defaultDurationMinutes?: number;
      defaultDailyLimit?: number;
      defaultScope?: string;
      selection?: any;
      enabled?: boolean;
    },
  ) {
    const result = await this.powerDefService.create(body);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'power_def_create',
      recordId: result.id,
      diff: { name: body.name, powerType: body.powerType },
    });
    void this.seedSyncService.syncTable('powerDef');
    return result;
  }

  @Put('power-defs/:id')
  async updatePowerDef(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      description: string | null;
      powerType: string;
      effectDefId: string | null;
      defaultValue: number;
      defaultValueMode: string;
      defaultDurationMinutes: number;
      defaultDailyLimit: number;
      defaultScope: string;
      selection: any;
      enabled: boolean;
    }>,
  ) {
    const result = await this.powerDefService.update(id, body);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'power_def_update',
      recordId: id,
      diff: body,
    });
    void this.seedSyncService.syncTable('powerDef');
    return result;
  }

  @Delete('power-defs/:id')
  async deletePowerDef(@Req() req: any, @Param('id') id: string) {
    const result = await this.powerDefService.delete(id);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'power_def_delete',
      recordId: id,
    });
    void this.seedSyncService.syncTable('powerDef');
    return result;
  }

  // ─── Global Active Powers ───────────────────────────────────────────────────

  @Get('global-powers')
  getGlobalPowers(@Query('all') all?: string) {
    return all === 'true'
      ? this.globalPowerService.getAllPowers()
      : this.globalPowerService.getActiveAndScheduledPowers();
  }

  @Post('global-powers')
  async createGlobalPower(
    @Req() req: any,
    @Body() body: {
      label: string;
      /** null → tick_speed_boost (uses BoostEvent machinery, not effect resolver) */
      effectDefId: string | null;
      effectOverrides?: Record<string, any>;
      selection?: Record<string, any>;
      durationMinutes: number;
      scheduledFor?: string;
      triggeredByUserId?: string;
    },
  ) {
    if (!body.label) throw new BadRequestException('label is required');
    if (body.effectDefId === undefined) throw new BadRequestException('effectDefId is required (use null for tick_speed_boost)');
    if (!body.durationMinutes) throw new BadRequestException('durationMinutes is required');
    const result = await this.globalPowerService.createPower({
      label: body.label,
      effectDefId: body.effectDefId,
      effectOverrides: body.effectOverrides as any,
      selection: body.selection as any,
      durationMinutes: body.durationMinutes,
      scheduledFor: body.scheduledFor,
      triggeredByUserId: body.triggeredByUserId,
    });
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'global_power_create', diff: { label: body.label, effectDefId: body.effectDefId, durationMinutes: body.durationMinutes } });
    return result;
  }

  @Delete('global-powers/:id')
  async cancelGlobalPower(@Req() req: any, @Param('id') id: string) {
    const result = await this.globalPowerService.cancelPower(id);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'global_power_cancel', recordId: id });
    return result;
  }

  @Post('selection/evaluate')
  evaluateSelection(
    @Body() body: {
      rule: any;
      userId: string;
      entityIds?: string[];
      activityContext?: {
        activityType?: string;
        missionType?: string;
        missionTags?: string[];
        regionId?: string;
        seasonId?: string;
      };
    },
  ) {
    return this.adminService.evaluateSelection(body);
  }

  // ─── Gem Pack Display ─────────────────────────────────────────────────────

  @Get('gemPacks')
  listGemPacks() {
    return this.adminService.listAdminGemPacks();
  }

  @Get('gemPacks/:packId')
  getGemPack(@Param('packId') packId: string) {
    return this.adminService.getAdminGemPack(packId);
  }

  @Put('gemPacks/:packId')
  async updateGemPack(
    @Req() req: any,
    @Param('packId') packId: string,
    @Body() body: {
      displayName?: string;
      accentColor?: string;
      borderColor?: string;
      glowColor?: string;
      badgeType?: string | null;
      badgeLabel?: string | null;
      iconSize?: number;
    },
  ) {
    if (req.adminUser.role !== 'super_admin') {
      const draft = await this.adminDraftService.createDraft({
        tableName: 'gemPacks',
        recordId: packId,
        operation: 'update',
        payload: body,
        authorId: req.adminUser.id,
      });
      return { mode: 'draft' as const, draftId: draft.id, tableName: 'gemPacks', recordId: packId, operation: 'update', status: 'pending', authorUsername: (draft as any).author?.username };
    }
    const result = await this.adminService.updateAdminGemPack(packId, body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'gem_pack_update', recordId: packId, diff: body, metadata: { bypassReview: true } });
    return result;
  }

  // ─── Crypto Wallet Admin ─────────────────────────────────────────────────────

  @Get('crypto/config')
  getCryptoConfig() {
    return this.cryptoWalletService.getConfig();
  }

  @Put('crypto/config')
  async updateCryptoConfig(
    @Req() req: any,
    @Body() body: {
      hotWalletAddress?: string;
      blockfrostProjectId?: string;
      hotWalletSkeyHex?: string;
      adaWithdrawalFee?: number;
      adaMinWithdrawalAmount?: number;
    },
  ) {
    const result = await this.cryptoWalletService.updateConfig(body);
    const { hotWalletSkeyHex: _skey, ...safeDiff } = body;
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'crypto_config_update', diff: safeDiff });
    return result;
  }

  @Post('crypto/wallet/generate')
  async generateHotWallet(
    @Req() req: any,
    @Body() body: { confirm?: boolean },
  ) {
    if (!body.confirm) {
      throw new BadRequestException('Must pass { confirm: true } to generate a new wallet');
    }

    const pendingWithdrawals = await (this.prisma as any).cryptoWithdrawal.count({
      where: { status: { in: ['APPROVED', 'PROCESSING'] } },
    });
    if (pendingWithdrawals > 0) {
      throw new BadRequestException(
        `Cannot cycle wallet: ${pendingWithdrawals} withdrawal(s) are in APPROVED or PROCESSING state. ` +
        'Resolve all pending withdrawals before cycling the wallet.',
      );
    }

    const { address } = await this.cryptoWalletService.generateHotWallet();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'crypto_wallet_generate', diff: { address } });
    return { address, pendingDownload: true };
  }

  @Post('crypto/wallet/claim-key')
  async claimHotWalletKey(@Req() req: any) {
    const result = await this.cryptoWalletService.claimPendingKeyDownload();
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'crypto_wallet_key_claimed' });
    return result;
  }

  @Get('crypto/balance')
  getCryptoBalance() {
    return this.cryptoWalletService.getHotWalletBalance();
  }

  @Get('crypto/withdrawals')
  getCryptoWithdrawals(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cryptoWalletService.adminGetWithdrawals(status, limit ? parseInt(limit, 10) : 50);
  }

  @Put('crypto/withdrawals/:id')
  async updateCryptoWithdrawal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status?: string; txHash?: string; adminNote?: string },
  ) {
    const result = await this.cryptoWalletService.adminUpdateWithdrawal(id, body);
    await this.adminAuditService.log({ adminId: req.adminUser.id, action: 'crypto_withdrawal_update', recordId: id, diff: body });
    return result;
  }

  @Get('crypto/unresolved-deposits')
  getUnresolvedDeposits(
    @Query('includeResolved') includeResolved?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cryptoWalletService.adminGetUnresolvedDeposits(
      includeResolved === 'true',
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Put('crypto/unresolved-deposits/:id/resolve')
  async resolveUnresolvedDeposit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { creditUserId?: string },
  ) {
    const result = await this.cryptoWalletService.adminResolveUnresolvedDeposit(id, req.adminUser.id, body.creditUserId);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'crypto_unresolved_deposit_resolve',
      recordId: id,
      diff: body,
    });
    return result;
  }

  @Get('players/:id/ledger/deposits')
  async getPlayerDepositLedger(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = limit ? parseInt(limit, 10) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;
    const entries = await this.prisma.currencyLedger.findMany({
      where: { userId: id, sourceType: 'CRYPTO_DEPOSIT' },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
    return entries.map((e: any) => ({
      id: e.id.toString(),
      currencyId: e.currencyId,
      delta: e.delta.toString(),
      reason: e.reason,
      sourceType: e.sourceType,
      txHash: e.sourceId ?? null,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  // ─── Content Draft & Review ──────────────────────────────────────────────────

  @Post('drafts')
  async createDraftExplicit(
    @Req() req: any,
    @Body() body: { tableName: string; recordId: string; operation: 'create' | 'update' | 'delete'; payload: any },
  ) {
    // Non-super-admin: enforce content-scope on the target table
    if (req.adminUser.role !== 'super_admin') {
      const group = TABLE_KEY_TO_GROUP[body.tableName] ?? null;
      if (group && !(req.adminUser.scopes ?? []).includes(group)) {
        throw new ForbiddenException(
          `Content scope '${group}' is required to create drafts for table '${body.tableName}'`,
        );
      }
    }
    const draft = await this.adminDraftService.createDraft({
      tableName: body.tableName,
      recordId:  body.recordId,
      operation: body.operation,
      payload:   body.payload ?? {},
      authorId:  req.adminUser.id,
    });
    return {
      mode:           'draft' as const,
      draftId:        (draft as any).id,
      tableName:      body.tableName,
      recordId:       body.recordId,
      operation:      body.operation,
      status:         'pending',
      authorUsername: (draft as any).author?.username,
    };
  }

  @Get('drafts')
  listDrafts(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('tableName') tableName?: string,
    @Query('recordId') recordId?: string,
    @Query('authorId') authorId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const isSuperAdmin = req.adminUser.role === 'super_admin';
    const canReview    = req.adminUser.perms?.approve === true;

    // Creators without review permission may only see their own drafts
    const enforcedAuthorId = (!isSuperAdmin && !canReview) ? req.adminUser.id : authorId;

    return this.adminDraftService.listDrafts({
      status,
      tableName,
      recordId,
      authorId:   enforcedAuthorId,
      limit:  limit  ? parseInt(limit,  10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('drafts/:id')
  async getDraft(@Req() req: any, @Param('id') id: string) {
    const draft = await this.adminDraftService.getDraft(id);
    const isSuperAdmin = req.adminUser.role === 'super_admin';
    const canReview    = req.adminUser.perms?.approve === true;

    if (!isSuperAdmin) {
      if ((draft as any).authorId === req.adminUser.id) return draft; // own draft — always allowed

      if (!canReview) {
        throw new ForbiddenException('You can only view your own drafts');
      }

      // Reviewer: must have the scope for this draft's table
      const group = TABLE_KEY_TO_GROUP[(draft as any).tableName] ?? null;
      if (group && !(req.adminUser.scopes ?? []).includes(group)) {
        throw new ForbiddenException(
          `Draft table '${(draft as any).tableName}' is not in your allowed content scopes`,
        );
      }
    }

    return draft;
  }

  @Post('drafts/:id/approve')
  async approveDraft(@Req() req: any, @Param('id') id: string) {
    // Audit log is written atomically inside approveDraft (DB transaction for DB tables,
    // best-effort for the gemPacks/Stripe path).
    return this.adminDraftService.approveDraft(
      id,
      req.adminUser.id,
      req.adminUser.role,
      req.adminUser.scopes ?? [],
    );
  }

  @Post('drafts/:id/reject')
  async rejectDraft(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reviewComment?: string },
  ) {
    const result = await this.adminDraftService.rejectDraft(
      id,
      req.adminUser.id,
      req.adminUser.role,
      req.adminUser.scopes ?? [],
      body.reviewComment,
    );
    await this.adminAuditService.log({
      adminId:   req.adminUser.id,
      action:    'draft_reject',
      tableName: result.tableName,
      recordId:  result.recordId,
      metadata:  { draftId: id, operation: result.operation, reviewComment: body.reviewComment },
    });
    return result;
  }

  // ─── Game Metrics ────────────────────────────────────────────────────────────

  @Get('metrics/game-health')
  getGameHealthMetrics() {
    return this.gameMetricsService.getGameHealthMetrics();
  }

  @Post('metrics/record-snapshot')
  async recordMetricSnapshot() {
    await this.gameMetricsService.recordDailySnapshot();
    return { success: true };
  }

  @Get('metrics/history')
  getMetricHistory(
    @Query('metrics') metricsParam: string | string[] | undefined,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    const metricNames = Array.isArray(metricsParam)
      ? metricsParam
      : metricsParam
        ? metricsParam.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    return this.gameMetricsService.getMetricHistory(metricNames, days);
  }

  // ─── Seed Management (super_admin only) ──────────────────────────────────────

  @Get('seed/tables')
  getSeedTables(@Req() req: any) {
    if (req.adminUser.role !== 'super_admin') {
      throw new ForbiddenException('Requires super_admin role');
    }
    return { tables: [...SEED_TABLE_ORDER] };
  }

  @Post('seed/run')
  async runSeed(
    @Req() req: any,
    @Body() body: { tables?: string[] },
  ) {
    if (req.adminUser.role !== 'super_admin') {
      throw new ForbiddenException('Requires super_admin role');
    }

    if (body.tables && body.tables.length > 0) {
      const validTables = new Set<string>([...SEED_TABLE_ORDER]);
      const badTables = body.tables.filter((t) => !validTables.has(t));
      if (badTables.length > 0) {
        throw new BadRequestException(`Unknown table(s): ${badTables.join(', ')}. Call GET /admin/seed/tables for valid keys.`);
      }
    }

    const results = await this.seedSyncService.runSeed(body.tables);

    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'seed_run',
      tableName: 'system',
      diff: { tables: body.tables ?? 'all', results },
    });

    return {
      tables: body.tables && body.tables.length > 0 ? body.tables : 'all',
      results,
    };
  }

  @Post('seed/snapshot')
  async createSeedSnapshot(@Req() req: any) {
    if (req.adminUser.role !== 'super_admin') {
      throw new ForbiddenException('Requires super_admin role');
    }
    const snapshot = await this.seedSyncService.createSnapshot();
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'seed_snapshot',
      tableName: 'system',
      diff: snapshot,
    });
    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':table')
  list(@Param('table') table: string) {
    return this.adminService.listTable(table);
  }

  @Get(':table/:id')
  get(@Param('table') table: string, @Param('id') id: string) {
    return this.adminService.getRecord(table, id);
  }

  @Post(':table')
  async create(@Req() req: any, @Param('table') table: string, @Body() body: any) {
    if (table === 'defaultModalDef') {
      throw new MethodNotAllowedException('Creating records is not allowed for Default Modal Definitions');
    }

    const isSuperAdmin = req.adminUser.role === 'super_admin';

    if (!isSuperAdmin) {
      const recordId: string = body.id || `draft_${Date.now()}`;
      const payload = { ...body };
      if (!payload.id) payload.id = recordId;
      const draft = await this.adminDraftService.createDraft({
        tableName: table,
        recordId,
        operation: 'create',
        payload,
        authorId: req.adminUser.id,
      });
      return {
        mode: 'draft' as const,
        draftId: draft.id,
        tableName: table,
        recordId,
        operation: 'create',
        status: 'pending',
        authorUsername: (draft as any).author?.username,
      };
    }

    const result = await this.adminService.createRecord(table, body);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'create',
      tableName: table,
      recordId: result?.id ? String(result.id) : undefined,
      diff: body,
      metadata: { bypassReview: true },
    });
    void this.seedSyncService.syncTable(table);
    return result;
  }

  @Put(':table/:id')
  async update(@Req() req: any, @Param('table') table: string, @Param('id') id: string, @Body() body: any) {
    const isSuperAdmin = req.adminUser.role === 'super_admin';

    if (!isSuperAdmin) {
      const draft = await this.adminDraftService.createDraft({
        tableName: table,
        recordId: id,
        operation: 'update',
        payload: body,
        authorId: req.adminUser.id,
      });
      return {
        mode: 'draft' as const,
        draftId: draft.id,
        tableName: table,
        recordId: id,
        operation: 'update',
        status: 'pending',
        authorUsername: (draft as any).author?.username,
      };
    }

    const result = await this.adminService.updateRecord(table, id, body);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'update',
      tableName: table,
      recordId: id,
      diff: body,
      metadata: { bypassReview: true },
    });
    void this.seedSyncService.syncTable(table);
    return result;
  }

  @Delete(':table/:id')
  async remove(@Req() req: any, @Param('table') table: string, @Param('id') id: string) {
    if (table === 'defaultModalDef') {
      throw new MethodNotAllowedException('Deleting records is not allowed for Default Modal Definitions');
    }

    const isSuperAdmin = req.adminUser.role === 'super_admin';

    if (!isSuperAdmin) {
      const draft = await this.adminDraftService.createDraft({
        tableName: table,
        recordId: id,
        operation: 'delete',
        payload: {},
        authorId: req.adminUser.id,
      });
      return {
        mode: 'draft' as const,
        draftId: draft.id,
        tableName: table,
        recordId: id,
        operation: 'delete',
        status: 'pending',
        authorUsername: (draft as any).author?.username,
      };
    }

    const result = await this.adminService.deleteRecord(table, id);
    await this.adminAuditService.log({
      adminId: req.adminUser.id,
      action: 'delete',
      tableName: table,
      recordId: id,
      metadata: { bypassReview: true },
    });
    void this.seedSyncService.syncTable(table);
    return result;
  }

}
