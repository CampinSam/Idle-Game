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
import { resolveLevelConfig, resolveStorageCapacity, LevelRules } from '../game-rules/level-config.util';
import { generateEntityData } from '../entity/entity-generator.util';
import { STAT_KEYS, computeScaling, computeCompositRarity, type ScalingContribution } from '@derp/math';
import { GameRulesService, GameUser, TeamEntitySnap } from '../game-rules/game-rules.service';
import type { SelectionContext } from '../selection/selection.types';
import type { TraceNode } from '../selection/selection-resolver.service';
import type { RichSelection } from '@derp/shared';
import { normalizeOutcomeFieldsForModel } from '../game-rules/outcome-spec.util';
import { SeededRng } from '@derp/math';
import { HomeBannerService } from '../home-banner/home-banner.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { CommandService } from '../commands/command.service';
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
    await this.emitAdminDelta(id, pb.build());

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
    await this.emitAdminDelta(id, pb.build());

    return serializeBigInts(updated);
  }

  async setPlayerCurrency(userId: string, currencyId: string, balance: string | number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Player ${userId} not found`);

    const result = await this.prisma.userCurrencyBalance.upsert({
      where: {
        userId_currencyId: { userId, currencyId },
      },
      create: {
        userId,
        currencyId,
        balance: BigInt(balance),
      },
      update: {
        balance: BigInt(balance),
      },
    });

    const pb = new PatchBuilder();
    await buildCurrencyPatches(pb, this.prisma, userId);
    await this.emitAdminDelta(userId, pb.build());

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
      const currentTick = await this.tickService.getCurrentTick();
      const locData = this.generateStarterLocation(uid, currentTick);
      const loc = await (this.prisma as any).locationInstance.create({
        data: locData,
        include: { definition: true },
      });
      const def = loc.definition;
      if (def) {
        const rules = (def.rules as LevelRules) || {};
        const config = resolveLevelConfig(rules, loc.level);
        const capacity = resolveStorageCapacity(config.storage, loc.level);
        await (this.prisma as any).locationInstance.update({
          where: { id: loc.id },
          data: { storage: { capacity, stored: {}, lastSettledAt: new Date().toISOString() } },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to create starter location for ${uid}: ${err}`);
    }

    try {
      await this.eventService.dispatch('evt_welcome_gift', { giftDefId: 'gift_welcome_gems' }, {
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

  private generateStarterLocation(userId: string, currentTick: number) {
    return {
      ownerUserId: userId,
      definitionId: 'derp_outpost',
      kind: 'outpost_fungible',
      level: 1,
      lastCollectionTick: BigInt(Math.floor(currentTick)),
      storage: { capacity: {}, stored: {}, lastSettledAt: new Date().toISOString() },
      state: {},
    };
  }

  async listTable(table: string) {
    const model = this.getModel(table);
    const records = await model.findMany({ orderBy: { createdAt: 'desc' } });
    return serializeBigInts(records);
  }

  async getRecord(table: string, id: string) {
    const model = this.getModel(table);
    const record = await model.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Record ${id} not found in ${table}`);
    return serializeBigInts(record);
  }

  async createRecord(table: string, data: any) {
    const model = this.getModel(table);
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
    const existing = await model.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Record ${id} not found in ${table}`);

    this.convertBigIntFields(table, data);

    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const migrated = normalizeOutcomeFieldsForModel(table, data);
    if (migrated > 0) {
      this.logger.log(`Normalized ${migrated} legacy amount→min/max entries on update ${table}/${id}`);
    }

    const updated = await model.update({ where: { id }, data });
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
    const existing = await model.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Record ${id} not found in ${table}`);
    const deleted = await model.delete({ where: { id } });
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

    const itemDef = await this.prisma.itemDefinition.findUnique({ where: { id: itemId } });
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
            data: { userId, definitionId: itemId, quantity: 1 },
          });
          instanceIds.push(inst.id);
        }
        await tx.itemLedger.create({
          data: {
            userId,
            itemId,
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
    await this.emitAdminDelta(userId, pb.build(), [{
      type: 'toast',
      tone: 'success',
      message: `Admin granted ${quantity}x ${itemDef.name}`,
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

  async updatePlayerEntity(userId: string, entityId: string, data: { stats?: any; level?: number; name?: string }) {
    const entity = await (this.prisma as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId } });
    if (!entity) throw new NotFoundException(`Entity ${entityId} not found for player`);

    const updateData: any = {};
    if (data.stats !== undefined) updateData.stats = data.stats;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.name !== undefined) {
      const display = (entity.display as any) || {};
      updateData.display = { ...display, name: data.name };
    }

    const updated = await (this.prisma as any).entity.update({ where: { id: entityId }, data: updateData });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, this.prisma, entityId);
    await this.emitAdminDelta(userId, pb.build());

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
          const traits = (entity.traits as Record<string, string>) || {};
          const entityDef = entityDefById[entity.definitionId];
          const slots: Record<string, string[]> = (entityDef?.slots as any) || {};

          const scalingContributions: ScalingContribution[] = [];
          for (const [slotName] of Object.entries(slots)) {
            const chosenArchetype = traits[slotName];
            if (!chosenArchetype) continue;
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
      nftCollectionDef: (this.prisma as any).nftCollectionDef,
      modalDef: (this.prisma as any).modalDef,
      effectDef: (this.prisma as any).effectDef,
      tagDef: (this.prisma as any).tagDef,
      visualEffectDef: (this.prisma as any).visualEffectDef,
      season: (this.prisma as any).season,
      homeBannerDef: (this.prisma as any).homeBannerDef,
      systemIconDef: (this.prisma as any).systemIconDef,
      selectionRuleDef: (this.prisma as any).selectionRuleDef,
      synergyRule: (this.prisma as any).synergyRule,
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
      team.push({
        id: entity.id,
        entityType: (entity.role as string | undefined) ?? undefined,
        traits: ((entity.traits ?? {}) as Record<string, string>),
        stats: ((entity.stats ?? {}) as Record<string, number>),
        speciesId: (entity.definitionId as string | undefined) ?? undefined,
        collectionId: (entity.nftCollectionDefId as string | undefined) ?? undefined,
        rarity: ((entity.traits as any)?.rarity as string | undefined) ?? undefined,
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

    // 6. Evaluate using the same resolver called by checkRequirements.
    //    Also run the trace variant (full non-short-circuit) for the breakdown.
    const passed = this.selectionResolver.evaluate(body.rule, selCtx);
    const trace = this.selectionResolver.evaluateWithTrace(body.rule, selCtx);

    return { passed, resolvedContext: selCtx, trace };
  }
}
