import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import { TickService } from '../tick/tick.service';
import { EventService } from '../event/event.service';
import { MissionService } from '../mission/mission.service';
import { InventoryService } from '../inventory/inventory.service';
import { LocationService } from '../location/location.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { CraftingService } from '../crafting/crafting.service';
import { generateEntityData, levelUpEntityToLevel } from '../entity/entity-generator.util';
import { NftCollectionService } from '../nft/nft-collection.service';
import { PowerGrantService } from '../global-power/power-grant.service';
import { STAT_KEYS, computeScaling, computeCompositRarity, levelFromXp, type ScalingContribution } from '@derp/math';
import { GameRulesService, GameUser, TeamEntitySnap } from '../game-rules/game-rules.service';
import type { SelectionContext } from '../selection/selection.types';
import type { TraceNode } from '../selection/selection-resolver.service';
import type { RichSelection, TraitPrimitive } from '@derp/shared';
import { validateEntityTraitsShape } from '@derp/shared';
import { normalizeOutcomeFieldsForModel } from '../game-rules/outcome-spec.util';
import { buildEntityDataFromNftMetadata } from '../nft/nft-entity-builder';
import { getProgressionRules, xpForNextLevel } from '../entity/entity-progression-rules.util';
import { computeEquippedStats } from '../entity/entity-stats.util';
import { SeededRng } from '@derp/math';
import { HomeBannerService } from '../home-banner/home-banner.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { CommandService } from '../commands/command.service';
import { TickEventProcessorService } from '../tick/tick-event-processor.service';
import { NotificationService } from '../notification/notification.service';
import {
  resolveDefRecord,
  resolveScreenSectionProps,
  KNOWN_DEF_PROP_FIELDS,
  resolveOutcomeArrayUuids,
  resolveTieredObjectUuids,
  resolvePhasesArrayUuids,
  resolveCheckInRewardsUuids,
  auditOutcomeArray,
  auditTieredObject,
  auditPhasesArray,
  auditCheckInRewards,
  type AuditFinding,
} from '../../utils/resolve-def-id.util';
import {
  PatchBuilder,
  buildCurrencyPatches,
  buildItemPatches,
  buildEntityPatch,
  buildLocationPatches,
} from '../commands/patch-builder';

