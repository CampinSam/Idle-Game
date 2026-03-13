import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { EventService } from '../event/event.service';
import { resolveLevelConfig, resolveStorageCapacity, LevelRules } from '../game-rules/level-config.util';
import { generateEntityData } from '../entity/entity-generator.util';

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
  ) {}

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
      await tx.entity.deleteMany({ where: { ownerUserId: uid } });

      const user = await tx.user.update({
        where: { id: uid },
        data: {
          keeperLevel: 1,
          keeperXp: BigInt(0),
          flags: {},
          prestigeTokens: 0,
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
    const created = await model.create({ data });
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

    const updated = await model.update({ where: { id }, data });
    return serializeBigInts(updated);
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
    return serializeBigInts(deleted);
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
      bodySchema: (this.prisma as any).bodySchema,
      progressionProfile: (this.prisma as any).progressionProfile,
      equipmentSchema: (this.prisma as any).equipmentSchema,
      traitDefinition: (this.prisma as any).traitDefinition,
      regionDefinition: (this.prisma as any).regionDefinition,
      locationDefinition: (this.prisma as any).locationDefinition,
      eventDefinition: (this.prisma as any).eventDefinition,
      giftDef: (this.prisma as any).giftDef,
      lootboxDef: (this.prisma as any).lootboxDef,
      checkInDef: (this.prisma as any).checkInDef,
      questDef: (this.prisma as any).questDef,
      shopItemDef: (this.prisma as any).shopItemDef,
      nftCollectionDef: (this.prisma as any).nftCollectionDef,
      modalDef: (this.prisma as any).modalDef,
      effectDef: (this.prisma as any).effectDef,
    };

    if (!models[table]) {
      throw new NotFoundException(`Unknown table: ${table}`);
    }

    return models[table];
  }
}