function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeBigInts(obj[key]);
    }
    return result;
  }
  return obj;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
    private eventService: EventService,
    private missionService: MissionService,
    private inventoryService: InventoryService,
    private locationService: LocationService,
    private settlementService: LocationSettlementService,
    private craftingService: CraftingService,
    private gameRules: GameRulesService,
    private homeBannerService: HomeBannerService,
    private pubsub: PubSubService,
    private selectionResolver: SelectionResolverService,
    private commandService: CommandService,
    private tickProcessor: TickEventProcessorService,
    private nftCollectionService: NftCollectionService,
    private notificationService: NotificationService,
    private powerGrantService: PowerGrantService,
  ) {}

  /**
   * Creates a PlayerDelta row and notifies the player's SSE stream so any
   * in-flight admin mutation is immediately visible to the player without
   * a manual page refresh.
   *
   * Delta creation is not best-effort: if the DB write fails the error is
   * re-thrown so the admin knows something went wrong and the client does not
   * silently drift. The PubSub publish is best-effort — a missed notification
   * only delays the update until the next SSE heartbeat, which is recoverable.
   */
  private async emitAdminDelta(
    userId: string,
    patches: any[],
    ui: any[] = [],
  ): Promise<void> {
    const delta = await (this.prisma as any).playerDelta.create({
      data: { userId, patches, ui },
    });
    try {
      this.pubsub.publish(`player:${userId}`, {
        userId,
        deltaId: delta.id.toString(),
      });
    } catch (err) {
      this.logger.warn(`emitAdminDelta pubsub publish failed for user ${userId}: ${(err as any)?.message ?? err}`);
    }
  }

  /**
   * Creates a persistent notification record, appends it as an upsert patch
   * alongside the provided state patches, then emits the combined delta over
   * SSE. The notification appears in the player's feed immediately with no
   * page refresh required.
   *
   * Notification errors are logged and swallowed — a failed notification
   * must never block the underlying admin mutation from being visible.
   */
  private async emitAdminDeltaWithNotif(
    userId: string,
    patches: any[],
    notif: { title: string; body: string; meta?: any },
    ui: any[] = [],
  ): Promise<void> {
    let allPatches = patches;
    try {
      const notification = await this.notificationService.createNotification({
        userId,
        type: 'admin_grant',
        category: 'system',
        priority: 'normal',
        title: notif.title,
        body: notif.body,
        meta: notif.meta ?? { count: 1 },
      });
      const pb = new PatchBuilder();
      pb.upsertNotification(notification);
      allPatches = [...patches, ...pb.build()];
    } catch (err) {
      this.logger.warn(`Admin notification creation failed for user ${userId}: ${(err as any)?.message ?? err}`);
    }
    await this.emitAdminDelta(userId, allPatches, ui);
  }

  async listPlayers(params: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = params.q?.trim()
      ? {
          OR: [
            { username: { contains: params.q.trim(), mode: 'insensitive' } },
            { email: { contains: params.q.trim(), mode: 'insensitive' } },
            { id: { contains: params.q.trim(), mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          linkedWallets: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      keeperLevel: (u as any).keeperLevel,
      primaryWallet: u.linkedWallets[0]
        ? { chain: u.linkedWallets[0].chain, address: u.linkedWallets[0].address }
        : null,
    }));

    return { items: serializeBigInts(items), total, page, limit };
  }

  async searchPlayers(query: string) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return serializeBigInts(users);
  }

  async getPlayerProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        currencyBalances: true,
        entities: true,
        locationInstances: true,
      },
    });
    if (!user) throw new NotFoundException(`Player ${id} not found`);
    return serializeBigInts(user);
  }

  async updatePlayer(id: string, data: { keeperLevel?: number; keeperXp?: number | string; flags?: any; prestigeTokens?: number }) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Player ${id} not found`);

    const updateData: any = {};
    if (data.keeperLevel !== undefined) updateData.keeperLevel = data.keeperLevel;
    if (data.keeperXp !== undefined) updateData.keeperXp = BigInt(data.keeperXp);
    if (data.flags !== undefined) updateData.flags = data.flags;
    if (data.prestigeTokens !== undefined) updateData.prestigeTokens = data.prestigeTokens;

    const updated = await this.prisma.user.update({ where: { id }, data: updateData });

    const pb = new PatchBuilder();
    pb.upsertPlayer(updated);

    const meaningfulChange = data.keeperLevel !== undefined || data.keeperXp !== undefined || data.prestigeTokens !== undefined;
    if (meaningfulChange) {
      const parts: string[] = [];
      if (data.keeperLevel !== undefined) parts.push(`Keeper Level set to ${data.keeperLevel}`);
      if (data.keeperXp !== undefined) parts.push(`Keeper XP set to ${data.keeperXp}`);
      if (data.prestigeTokens !== undefined) parts.push(`Prestige Tokens set to ${data.prestigeTokens}`);
      await this.emitAdminDeltaWithNotif(id, pb.build(), {
        title: 'Admin Update',
        body: parts.join(', '),
      });
    } else {
      await this.emitAdminDelta(id, pb.build());
    }

    return serializeBigInts(updated);
  }

  async setBonusOutpostSlots(id: string, slots: number) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Player ${id} not found`);
    if (typeof slots !== 'number' || !Number.isInteger(slots) || slots < 0 || slots > 3) {
      throw new BadRequestException('slots must be an integer between 0 and 3');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { bonusOutpostSlots: slots },
    });

    const pb = new PatchBuilder();
    pb.upsertPlayer(updated);
    await this.emitAdminDeltaWithNotif(id, pb.build(), {
      title: 'Admin Grant',
      body: `You now have ${slots} bonus outpost slot${slots !== 1 ? 's' : ''}`,
    });

    return serializeBigInts(updated);
  }

  async setPlayerCurrency(userId: string, currencyId: string, balance: string | number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);

    const currencyRow = await (this.prisma as any).currency.findFirst({
      where: { OR: [{ id: currencyId }, { key: currencyId }] },
      select: { id: true, name: true },
    });
    if (!currencyRow) throw new NotFoundException(`Currency "${currencyId}" not found`);
    const currencyUuid: string = currencyRow.id;

    const result = await this.prisma.userCurrencyBalance.upsert({
      where: { userId_currencyId: { userId, currencyId: currencyUuid } },
      create: { userId, currencyId: currencyUuid, balance: BigInt(balance) },
      update: { balance: BigInt(balance) },
    });
    const currencyDef = { name: currencyRow.name };

    const pb = new PatchBuilder();
    await buildCurrencyPatches(pb, this.prisma, userId);
    const currencyLabel = currencyDef?.name ?? currencyId;
    await this.emitAdminDeltaWithNotif(userId, pb.build(), {
      title: 'Admin Grant',
      body: `Your ${currencyLabel} was set to ${balance.toLocaleString?.() ?? balance}`,
    });

    return serializeBigInts(result);
  }

  async resetPlayer(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Player ${id} not found`);

    const uid = id;

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = tx as any;

      await p.giftClaimTx.deleteMany({ where: { userId: uid } });
      await p.giftInstance.deleteMany({ where: { userId: uid } });
      await p.itemLedger.deleteMany({ where: { userId: uid } });
      await p.itemInstance.deleteMany({ where: { userId: uid } });
      await tx.currencyLedger.deleteMany({ where: { userId: uid } });
      await tx.userCurrencyBalance.deleteMany({ where: { userId: uid } });
      await tx.notification.deleteMany({ where: { userId: uid } });
      await tx.job.deleteMany({ where: { userId: uid } });

      const locations = await tx.locationInstance.findMany({
        where: { ownerUserId: uid },
        select: { id: true },
      });
      for (const loc of locations) {
        const buildings = await p.locationBuildingInstance.findMany({
          where: { locationId: loc.id },
          select: { id: true },
        });
        const buildingIds = buildings.map((b: any) => b.id);
        if (buildingIds.length > 0) {
          await p.locationRoomInstance.deleteMany({ where: { buildingInstanceId: { in: buildingIds } } });
        }
        await p.locationBuildingInstance.deleteMany({ where: { locationId: loc.id } });
        await p.locationWorkerAssignment.deleteMany({ where: { locationId: loc.id } });
      }
      await tx.locationInstance.deleteMany({ where: { ownerUserId: uid } });

      // Split entities: NFT-backed entities are universe-scoped and must NEVER
      // be deleted on reset (the on-chain wallet still owns them, and the rows
      // are shared with other game systems). Only unclaim them so a future
      // wallet sync can re-attach them. Non-NFT entities (starter mints, etc.)
      // are user-only and safe to delete (their equipment is cascade-deleted
      // by the FK on EntityEquipment.entityId).
      const nftEntityIds = await p.entity.findMany({
        where: { ownerUserId: uid, nftCollectionDefId: { not: null } },
        select: { id: true },
      });
      if (nftEntityIds.length > 0) {
        // Equipment refers to ItemInstance rows that were just wiped (line ~115)
        // and ItemInstance has no FK constraint, so we must clear equipment
        // rows ourselves to avoid orphaned references on the preserved NFTs.
        await p.entityEquipment.deleteMany({
          where: { entityId: { in: nftEntityIds.map((e: { id: string }) => e.id) } },
        });
      }
      await p.entity.updateMany({
        where: { ownerUserId: uid, nftCollectionDefId: { not: null } },
        data: { ownerUserId: null },
      });
      await p.entity.deleteMany({
        where: { ownerUserId: uid, nftCollectionDefId: null },
      });

      const linkedWallets = await p.linkedWallet.findMany({
        where: { userId: uid },
        select: { chain: true, address: true },
      });
      await p.linkedWallet.deleteMany({ where: { userId: uid } });
      if (linkedWallets.length > 0) {
        await p.walletNonce.deleteMany({
          where: {
            OR: linkedWallets.map((w: { chain: string; address: string }) => ({
              chain: w.chain,
              address: w.address,
            })),
          },
        });
      }

      const user = await tx.user.update({
        where: { id: uid },
        data: {
          keeperLevel: 1,
          keeperXp: BigInt(0),
          flags: {},
          prestigeTokens: 0,
          walletAddress: null,
        },
      });

      return user;
    }, { timeout: 15000 });

    try {
      const entityData = await generateEntityData(this.prisma, uid, 'derp_bird', 'Starter Entity');
      await (this.prisma as any).entity.create({ data: entityData });
    } catch (err) {
      this.logger.error(`Failed to create starter entity for ${uid}: ${err}`);
    }

    try {
      await this.locationService.createStarterOutpost(uid);
    } catch (err) {
      this.logger.error(`Failed to create starter location for ${uid}: ${err}`);
    }

    try {
      await this.eventService.dispatch('evt_welcome_gift', { gift: { giftDefId: 'gift_welcome_gems' } }, {
        userId: uid,
        sourceType: 'admin_reset',
        sourceId: uid,
        idempotencyKey: `reset-gift-${uid}-${Date.now()}`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send welcome gift for ${uid}: ${err}`);
    }

    await this.emitAdminDelta(uid, [], [{ type: 'full_reset' }]);

    return serializeBigInts(updated);
  }

  async listTable(table: string) {
    const model = this.getModel(table);
    const records = await model.findMany({ orderBy: { createdAt: 'desc' } });
    return serializeBigInts(records);
  }

  async getRecord(table: string, id: string) {
    const model = this.getModel(table);
    const record = await resolveDefRecord(model, id);
    if (!record) throw new NotFoundException(`Record ${id} not found in ${table}`);
    return serializeBigInts(record);
  }

  async createRecord(table: string, data: any) {
    const model = this.getModel(table);
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    this.convertBigIntFields(table, data);
    const migrated = normalizeOutcomeFieldsForModel(table, data);
    if (migrated > 0) {
      this.logger.log(`Normalized ${migrated} legacy amount→min/max entries on create ${table}`);
    }
    const created = await model.create({ data });
    await this.broadcastIfHomeBanner(table);
    await this.invalidateIfSelectionRule(table);
    return serializeBigInts(created);
  }

  async updateRecord(table: string, id: string, data: any) {
    const model = this.getModel(table);
    const existing = await resolveDefRecord(model, id);
    if (!existing) throw new NotFoundException(`Record ${id} not found in ${table}`);

    const resolvedId: string = existing.id;

    this.convertBigIntFields(table, data);

    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const migrated = normalizeOutcomeFieldsForModel(table, data);
    if (migrated > 0) {
      this.logger.log(`Normalized ${migrated} legacy amount→min/max entries on update ${table}/${resolvedId}`);
    }

    const updated = await model.update({ where: { id: resolvedId }, data });
    await this.broadcastIfHomeBanner(table);
    await this.invalidateIfSelectionRule(table);
    return serializeBigInts(updated);
  }

  /**
   * After any write to `homeBannerDef`, recompute the active set and push
   * it to every connected client over the global broadcast channel. The
   * banner list is small and global, so a whole-list replacement is the
   * simplest delta shape and avoids per-user delta plumbing.
   *
   * Best-effort only — logs and swallows errors so an admin save never
   * fails because of a downstream broadcast hiccup.
   */
  private async broadcastIfHomeBanner(table: string): Promise<void> {
    if (table !== 'homeBannerDef') return;
    try {
      const banners = await this.homeBannerService.listActive('admin-broadcast');
      this.pubsub.publishBroadcast({ type: 'home_banners.updated', banners });
    } catch (err) {
      this.logger.warn(`home_banners.updated broadcast failed: ${(err as any)?.message ?? err}`);
    }
  }

  async updateBoost(id: string, data: { name?: string; description?: string }) {
    const boostEvent = (this.prisma as any).boostEvent;
    const existing = await boostEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Boost ${id} not found`);
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    return boostEvent.update({ where: { id }, data: updateData });
  }

  async deleteRecord(table: string, id: string) {
    const model = this.getModel(table);
    const existing = await resolveDefRecord(model, id);
    if (!existing) throw new NotFoundException(`Record ${id} not found in ${table}`);
    const resolvedId: string = existing.id;
    const deleted = await model.delete({ where: { id: resolvedId } });
    await this.broadcastIfHomeBanner(table);
    await this.invalidateIfSelectionRule(table);
    return serializeBigInts(deleted);
  }

  private async invalidateIfSelectionRule(table: string): Promise<void> {
    if (table !== 'selectionRuleDef') return;
    try {
      await this.selectionResolver.reloadRuleCache();
    } catch (err) {
      this.logger.warn(`SelectionRuleDef cache reload failed: ${(err as any)?.message ?? err}`);
    }
  }

  async getPlayerJobs(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return serializeBigInts(jobs);
  }

  async forceCompleteJob(userId: string, jobId: string) {
    const job = await (this.prisma as any).job.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found for player`);

    if (job.status === 'completed' || job.status === 'failed') {
      throw new BadRequestException(`Job is already ${job.status}`);
    }

    const currentTick = await this.tickService.getCurrentTick();

    if (job.type === 'MissionJob') {
      const durationTicks = Number(job.durationTicks ?? 0);
      const adjustedStart = BigInt(Math.floor(currentTick)) - BigInt(durationTicks) - 1n;
      await (this.prisma as any).job.update({
        where: { id: jobId },
        data: { startTick: adjustedStart, status: 'active' },
      });
      const result = await this.commandService.execute(userId, {
        type: 'CompleteMission',
        payload: { jobId },
        idempotencyKey: `admin-force-complete-${jobId}`,
      });
      return serializeBigInts({ ...result, forced: true, jobId });
    }

    if (job.type === 'BuildingJob') {
      const jobData = job.data as any;
      if (!jobData?.locationId || !jobData?.buildingId) {
        throw new BadRequestException(`BuildingJob ${jobId} is missing required data fields (locationId, buildingId)`);
      }
      const jobTimer = (job.timer as any) || {};
      const durationTicks = Number(jobTimer.durationTicks ?? 0);
      const adjustedStartTick = Math.floor(currentTick) - durationTicks - 1;
      await (this.prisma as any).job.update({
        where: { id: jobId },
        data: { status: 'active', timer: { ...jobTimer, startTick: adjustedStartTick } },
      });
      const result = await this.commandService.execute(userId, {
        type: 'CompleteBuilding',
        payload: { locationId: jobData.locationId, buildingId: jobData.buildingId },
        idempotencyKey: `admin-force-complete-${jobId}`,
      });
      return serializeBigInts({ ...result, forced: true, jobId });
    }

    if (job.type === 'CraftingJob') {
      const jobTimer = (job.timer as any) || {};
      const durationTicks = Number(jobTimer.durationTicks ?? 0);
      const adjustedStartTick = Math.floor(currentTick) - durationTicks - 1;
      await (this.prisma as any).job.update({
        where: { id: jobId },
        data: { status: 'active', timer: { ...jobTimer, startTick: adjustedStartTick } },
      });
      const result = await this.commandService.execute(userId, {
        type: 'CollectCrafting',
        payload: { jobId },
        idempotencyKey: `admin-force-complete-${jobId}`,
      });
      return serializeBigInts({ ...result, forced: true, jobId });
    }

    const updated = await (this.prisma as any).job.update({
      where: { id: jobId },
      data: { status: 'completed' },
    });
    return serializeBigInts(updated);
  }

  async grantItems(userId: string, itemId: string, quantity: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);
    if (!itemId) throw new BadRequestException('itemId is required');
    if (!quantity || quantity < 1) throw new BadRequestException('quantity must be >= 1');

    const itemDef = await (this.prisma as any).itemDefinition.findFirst({ where: { OR: [{ id: itemId }, { key: itemId }] } });
    if (!itemDef) throw new NotFoundException(`Item "${itemId}" not found`);

    let result: any;

    if (itemDef.stackable) {
      const newQty = await this.inventoryService.addItem({
        userId,
        itemId,
        quantity,
        reason: 'Admin grant',
        sourceType: 'admin',
        sourceId: 'admin',
      });
      result = { userId, itemId, quantity, granted: quantity, newQty };
    } else {
      const instanceIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < quantity; i++) {
          const inst = await tx.itemInstance.create({
            data: { userId, definitionId: itemDef.id, quantity: 1 },
          });
          instanceIds.push(inst.id);
        }
        await tx.itemLedger.create({
          data: {
            userId,
            itemId: itemDef.id,
            delta: BigInt(quantity),
            reason: 'Admin grant',
            sourceType: 'admin',
            sourceId: 'admin',
            metadata: {},
          },
        });
      });
      result = { userId, itemId, quantity, granted: quantity, instanceIds };
    }

    const pb = new PatchBuilder();
    await buildItemPatches(pb, this.prisma, userId);
    await this.emitAdminDeltaWithNotif(userId, pb.build(), {
      title: 'Admin Grant',
      body: `Received ${quantity}× ${itemDef.name}`,
    }, [{
      type: 'local_toast',
      tone: 'success',
      title: 'Admin Grant',
      body: `Admin granted ${quantity}x ${itemDef.name}`,
    }]);

    return result;
  }

  async getPlayerItems(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);
    return this.inventoryService.getBalances(userId);
  }

  async listItemDefs() {
    return this.inventoryService.listItemDefs();
  }

  async updatePlayerEntity(userId: string, entityId: string, data: { stats?: any; level?: number; name?: string; traits?: unknown }) {
    const entity = await (this.prisma as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found for player`);

    const updateData: any = {};
    if (data.stats !== undefined) updateData.stats = data.stats;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.name !== undefined) {
      const display = (entity.display as any) || {};
      updateData.display = { ...display, name: data.name };
    }
    if (data.traits !== undefined) {
      const traitError = validateEntityTraitsShape(data.traits);
      if (traitError !== null) {
        throw new BadRequestException(`Invalid traits — ${traitError}`);
      }
      updateData.traits = data.traits;
    }

    const updated = await (this.prisma as any).entity.update({ where: { id: entityId }, data: updateData });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, this.prisma, entityId);

    const entityName = (updated.display as any)?.name ?? 'Entity';
    const changedFields: string[] = [];
    if (data.stats !== undefined) changedFields.push('stats');
    if (data.level !== undefined) changedFields.push(`level → ${data.level}`);
    if (data.name !== undefined) changedFields.push(`name → ${data.name}`);
    if (data.traits !== undefined) changedFields.push('traits');
    await this.emitAdminDeltaWithNotif(userId, pb.build(), {
      title: 'Admin Update',
      body: `${entityName}'s ${changedFields.join(', ')} ${changedFields.length === 1 ? 'was' : 'were'} modified`,
    });

    return serializeBigInts(updated);
  }

  async forceSettleLocation(userId: string, locationId: string) {
    const loc = await (this.prisma as any).locationInstance.findFirst({ where: { id: locationId, ownerUserId: userId } });
    if (!loc) throw new NotFoundException(`Location ${locationId} not found for player`);
    await this.settlementService.recalculateLocationMeta(locationId);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, this.prisma, userId, locationId);
    await this.emitAdminDelta(userId, pb.build());

    return { settled: true, locationId };
  }

  async getPlayerEffects(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);
    const effects = await (this.prisma as any).activeEffect.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return serializeBigInts(effects);
  }

  async deletePlayerEffect(userId: string, effectId: string) {
    const effect = await (this.prisma as any).activeEffect.findFirst({ where: { id: effectId, userId } });
    if (!effect) throw new NotFoundException(`Effect ${effectId} not found for player`);
    await (this.prisma as any).activeEffect.delete({ where: { id: effectId } });

    const pb = new PatchBuilder();
    pb.deleteActiveEffect(effectId);
    await this.emitAdminDelta(userId, pb.build());

    return { deleted: true, effectId };
  }

  async reconcileEntityStatus(userId: string, entityId: string) {
    const entity = await (this.prisma as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found for player ${userId}`);

    const currentState = (entity.state as any) || {};
    const previousStatus: string = currentState.status || 'idle';

    const activeJobs = await (this.prisma as any).job.findMany({
      where: { userId, status: { in: ['active', 'ready_notified', 'pending'] } },
    });

    const JOB_TYPE_TO_STATUS: Record<string, string> = {
      MissionJob: 'mission',
      CraftingJob: 'crafting',
      BuildingJob: 'working',
    };

    let correctStatus = 'idle';
    let matchedJobId: string | null = null;
    let matchedJobType: string | null = null;

    for (const job of activeJobs) {
      const team: string[] = Array.isArray(job.team) ? job.team : [];
      if (team.includes(entityId)) {
        correctStatus = JOB_TYPE_TO_STATUS[job.type] ?? 'idle';
        matchedJobId = job.id;
        matchedJobType = job.type;
        break;
      }
    }

    if (previousStatus === correctStatus) {
      return { changed: false, newStatus: correctStatus, previousStatus, jobId: matchedJobId, jobType: matchedJobType };
    }

    const newState = { ...currentState, status: correctStatus };
    await (this.prisma as any).entity.update({ where: { id: entityId }, data: { state: newState } });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, this.prisma, entityId);
    await this.emitAdminDelta(userId, pb.build());

    this.logger.log(`Admin reconciled entity ${entityId} status: ${previousStatus} → ${correctStatus} (job: ${matchedJobId ?? 'none'})`);

    return { changed: true, newStatus: correctStatus, previousStatus, jobId: matchedJobId, jobType: matchedJobType };
  }

  async getEntityPowerUsage(userId: string, entityId: string) {
    const entity = await (this.prisma as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found for player ${userId}`);
    const usages = await (this.prisma as any).entityPowerUsage.findMany({
      where: { entityId },
      orderBy: { powerKey: 'asc' },
    });
    return serializeBigInts(usages);
  }

  async resetEntityPowerUsage(userId: string, entityId: string, powerKey: string) {
    const entity = await (this.prisma as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found for player ${userId}`);
    const usage = await (this.prisma as any).entityPowerUsage.findUnique({
      where: { entityId_powerKey: { entityId, powerKey } },
    });
    if (!usage) throw new NotFoundException(`No power usage record found for entity ${entityId} and power key "${powerKey}"`);
    await (this.prisma as any).entityPowerUsage.delete({
      where: { entityId_powerKey: { entityId, powerKey } },
    });

    const remainingUsages = await (this.prisma as any).entityPowerUsage.findMany({ where: { entityId } });
    const usageMap: Record<string, { usageCount: number; lastUsedUtcDay: string }> = {};
    for (const u of remainingUsages) {
      usageMap[u.powerKey] = { usageCount: u.usageCount, lastUsedUtcDay: u.lastUsedUtcDay };
    }
    const pb = new PatchBuilder();
    pb.upsert('entityPowerUsage', entityId, usageMap);
    await this.emitAdminDelta(userId, pb.build());

    return { deleted: true, entityId, powerKey };
  }

  async getPlayerTelemetry(userId: string, limit = 30) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);
    const events = await (this.prisma as any).playerEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return serializeBigInts(events);
  }

  async listPlayerEvents(opts: { userId?: string; eventType?: string; limit?: number }) {
    const { userId, eventType, limit = 50 } = opts;
    const where: any = {};
    if (userId) where.userId = userId;
    if (eventType) where.eventType = eventType;
    const events = await (this.prisma as any).playerEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { user: { select: { username: true } } },
    });
    return serializeBigInts(
      events.map((e: any) => ({ ...e, username: e.user?.username ?? null, user: undefined })),
    );
  }

  private safeBigInt(value: any): bigint | null {
    if (value === null || value === undefined || value === '') return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }

  private convertBigIntFields(table: string, data: any) {
    if (table === 'currency' && data.cap !== undefined) {
      data.cap = this.safeBigInt(data.cap);
    }
    if (table === 'cryptoRateConfig' && data.fallbackLovelacePerUsd !== undefined) {
      data.fallbackLovelacePerUsd = this.safeBigInt(data.fallbackLovelacePerUsd);
    }
  }

  async backfillItemRarity(): Promise<{
    advanced: number;
    ultraRare: number;
    scarceRenamed: boolean;
    message: string;
  }> {
    // 1. Rename SCARCE → SCARE in the enum type (idempotent: only runs if SCARCE still exists)
    const [scarceCheck] = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'ItemRarity'
          AND n.nspname = 'public'
          AND e.enumlabel = 'SCARCE'
      ) AS exists
    `);
    const scarceRenamed = scarceCheck.exists;
    if (scarceRenamed) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TYPE "ItemRarity" RENAME VALUE 'SCARCE' TO 'SCARE'`,
      );
    }

    // 2. Merge ADVANCED → RARE (idempotent: no-op once value no longer exists)
    const advanced = await this.prisma.$executeRawUnsafe(
      `UPDATE item_defs SET rarity = 'RARE'::"ItemRarity" WHERE rarity::text = 'ADVANCED'`,
    );

    // 3. Merge ULTRA_RARE → EPIC (idempotent: no-op once value no longer exists)
    const ultraRare = await this.prisma.$executeRawUnsafe(
      `UPDATE item_defs SET rarity = 'EPIC'::"ItemRarity" WHERE rarity::text = 'ULTRA_RARE'`,
    );

    this.logger.log(
      `backfillItemRarity: scarceRenamed=${scarceRenamed}, ADVANCED→RARE=${advanced}, ULTRA_RARE→EPIC=${ultraRare}`,
    );
    return {
      advanced,
      ultraRare,
      scarceRenamed,
      message:
        'Migration complete. After this backfill, publish the app so the Replit publish flow ' +
        'applies the remaining schema changes (removes old enum values, adds UNIQUE).',
    };
  }

  async backfillEntityStats(): Promise<{ total: number; updated: number; skipped: number; failed: number }> {
    const entities = await (this.prisma as any).entity.findMany({
      select: { id: true, definitionId: true, traits: true, stats: true },
    });

    const allEntityDefsForTraits = await (this.prisma as any).entityDefinition.findMany({
      select: { id: true, traits: true },
    });
    // Flatten the per-definition trait map into a global archetype lookup.
    // Archetype names that appear on multiple definitions resolve to the
    // first occurrence — fine for the back-fill, which only needs the
    // scaling/rarityMultiplier metadata that is identical across defs.
    const traitByArchetype: Record<string, any> = {};
    for (const def of allEntityDefsForTraits) {
      const traits = (def.traits as any) || {};
      for (const [archetype, td] of Object.entries(traits)) {
        if (!traitByArchetype[archetype]) traitByArchetype[archetype] = td;
      }
    }

    const allEntityDefs = await (this.prisma as any).entityDefinition.findMany();
    const entityDefById: Record<string, any> = {};
    for (const def of allEntityDefs) {
      entityDefById[def.id] = def;
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const entity of entities) {
      try {
        const currentStats = (entity.stats as Record<string, any>) || {};

        // Determine what needs patching
        const statsBelowFloor = STAT_KEYS.filter((k) => (currentStats[k] ?? 0) < 10);
        const scalingMissing = !currentStats.scaling || typeof currentStats.scaling !== 'object';
        const compositRarityMissing = typeof currentStats.compositRarity !== 'number';

        const needsUpdate = statsBelowFloor.length > 0 || scalingMissing || compositRarityMissing;
        if (!needsUpdate) {
          skipped++;
          continue;
        }

        // Build patch: clamp stats at 10, preserve everything else
        const patch: Record<string, any> = { ...currentStats };

        for (const k of statsBelowFloor) {
          patch[k] = 10;
        }

        // Compute scaling/compositRarity from traits only when missing
        if (scalingMissing || compositRarityMissing) {
          const traits = (entity.traits as Record<string, TraitPrimitive>) || {};
          const entityDef = entityDefById[entity.definitionId];
          const slots: Record<string, string[]> = (entityDef?.slots as any) || {};

          const scalingContributions: ScalingContribution[] = [];
          for (const [slotName] of Object.entries(slots)) {
            const chosenArchetype = traits[slotName];
            if (!chosenArchetype || typeof chosenArchetype !== 'string') continue;
            const traitDef = traitByArchetype[chosenArchetype];
            if (!traitDef) continue;
            const traitScaling = (traitDef.scaling as Record<string, number> | undefined) || {};
            const statScaling: Record<string, number> = {};
            for (const k of STAT_KEYS) {
              statScaling[k] = typeof traitScaling[k] === 'number' ? traitScaling[k] : 1.0;
            }
            scalingContributions.push({
              statScaling,
              rarityMultiplier: typeof traitDef.rarityMultiplier === 'number' ? traitDef.rarityMultiplier : 1.0,
            });
          }

          if (scalingMissing) patch.scaling = computeScaling(scalingContributions);
          if (compositRarityMissing) patch.compositRarity = computeCompositRarity(scalingContributions);
        }

        await (this.prisma as any).entity.update({
          where: { id: entity.id },
          data: { stats: patch },
        });
        updated++;
      } catch (err) {
        this.logger.warn(`backfillEntityStats failed for entity ${entity.id}: ${err}`);
        failed++;
      }
    }

    return { total: entities.length, updated, skipped, failed };
  }

  async getBalanceBundle() {
    const entityDefs = await (this.prisma as any).entityDefinition.findMany();

    const entityDefinitions = entityDefs.map((def: any) => ({
      id: def.id,
      name: def.name || (def.data as any)?.name || def.id,
      speciesId: def.speciesId,
      slots: (def.slots as any) || {},
    }));

    // Flatten the per-definition trait map into a global archetype lookup so
    // the simulator can resolve traits independent of which species rolled
    // them. Archetype names that appear on multiple defs collapse to the
    // first occurrence — they are required to share scaling/slotStats.
    const traitDefinitions: Record<string, any> = {};
    for (const def of entityDefs) {
      const traits = (def.traits as any) || {};
      for (const [archetype, td] of Object.entries(traits)) {
        if (traitDefinitions[archetype]) continue;
        const t = td as any;
        traitDefinitions[archetype] = {
          archetype,
          slotStats: t.slotStats || {},
          scaling: t.scaling || {},
          rarityMultiplier: typeof t.rarityMultiplier === 'number' ? t.rarityMultiplier : 1.0,
        };
      }
    }

    return { entityDefinitions, traitDefinitions };
  }

  async testOutcome(input: { spec: any; userId?: string; seed?: string; iterations?: number }) {
    if (input.spec === undefined || input.spec === null) {
      throw new BadRequestException('spec is required');
    }
    const iterations = input.iterations ?? 1;
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1000) {
      throw new BadRequestException('iterations must be an integer between 1 and 1000');
    }

    let items: any[];
    if (Array.isArray(input.spec)) {
      items = input.spec;
    } else if (input.spec && typeof input.spec === 'object' && Array.isArray((input.spec as any).rewards)) {
      items = (input.spec as any).rewards;
    } else {
      throw new BadRequestException('spec must be an array or { rewards: [] } object');
    }

    let baseUser: GameUser;
    let pickedUser: { id: string; username: string | null; keeperLevel: number; flagCount: number } | null = null;
    if (input.userId) {
      const u = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (!u) throw new NotFoundException(`Player ${input.userId} not found`);
      baseUser = u as any;
      const flagsObj = (u.flags && typeof u.flags === 'object') ? u.flags as Record<string, unknown> : {};
      pickedUser = {
        id: u.id,
        username: (u as any).username ?? null,
        keeperLevel: (u as any).keeperLevel ?? 1,
        flagCount: Object.keys(flagsObj).length,
      };
    } else {
      baseUser = { keeperLevel: 0, flags: {} };
    }

    // Pre-load + expand bundle refs ONCE outside the loop, then reuse the
    // expanded tree across all N iterations. This is intentionally the manual
    // form of `resolveOutcomesAsync` — calling that wrapper per iteration
    // would re-issue `loadBundleDefs` (a Prisma query) for every roll, which
    // becomes very expensive at iterations=1000. The two paths are otherwise
    // semantically identical: same canonical chain, same resolver, same
    // determinism guarantees.
    const defs = await this.gameRules.loadBundleDefs(items);
    const expanded = this.gameRules.expandBundleRefs(items, defs);

    const seed = typeof input.seed === 'string' && input.seed.trim() !== '' ? input.seed.trim() : null;

    const runs: { resolved: { entry: any; amount?: number }[]; flags: { entry: any }[]; texts: string[] }[] = [];
    for (let i = 0; i < iterations; i++) {
      // Clone the user's flags per iteration so flag mutations during one
      // resolve() pass don't leak into the next iteration.
      const baseFlags = (baseUser.flags && typeof baseUser.flags === 'object')
        ? baseUser.flags as Record<string, unknown>
        : {};
      const userClone: GameUser = { ...baseUser, flags: { ...baseFlags } };
      const reqContext = this.gameRules.buildRequirementContext(userClone);

      const rng = seed
        ? (() => {
            const r = new SeededRng(`${seed}:${i}`);
            return {
              chance: (p: number) => r.chance(p),
              nextInt: (lo: number, hi: number) => r.nextInt(lo, hi),
            };
          })()
        : {
            chance: (p: number) => Math.random() < p,
            nextInt: (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo,
          };

      runs.push(this.gameRules.resolveOutcomes(expanded, reqContext, rng));
    }

    type EntryAgg = {
      type: string;
      key?: string | null;
      count: number;
      totalAmount: number;
      minAmount: number;
      maxAmount: number;
    };
    type FlagAgg = {
      operation: string;
      key: string;
      count: number;
      sampleValues: unknown[];
    };

    const entryKeyOf = (entry: any): string => {
      const t = entry?.type ?? 'unknown';
      if (t === 'currency' || t === 'item') return `${t}:${entry?.key ?? '?'}`;
      if (t === 'emitEvent') return `event:${entry?.eventDefId ?? entry?.id ?? '?'}`;
      return t;
    };

    const entryAgg = new Map<string, EntryAgg>();
    const flagAgg = new Map<string, FlagAgg>();
    const textAgg = new Map<string, number>();

    for (const run of runs) {
      for (const r of run.resolved) {
        const k = entryKeyOf(r.entry);
        const amt = r.amount ?? 0;
        const cur: EntryAgg = entryAgg.get(k) ?? {
          type: r.entry?.type ?? 'unknown',
          key: r.entry?.key ?? null,
          count: 0,
          totalAmount: 0,
          minAmount: Number.POSITIVE_INFINITY,
          maxAmount: Number.NEGATIVE_INFINITY,
        };
        cur.count += 1;
        cur.totalAmount += amt;
        cur.minAmount = Math.min(cur.minAmount, amt);
        cur.maxAmount = Math.max(cur.maxAmount, amt);
        entryAgg.set(k, cur);
      }
      for (const f of run.flags) {
        const e = f.entry ?? {};
        const k = `${e.operation ?? 'set'}:${e.key ?? '?'}`;
        const cur: FlagAgg = flagAgg.get(k) ?? {
          operation: e.operation ?? 'set',
          key: e.key ?? '',
          count: 0,
          sampleValues: [] as unknown[],
        };
        cur.count += 1;
        if (cur.sampleValues.length < 5) cur.sampleValues.push(e.value);
        flagAgg.set(k, cur);
      }
      for (const t of run.texts) {
        textAgg.set(t, (textAgg.get(t) ?? 0) + 1);
      }
    }

    const aggregate = {
      entries: Array.from(entryAgg.values()).map((a) => ({
        type: a.type,
        key: a.key,
        count: a.count,
        totalAmount: a.totalAmount,
        minAmount: a.minAmount === Number.POSITIVE_INFINITY ? 0 : a.minAmount,
        maxAmount: a.maxAmount === Number.NEGATIVE_INFINITY ? 0 : a.maxAmount,
      })),
      flags: Array.from(flagAgg.values()),
      texts: Array.from(textAgg.entries()).map(([message, count]) => ({ message, count })),
    };

    return serializeBigInts({ iterations, pickedUser, runs, aggregate });
  }

  async getRecentJobs(limit: number) {
    const jobs = await (this.prisma as any).job.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, type: true, defId: true, status: true, data: true, results: true, updatedAt: true },
    });

    const defIds: Record<string, Set<string>> = {};
    for (const job of jobs) {
      if (!job.defId) continue;
      const model = this.jobTypeToModel(job.type);
      if (!model) continue;
      if (!defIds[model]) defIds[model] = new Set();
      defIds[model].add(job.defId);
    }

    const defMap: Record<string, any> = {};
    for (const [model, ids] of Object.entries(defIds)) {
      const prismaModel = (this.prisma as any)[model];
      if (!prismaModel) continue;
      const defs = await prismaModel.findMany({ where: { id: { in: [...ids] } } });
      for (const def of defs) {
        defMap[`${model}:${def.id}`] = def;
      }
    }

    const enriched = jobs.map((job: any) => {
      const model = this.jobTypeToModel(job.type);
      const def = model ? defMap[`${model}:${job.defId}`] ?? null : null;
      return { ...job, def };
    });

    return serializeBigInts(enriched);
  }

  async resyncPlayerNfts(playerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: playerId } });
    if (!user) throw new NotFoundException(`Player ${playerId} not found`);
    return this.nftCollectionService.syncUserCollections(playerId);
  }

  async resyncAllEntityGrants(): Promise<{ updated: number; failed: number }> {
    return this.powerGrantService.resyncAllEntityGrants();
  }

  async resyncAllLocationGrants(): Promise<{ updated: number; failed: number }> {
    return this.powerGrantService.resyncAllLocationGrants();
  }

  async getPlayerCount(): Promise<{ total: number; active: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, active] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { updatedAt: { gte: since } } }),
    ]);
    return { total, active };
  }

  async getSystemHealth(): Promise<{
    api: string;
    currentTick: number;
    tickRate: number;
    tickDrift: number;
    jobCounts: Record<string, number>;
  }> {
    const currentTick = await this.tickService.getCurrentTick();
    const currentRate = await this.tickService.getCurrentRate();

    const bootInfo = this.tickProcessor.getBootInfo();
    const lastProcessedTick = this.tickProcessor.getLastProcessedTick();
    let tickDrift = 0;
    if (bootInfo !== null && lastProcessedTick !== null) {
      const elapsedSeconds = (Date.now() - bootInfo.bootTime) / 1000;
      const expectedTick = bootInfo.bootTick + elapsedSeconds * currentRate;
      tickDrift = Math.abs(expectedTick - lastProcessedTick);
    }

    const statusGroups = await (this.prisma as any).job.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const jobCounts: Record<string, number> = {};
    for (const g of statusGroups) {
      jobCounts[g.status] = g._count.status;
    }

    return {
      api: 'online',
      currentTick,
      tickRate: currentRate,
      tickDrift,
      jobCounts,
    };
  }

  private jobTypeToModel(type: string): string | null {
    switch (type) {
      case 'MissionJob': return 'missionDef';
      case 'CraftingJob': return 'recipeDef';
      case 'BuildingJob': return 'buildingDef';
      default: return null;
    }
  }

  private getModel(table: string): any {
    const models: Record<string, any> = {
      missionDef: (this.prisma as any).missionDef,
      recipeDef: (this.prisma as any).recipeDef,
      buildingDef: (this.prisma as any).buildingDef,
      roomDef: (this.prisma as any).roomDef,
      currency: (this.prisma as any).currency,
      itemDef: (this.prisma as any).itemDefinition,
      displayDef: (this.prisma as any).displayDef,
      missionCategoryDef: (this.prisma as any).missionCategoryDef,
      entityDefinition: (this.prisma as any).entityDefinition,
      regionDefinition: (this.prisma as any).regionDefinition,
      locationDefinition: (this.prisma as any).locationDefinition,
      eventDefinition: (this.prisma as any).eventDefinition,
      giftDef: (this.prisma as any).giftDef,
      lootboxDef: (this.prisma as any).lootboxDef,
      bundleDef: (this.prisma as any).bundleDef,
      checkInDef: (this.prisma as any).checkInDef,
      questDef: (this.prisma as any).questDef,
      shopItemDef: (this.prisma as any).shopItemDef,
      shopTabDef: (this.prisma as any).shopTabDef,
      shopSectionDef: (this.prisma as any).shopSectionDef,
      shopHeroDef: (this.prisma as any).shopHeroDef,
      nftCollectionDef: (this.prisma as any).nftCollectionDef,
      modalDef: (this.prisma as any).modalDef,
      defaultModalDef: (this.prisma as any).defaultModalDef,
      effectDef: (this.prisma as any).effectDef,
      tagDef: (this.prisma as any).tagDef,
      visualEffectDef: (this.prisma as any).visualEffectDef,
      season: (this.prisma as any).season,
      homeBannerDef: (this.prisma as any).homeBannerDef,
      systemIconDef: (this.prisma as any).systemIconDef,
      selectionRuleDef: (this.prisma as any).selectionRuleDef,
      synergyRule: (this.prisma as any).synergyRule,
      telemetryDef: (this.prisma as any).telemetryDef,
      gameDefinition: (this.prisma as any).gameDefinition,
      cryptoRateConfig: (this.prisma as any).cryptoRateConfig,
      powerDef: (this.prisma as any).powerDef,
      gameConstant: (this.prisma as any).gameConstant,
    };

    if (!models[table]) {
      throw new NotFoundException(`Unknown table: ${table}`);
    }

    return models[table];
  }

  async evaluateSelection(body: {
    rule: RichSelection;
    userId: string;
    entityIds?: string[];
    activityContext?: {
      activityType?: string;
      missionType?: string;
      missionTags?: string[];
      regionId?: string;
      seasonId?: string;
    };
    eventContext?: {
      type?: string;
      key?: string;
      amount?: number;
      data?: Record<string, unknown>;
    };
  }): Promise<{ passed: boolean; resolvedContext: SelectionContext; trace: TraceNode }> {
    // 1. Load user — same as mission.service.ts
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('Player not found');

    // 2. Load & map entities — same pattern as mission.service.ts:250-268
    const team: TeamEntitySnap[] = [];
    for (const entityId of body.entityIds ?? []) {
      const entity = await (this.prisma as any).entity.findFirst({
        where: { id: entityId, ownerUserId: body.userId },
        include: { equipment: true },
      });
      if (!entity) throw new NotFoundException(`Entity ${entityId} not found`);
      const entityStats = await computeEquippedStats(this.prisma, entity);
      team.push({
        id: entity.id,
        entityType: (entity.role as string | undefined) ?? undefined,
        traits: (entity.traits ?? {}) as Record<string, TraitPrimitive>,
        stats: entityStats,
        speciesId: (entity.definitionId as string | undefined) ?? undefined,
        collectionId: (entity.nftCollectionDefId as string | undefined) ?? undefined,
        rarity: typeof (entity.traits as any)?.rarity === 'string' ? (entity.traits as any).rarity : undefined,
      });
    }

    // 3. Build RequirementContext — same as mission.service.ts:270
    const reqCtx = this.gameRules.buildRequirementContext(user as any, {
      teamSize: team.length > 0 ? team.length : undefined,
      team: team.length > 0 ? team : undefined,
    });

    // 4. Convert to SelectionContext via the now-public reqCtxToSelCtx
    const selCtx = this.gameRules.reqCtxToSelCtx(reqCtx);

    // 5. Overlay admin-supplied activity context fields.
    //    In the game these are filled from the mission/recipe definition at
    //    synergy-evaluation time; the tester supplies them explicitly.
    if (body.activityContext) {
      if (selCtx.missionContext) {
        selCtx.missionContext = {
          ...selCtx.missionContext,
          activityType: body.activityContext.activityType ?? selCtx.missionContext.activityType,
          missionType: body.activityContext.missionType,
          missionTags: body.activityContext.missionTags ?? [],
          regionId: body.activityContext.regionId,
          seasonId: body.activityContext.seasonId,
        };
      } else {
        // teamSize was 0/undefined so missionContext was not set — create it for testing
        selCtx.missionContext = {
          activityType: body.activityContext.activityType ?? '',
          missionType: body.activityContext.missionType,
          missionTags: body.activityContext.missionTags ?? [],
          regionId: body.activityContext.regionId,
          seasonId: body.activityContext.seasonId,
          teamSize: team.length,
        };
      }
    }

    // 6. Overlay admin-supplied event context.
    //    In the game the event is injected by the quest tracker when a telemetry event fires;
    //    the tester supplies it explicitly so authors can validate event-scoped rules.
    if (body.eventContext?.type) {
      selCtx.event = {
        type: body.eventContext.type,
        key: body.eventContext.key,
        amount: body.eventContext.amount ?? 1,
        data: body.eventContext.data ?? {},
      };
    }

    // 7. Evaluate using the same resolver called by checkRequirements.
    //    Also run the trace variant (full non-short-circuit) for the breakdown.
    const passed = this.selectionResolver.evaluate(body.rule, selCtx);
    const trace = this.selectionResolver.evaluateWithTrace(body.rule, selCtx);

    return { passed, resolvedContext: selCtx, trace };
  }

  // ─── Gem Pack Display Admin ───────────────────────────────────────────────

  // Matches PaymentService.DEMO_ACCOUNT_ID — identifies the bootstrap-seeded
  // sentinel account so live (real Stripe) rows are always preferred over demo rows.
  private static readonly GEM_PACK_DEMO_ACCOUNT_ID = 'acct_derp_demo';

  async listAdminGemPacks(): Promise<any[]> {
    // Mirror the exact deduplication/preference logic from PaymentService.listGemPacks():
    // DISTINCT ON packId, prefer live rows (non-demo) over demo rows, then by price asc.
    // This guarantees admins always see and edit the same row the storefront reads.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT product_id, product_name, product_description, product_metadata,
             price_id, unit_amount, currency
      FROM (
        SELECT DISTINCT ON (p.metadata->>'packId')
          p.id               AS product_id,
          p.name             AS product_name,
          p.description      AS product_description,
          p.metadata         AS product_metadata,
          pr.id              AS price_id,
          pr.unit_amount,
          pr.currency
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
          AND p.metadata->>'game' = 'derp-universe'
        ORDER BY
          p.metadata->>'packId',
          CASE WHEN p._account_id = $1 THEN 1 ELSE 0 END ASC,
          pr.unit_amount ASC
      ) deduped
      ORDER BY unit_amount ASC
    `, AdminService.GEM_PACK_DEMO_ACCOUNT_ID);

    return rows.map((row, idx) => {
      const meta = row.product_metadata ?? {};
      return {
        id: meta.packId ?? row.product_id,
        productId: row.product_id,
        name: row.product_name,
        description: row.product_description ?? '',
        gemAmount: Number(meta.gemAmount ?? 0),
        priceId: row.price_id,
        unitAmount: Number(row.unit_amount),
        currency: row.currency ?? 'usd',
        displayOrder: idx,
        displayName: meta.displayName ?? row.product_name,
        accentColor: meta.accentColor ?? '#c4b5fd',
        borderColor: meta.borderColor ?? 'rgba(139,92,246,0.35)',
        glowColor: meta.glowColor ?? 'transparent',
        badgeType: meta.badgeType || null,
        badgeLabel: meta.badgeLabel || null,
        iconSize: meta.iconSize ? Number(meta.iconSize) : 40,
      };
    });
  }

  // ─── Entity Rebuild ───────────────────────────────────────────────────────

  private readonly rebuildJobs = new Map<string, {
    status: 'running' | 'done' | 'error';
    total: number;
    processed: number;
    updated: number;
    failed: number;
    startedAt: string;
    finishedAt?: string;
    error?: string;
  }>();

  /**
   * Fully re-derive traits, stats, and level for a single entity from its
   * stored seed (scratch) or stored NFT attributes + seed (NFT-backed).
   *
   * Preserved: id, ownerUserId, nftAssetId, nftCollectionDefId, ecosystemId,
   * definitionId, speciesId, role, display, state, equipment, seed, xp,
   * ascension, version.
   */
  async regenerateEntity(entityId: string): Promise<{ before: any; after: any }> {
    const entity = await (this.prisma as any).entity.findUnique({
      where: { id: entityId },
      include: { definition: true },
    });
    if (!entity) throw new NotFoundException(`Entity "${entityId}" not found`);

    const definition = entity.definition;
    const progression = (entity.progression as any) || {};
    const currentLevel = Math.max(1, Number(progression.level ?? 1));
    const residualXp = Math.max(0, Number(progression.xp ?? 0));

    // Use the persisted lifetimeXp field (cumulative XP ever earned) so that
    // curve changes take effect immediately on rebuild. For entities that predate
    // lifetimeXp tracking, fall back to reconstructing it from the current curve.
    let lifetimeXp: number;
    if (typeof progression.lifetimeXp === 'number' && progression.lifetimeXp >= 0) {
      lifetimeXp = progression.lifetimeXp;
    } else {
      lifetimeXp = residualXp;
      try {
        const rules = getProgressionRules(definition, entity.definitionId);
        for (let L = 1; L < currentLevel; L++) {
          lifetimeXp += xpForNextLevel(rules, L);
        }
      } catch {
        lifetimeXp = residualXp;
      }
    }
    const targetLevel = Math.max(1, levelFromXp(lifetimeXp, definition?.progression));

    const beforeTraits = entity.traits;
    const beforeStats = entity.stats;

    let level1Stats: Record<string, any>;
    let level1Traits: Record<string, any>;

    if (!entity.nftAssetId) {
      // Scratch path — fully deterministic from seed
      if (typeof entity.seed !== 'number') {
        throw new BadRequestException(
          `Entity "${entityId}" has no seed — run a seed backfill migration before rebuilding`,
        );
      }
      const generated = await generateEntityData(
        this.prisma,
        entity.ownerUserId ?? 'system',
        entity.definitionId,
        (entity.display as any)?.name ?? undefined,
        entity.seed,
        1, // force level 1; gains are replayed separately to targetLevel
      );
      level1Stats = generated.stats;
      level1Traits = generated.traits;
    } else {
      // NFT path — NFT attributes drive trait choices; seed drives RND resolution
      const collection = await (this.prisma as any).nftCollectionDef.findFirst({
        where: { OR: [{ id: entity.nftCollectionDefId }, { key: entity.nftCollectionDefId }] },
      });
      if (!collection) {
        throw new BadRequestException(
          `NftCollectionDef "${entity.nftCollectionDefId}" not found for entity "${entityId}"`,
        );
      }
      const state = (entity.state as any) || {};
      const nftAttributes = state.nftAttributes as Record<string, string> | undefined;
      if (!nftAttributes || Object.keys(nftAttributes).length === 0) {
        throw new BadRequestException(
          `Entity "${entityId}" has no stored nftAttributes — run a metadata refresh first`,
        );
      }
      const display = (entity.display as any) || {};
      const meta = {
        assetId: (entity.nftAssetId as string).split(':')[2] ?? '',
        name: display.name ?? '',
        imageUrl: display.imageUrl ?? '',
        attributes: nftAttributes,
        rawMeta: state.nftRawMeta ?? {},
        ...(state.nftAttributesRaw !== undefined ? { attributesRaw: state.nftAttributesRaw as string } : {}),
      };
      const seed = typeof entity.seed === 'number' ? entity.seed : undefined;
      const nftData = await buildEntityDataFromNftMetadata(this.prisma, collection, meta, seed);
      level1Stats = nftData.stats;
      level1Traits = nftData.traits;
    }

    // Replay level-up gains from level 1 to targetLevel
    let finalStats: Record<string, any> = { ...level1Stats };
    let finalHistory: Array<{ level: number; gains: Record<string, number> }> = [];
    if (targetLevel > 1) {
      const leveled = levelUpEntityToLevel(finalStats, targetLevel, definition?.progression?.statGain);
      finalStats = leveled.stats;
      finalHistory = leveled.levelHistory;
    }

    const updatedProgression = {
      ...progression,
      level: targetLevel,
      levelHistory: finalHistory,
      // xp (residual) and ascension are preserved as-is
    };

    const updated = await (this.prisma as any).entity.update({
      where: { id: entityId },
      data: {
        traits: level1Traits,
        stats: finalStats,
        progression: updatedProgression,
      },
    });

    return {
      before: { traits: beforeTraits, stats: beforeStats, level: currentLevel },
      after: { traits: updated.traits, stats: updated.stats, level: targetLevel },
    };
  }

  /**
   * Aggregate stats per EntityDefinition for the Collections page.
   * Uses LEFT JOIN so definitions with zero entities are still included.
   */
  async getEntityCollections(): Promise<any[]> {
    const rows: any[] = await (this.prisma as any).$queryRaw`
      SELECT
        d.id                                                                                       AS "definitionId",
        d.name                                                                                     AS "definitionName",
        d."speciesId"                                                                              AS "speciesId",
        COUNT(e.id)::int                                                                           AS "totalCount",
        COUNT(e."nftAssetId")::int                                                                 AS "nftCount",
        COUNT(CASE WHEN e."ownerUserId" IS NOT NULL AND e."nftAssetId" IS NOT NULL THEN 1 END)::int AS "claimedNftCount",
        ROUND(AVG(((e.progression::jsonb)->>'level')::numeric),   2)::float                       AS "avgLevel",
        ROUND(AVG((e.stats::jsonb->>'ATK')::numeric), 2)::float                                    AS "avgATK",
        ROUND(AVG((e.stats::jsonb->>'DEF')::numeric), 2)::float                                    AS "avgDEF",
        ROUND(AVG((e.stats::jsonb->>'SPD')::numeric), 2)::float                                    AS "avgSPD",
        ROUND(AVG((e.stats::jsonb->>'FOC')::numeric), 2)::float                                    AS "avgFOC",
        ROUND(AVG((e.stats::jsonb->>'LCK')::numeric), 2)::float                                    AS "avgLCK",
        ROUND(AVG((e.stats::jsonb->>'VIT')::numeric), 2)::float                                    AS "avgVIT"
      FROM entity_definitions d
      LEFT JOIN entities e ON e."definitionId" = d.id
      GROUP BY d.id, d.name, d."speciesId"
      ORDER BY d.name
    `;

    return rows.map((row) => ({
      definitionId: row.definitionId,
      definitionName: row.definitionName ?? row.definitionId,
      speciesId: row.speciesId ?? null,
      totalCount: Number(row.totalCount ?? 0),
      nftCount: Number(row.nftCount ?? 0),
      claimedNftCount: Number(row.claimedNftCount ?? 0),
      avgLevel: row.avgLevel != null ? Number(row.avgLevel) : null,
      avgStats: {
        ATK: row.avgATK != null ? Number(row.avgATK) : null,
        DEF: row.avgDEF != null ? Number(row.avgDEF) : null,
        SPD: row.avgSPD != null ? Number(row.avgSPD) : null,
        FOC: row.avgFOC != null ? Number(row.avgFOC) : null,
        LCK: row.avgLCK != null ? Number(row.avgLCK) : null,
        VIT: row.avgVIT != null ? Number(row.avgVIT) : null,
      },
      jobStatus: this.rebuildJobs.get(row.definitionId) ?? null,
    }));
  }

  getEntityCollectionJob(definitionId: string): any {
    const job = this.rebuildJobs.get(definitionId);
    if (!job) return { status: 'idle', total: 0, processed: 0, updated: 0, failed: 0 };
    return job;
  }

  async startEntityCollectionRebuild(
    definitionId: string,
  ): Promise<{ started: true; total: number }> {
    const existing = this.rebuildJobs.get(definitionId);
    if (existing?.status === 'running') {
      throw new BadRequestException(`Rebuild already running for definition "${definitionId}"`);
    }

    const count = await (this.prisma as any).entity.count({ where: { definitionId } });

    this.rebuildJobs.set(definitionId, {
      status: 'running',
      total: count,
      processed: 0,
      updated: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
    });

    this.runEntityCollectionRebuild(definitionId).catch((err) => {
      this.logger.error(`Entity collection rebuild failed for ${definitionId}: ${err}`);
      const current = this.rebuildJobs.get(definitionId);
      if (current) {
        this.rebuildJobs.set(definitionId, {
          ...current,
          status: 'error',
          error: String(err),
          finishedAt: new Date().toISOString(),
        });
      }
    });

    return { started: true, total: count };
  }

  private async runEntityCollectionRebuild(definitionId: string): Promise<void> {
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 200;

    let processed = 0;
    let updated = 0;
    let failed = 0;
    let cursor: string | undefined;

    while (true) {
      const entities: any[] = await (this.prisma as any).entity.findMany({
        where: { definitionId },
        select: { id: true },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (entities.length === 0) break;
      cursor = entities[entities.length - 1].id;

      for (const { id } of entities) {
        try {
          await this.regenerateEntity(id);
          updated++;
        } catch (err) {
          this.logger.warn(`Entity rebuild failed for ${id}: ${err}`);
          failed++;
        }
        processed++;
        const current = this.rebuildJobs.get(definitionId);
        if (current) {
          this.rebuildJobs.set(definitionId, { ...current, processed, updated, failed });
        }
      }

      await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    const current = this.rebuildJobs.get(definitionId);
    if (current) {
      this.rebuildJobs.set(definitionId, {
        ...current,
        status: 'done',
        processed,
        updated,
        failed,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  async backfillScreenComposerUuids(): Promise<{
    total: number;
    updated: number;
    skipped: number;
    unresolvable: { rowId: string; key: string; field: string; value: string }[];
  }> {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const rows = await (this.prisma as any).gameDefinition.findMany({
      where: { type: 'screen_composition' },
      select: { id: true, key: true, version: true, data: true },
    });

    let updated = 0;
    let skipped = 0;
    const unresolvable: { rowId: string; key: string; field: string; value: string }[] = [];

    for (const row of rows) {
      const def = row.data as Record<string, any>;
      const sections: any[] = Array.isArray(def?.sections) ? def.sections : [];
      if (sections.length === 0) { skipped++; continue; }

      const newSections = await Promise.all(
        sections.map(async (section: any) => {
          if (!section.props || typeof section.props !== 'object') return section;

          const originalProps = section.props as Record<string, unknown>;
          const resolvedProps = await resolveScreenSectionProps(this.prisma, originalProps);

          // Detect unresolvable flat def-field refs: known field, non-UUID value, unchanged after resolution
          for (const [field, originalValue] of Object.entries(originalProps)) {
            if (
              KNOWN_DEF_PROP_FIELDS.has(field) &&
              typeof originalValue === 'string' &&
              originalValue &&
              !UUID_RE.test(originalValue) &&
              resolvedProps[field] === originalValue
            ) {
              unresolvable.push({ rowId: row.id, key: row.key, field, value: originalValue });
            }
          }

          // Detect unresolvable nested resources[].defId refs
          if (Array.isArray(originalProps.resources) && Array.isArray(resolvedProps.resources)) {
            const origResources = originalProps.resources as any[];
            const resolvedResources = resolvedProps.resources as any[];
            origResources.forEach((entry, i) => {
              const defId = entry?.defId;
              if (
                typeof defId === 'string' && defId && !UUID_RE.test(defId) &&
                resolvedResources[i]?.defId === defId
              ) {
                unresolvable.push({ rowId: row.id, key: row.key, field: `resources[${i}].defId`, value: defId });
              }
            });
          }

          return { ...section, props: resolvedProps };
        }),
      );

      // Use JSON comparison so both flat and nested changes are detected
      const dirty = JSON.stringify(sections) !== JSON.stringify(newSections);
      if (!dirty) { skipped++; continue; }

      await (this.prisma as any).gameDefinition.update({
        where: { id: row.id },
        data: { data: { ...def, sections: newSections } },
      });
      updated++;
      this.logger.log(`backfillScreenComposerUuids: updated row ${row.id} (key="${row.key}" v${row.version})`);
    }

    this.logger.log(
      `backfillScreenComposerUuids complete: total=${rows.length} updated=${updated} skipped=${skipped} unresolvable=${unresolvable.length}`,
    );
    if (unresolvable.length > 0) {
      this.logger.warn(
        `Unresolvable refs:\n${unresolvable.map(u => `  ${u.rowId} (${u.key}) field=${u.field} value=${u.value}`).join('\n')}`,
      );
    }

    return { total: rows.length, updated, skipped, unresolvable };
  }

  /**
   * Backfill Phase 2: resolve key-string def references nested inside JSON blobs.
   *
   * Covered fields:
   *  - missionDef:  tiers (tiered object), cost (array), phases (phase array)
   *  - giftDef:     rewardSpec (array)
   *  - lootboxDef:  outcomes (array)
   *  - bundleDef:   bundle (array)
   *  - questDef:    rewardSpec (array)
   *  - recipeDef:   tiers (tiered object) — `rewards` field kept for compatibility
   *  - checkInDef:  rewards (day array) — resolves gift.giftDefId refs
   *
   * Within each outcome entry the following refs are migrated to UUID:
   *  - type:'item'       → key → itemDefinition.id
   *  - type:'currency'   → key → currency.id
   *  - type:'bundle_ref' → bundleDefId → bundleDef.id
   *  - type:'emitEvent'  → payload.gift.giftDefId → giftDef.id
   *
   * Safe to run repeatedly: already-UUID values pass through unchanged.
   */
  async backfillDefBlobUuids(): Promise<{
    models: Record<string, { total: number; updated: number; skipped: number }>;
    totalUpdated: number;
  }> {
    type ModelSummary = { total: number; updated: number; skipped: number };
    const models: Record<string, ModelSummary> = {};

    /** Helper: process a single record's field list and write back if dirty. */
    const processRecord = async (
      modelName: string,
      record: { id: string; [key: string]: any },
      processFields: (r: any) => Promise<{ data: Record<string, any>; changed: number }>,
    ): Promise<boolean> => {
      try {
        const { data, changed } = await processFields(record);
        if (changed === 0) return false;
        await (this.prisma as any)[modelName].update({ where: { id: record.id }, data });
        return true;
      } catch (err) {
        this.logger.warn(`backfillDefBlobUuids: failed for ${modelName} id=${record.id}: ${err}`);
        return false;
      }
    };

    // ── missionDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).missionDef.findMany({
        select: { id: true, tiers: true, cost: true, phases: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('missionDef', row, async (r) => {
          let changed = 0;
          const data: Record<string, any> = {};

          // tiers: { [tierKey]: { rewards: [] } }
          if (r.tiers && typeof r.tiers === 'object' && !Array.isArray(r.tiers)) {
            const { result: newTiers, changed: c } = await resolveTieredObjectUuids(this.prisma, r.tiers);
            if (c > 0) { data.tiers = newTiers; changed += c; }
          }

          // cost: OutcomeEntry[]
          if (Array.isArray(r.cost)) {
            const { result: newCost, changed: c } = await resolveOutcomeArrayUuids(this.prisma, r.cost);
            if (c > 0) { data.cost = newCost; changed += c; }
          }

          // phases: PhaseEntry[] — each may contain tiers and success/failure
          if (Array.isArray(r.phases)) {
            const { result: newPhases, changed: c } = await resolvePhasesArrayUuids(this.prisma, r.phases);
            if (c > 0) { data.phases = newPhases; changed += c; }
          }

          return { data, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['missionDef'] = summary;
      this.logger.log(`backfillDefBlobUuids missionDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── lootboxDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).lootboxDef.findMany({
        select: { id: true, outcomes: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('lootboxDef', row, async (r) => {
          if (!Array.isArray(r.outcomes)) return { data: {}, changed: 0 };
          const { result: newOutcomes, changed } = await resolveOutcomeArrayUuids(this.prisma, r.outcomes);
          return { data: changed > 0 ? { outcomes: newOutcomes } : {}, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['lootboxDef'] = summary;
      this.logger.log(`backfillDefBlobUuids lootboxDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── bundleDef ────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).bundleDef.findMany({
        select: { id: true, bundle: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('bundleDef', row, async (r) => {
          if (!Array.isArray(r.bundle)) return { data: {}, changed: 0 };
          const { result: newBundle, changed } = await resolveOutcomeArrayUuids(this.prisma, r.bundle);
          return { data: changed > 0 ? { bundle: newBundle } : {}, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['bundleDef'] = summary;
      this.logger.log(`backfillDefBlobUuids bundleDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── giftDef ──────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).giftDef.findMany({
        select: { id: true, rewardSpec: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('giftDef', row, async (r) => {
          if (!Array.isArray(r.rewardSpec)) return { data: {}, changed: 0 };
          const { result: newSpec, changed } = await resolveOutcomeArrayUuids(this.prisma, r.rewardSpec);
          return { data: changed > 0 ? { rewardSpec: newSpec } : {}, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['giftDef'] = summary;
      this.logger.log(`backfillDefBlobUuids giftDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── questDef ─────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).questDef.findMany({
        select: { id: true, rewardSpec: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('questDef', row, async (r) => {
          const spec = r.rewardSpec;
          if (!spec) return { data: {}, changed: 0 };
          let changed = 0;
          let newSpec = spec;

          if (Array.isArray(spec)) {
            const { result, changed: c } = await resolveOutcomeArrayUuids(this.prisma, spec);
            if (c > 0) { newSpec = result; changed += c; }
          } else if (spec && typeof spec === 'object' && Array.isArray(spec.rewards)) {
            const { result: newRewards, changed: c } = await resolveOutcomeArrayUuids(this.prisma, spec.rewards);
            if (c > 0) { newSpec = { ...spec, rewards: newRewards }; changed += c; }
          }

          return { data: changed > 0 ? { rewardSpec: newSpec } : {}, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['questDef'] = summary;
      this.logger.log(`backfillDefBlobUuids questDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── recipeDef ────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).recipeDef.findMany({
        select: { id: true, tiers: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('recipeDef', row, async (r) => {
          let changed = 0;
          const data: Record<string, any> = {};

          if (r.tiers && typeof r.tiers === 'object' && !Array.isArray(r.tiers)) {
            const { result: newTiers, changed: c } = await resolveTieredObjectUuids(this.prisma, r.tiers);
            if (c > 0) { data.tiers = newTiers; changed += c; }
          }

          return { data, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['recipeDef'] = summary;
      this.logger.log(`backfillDefBlobUuids recipeDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    // ── checkInDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).checkInDef.findMany({
        select: { id: true, rewards: true },
      });
      const summary: ModelSummary = { total: rows.length, updated: 0, skipped: 0 };

      for (const row of rows) {
        const updated = await processRecord('checkInDef', row, async (r) => {
          if (!Array.isArray(r.rewards)) return { data: {}, changed: 0 };
          const { result: newRewards, changed } = await resolveCheckInRewardsUuids(this.prisma, r.rewards);
          return { data: changed > 0 ? { rewards: newRewards } : {}, changed };
        });
        updated ? summary.updated++ : summary.skipped++;
      }

      models['checkInDef'] = summary;
      this.logger.log(`backfillDefBlobUuids checkInDef: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}`);
    }

    const totalUpdated = Object.values(models).reduce((sum, m) => sum + m.updated, 0);
    this.logger.log(`backfillDefBlobUuids complete: totalUpdated=${totalUpdated}`);
    return { models, totalUpdated };
  }

  /**
   * Read-only audit: scans the same models and fields as backfillDefBlobUuids and
   * reports any non-UUID key / bundleDefId / giftDefId references that the backfill
   * did not (or could not) resolve. Use this after running the backfill to confirm
   * it is safe to drop the OR:[id, key] fallback from outcome resolvers.
   */
  async auditDefBlobUuids(): Promise<{
    findings: AuditFinding[];
    summary: Record<string, { total: number; clean: number; hasFinding: number }>;
    totalFindings: number;
    safeToRemoveFallback: boolean;
  }> {
    const findings: AuditFinding[] = [];
    type ModelSummary = { total: number; clean: number; hasFinding: number };
    const summary: Record<string, ModelSummary> = {};

    const track = (modelName: string, recordId: string, before: number): void => {
      const s = summary[modelName] ??= { total: 0, clean: 0, hasFinding: 0 };
      s.total++;
      if (findings.length > before) s.hasFinding++;
      else s.clean++;
    };

    // ── missionDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).missionDef.findMany({
        select: { id: true, tiers: true, cost: true, phases: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'missionDef', id: row.id };

        if (row.tiers && typeof row.tiers === 'object' && !Array.isArray(row.tiers)) {
          auditTieredObject(rec, row.tiers, 'tiers', findings);
        }
        if (Array.isArray(row.cost)) {
          auditOutcomeArray(rec, row.cost, 'cost', findings);
        }
        if (Array.isArray(row.phases)) {
          auditPhasesArray(rec, row.phases, 'phases', findings);
        }
        track('missionDef', row.id, before);
      }
    }

    // ── lootboxDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).lootboxDef.findMany({
        select: { id: true, outcomes: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'lootboxDef', id: row.id };
        if (Array.isArray(row.outcomes)) {
          auditOutcomeArray(rec, row.outcomes, 'outcomes', findings);
        }
        track('lootboxDef', row.id, before);
      }
    }

    // ── bundleDef ────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).bundleDef.findMany({
        select: { id: true, bundle: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'bundleDef', id: row.id };
        if (Array.isArray(row.bundle)) {
          auditOutcomeArray(rec, row.bundle, 'bundle', findings);
        }
        track('bundleDef', row.id, before);
      }
    }

    // ── giftDef ──────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).giftDef.findMany({
        select: { id: true, rewardSpec: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'giftDef', id: row.id };
        if (Array.isArray(row.rewardSpec)) {
          auditOutcomeArray(rec, row.rewardSpec, 'rewardSpec', findings);
        }
        track('giftDef', row.id, before);
      }
    }

    // ── questDef ─────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).questDef.findMany({
        select: { id: true, rewardSpec: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'questDef', id: row.id };
        const spec = row.rewardSpec;
        if (Array.isArray(spec)) {
          auditOutcomeArray(rec, spec, 'rewardSpec', findings);
        } else if (spec && typeof spec === 'object' && Array.isArray(spec.rewards)) {
          auditOutcomeArray(rec, spec.rewards, 'rewardSpec.rewards', findings);
        }
        track('questDef', row.id, before);
      }
    }

    // ── recipeDef ────────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).recipeDef.findMany({
        select: { id: true, tiers: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'recipeDef', id: row.id };
        if (row.tiers && typeof row.tiers === 'object' && !Array.isArray(row.tiers)) {
          auditTieredObject(rec, row.tiers, 'tiers', findings);
        }
        track('recipeDef', row.id, before);
      }
    }

    // ── checkInDef ───────────────────────────────────────────────────────────
    {
      const rows = await (this.prisma as any).checkInDef.findMany({
        select: { id: true, rewards: true },
      });
      for (const row of rows) {
        const before = findings.length;
        const rec = { model: 'checkInDef', id: row.id };
        if (Array.isArray(row.rewards)) {
          auditCheckInRewards(rec, row.rewards, 'rewards', findings);
        }
        track('checkInDef', row.id, before);
      }
    }

    const totalFindings = findings.length;
    this.logger.log(`auditDefBlobUuids complete: totalFindings=${totalFindings}`);
    if (totalFindings > 0) {
      this.logger.warn(
        `auditDefBlobUuids: ${totalFindings} non-UUID ref(s) remain — run POST /admin/backfill/def-blob-uuids again or fix manually`,
      );
      for (const f of findings) {
        this.logger.warn(`  [${f.model}] id=${f.recordId} path=${f.fieldPath} value="${f.value}"`);
      }
    }

    return { findings, summary, totalFindings, safeToRemoveFallback: totalFindings === 0 };
  }

  async getAdminGemPack(packId: string): Promise<any> {
    const packs = await this.listAdminGemPacks();
    const pack = packs.find(p => p.id === packId);
    if (!pack) throw new NotFoundException(`Gem pack "${packId}" not found`);
    return pack;
  }

  async updateAdminGemPack(
    packId: string,
    data: {
      displayName?: string;
      accentColor?: string;
      borderColor?: string;
      glowColor?: string;
      badgeType?: string | null;
      badgeLabel?: string | null;
      iconSize?: number;
    },
  ): Promise<any> {
    // Use the same account-preference ordering as listAdminGemPacks() / PaymentService so
    // the update always targets the exact row the storefront will read for this packId.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id AS product_id, p.metadata AS product_metadata
      FROM stripe.products p
      WHERE p.active = true
        AND p.metadata->>'game' = 'derp-universe'
        AND p.metadata->>'packId' = $1
      ORDER BY CASE WHEN p._account_id = $2 THEN 1 ELSE 0 END ASC
      LIMIT 1
    `, packId, AdminService.GEM_PACK_DEMO_ACCOUNT_ID);

    if (!rows.length) throw new NotFoundException(`Gem pack "${packId}" not found`);
    const row = rows[0];
    const currentMeta = row.product_metadata ?? {};

    const updatedMeta = {
      ...currentMeta,
      ...(data.displayName !== undefined  && { displayName: data.displayName }),
      ...(data.accentColor !== undefined  && { accentColor: data.accentColor }),
      ...(data.borderColor !== undefined  && { borderColor: data.borderColor }),
      ...(data.glowColor !== undefined    && { glowColor: data.glowColor }),
      ...(data.badgeType !== undefined    && { badgeType: data.badgeType ?? '' }),
      ...(data.badgeLabel !== undefined   && { badgeLabel: data.badgeLabel ?? '' }),
      ...(data.iconSize !== undefined     && { iconSize: String(data.iconSize) }),
    };

    await this.prisma.$executeRawUnsafe(`
      UPDATE stripe.products
      SET _raw_data = jsonb_set(_raw_data, '{metadata}', $1::jsonb)
      WHERE id = $2
    `, JSON.stringify(updatedMeta), row.product_id);

    return this.getAdminGemPack(packId);
  }
}
