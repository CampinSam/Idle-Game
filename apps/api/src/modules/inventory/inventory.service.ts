import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface AddItemParams {
  userId: string;
  itemId: string;
  quantity: number;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export interface RemoveItemParams {
  userId: string;
  itemId: string;
  quantity: number;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private definitionCache: DefinitionCacheService,
  ) {}

  /** Resolve a slug or UUID to the canonical UUID id of an ItemDefinition.
   *  Returns null if not found. */
  private tryResolveItemDefUuid(slugOrUuid: string, _client?: any): string | null {
    return this.definitionCache.get('itemDef', slugOrUuid)?.id ?? null;
  }

  /** Resolve a slug or UUID to the canonical UUID id of an ItemDefinition.
   *  Throws NotFoundException if not found. */
  resolveItemDefUuid(slugOrUuid: string, _client?: any): string {
    const id = this.tryResolveItemDefUuid(slugOrUuid);
    if (!id) throw new NotFoundException(`Item "${slugOrUuid}" not found`);
    return id;
  }

  async listItemDefs() {
    return this.prisma.itemDefinition.findMany({ orderBy: { name: 'asc' } });
  }

  async getItemDef(itemId: string) {
    const item = this.definitionCache.get('itemDef', itemId);
    if (!item) throw new NotFoundException(`Item "${itemId}" not found`);
    return item;
  }

  async getBalance(userId: string, itemId: string): Promise<number> {
    const uuid = this.tryResolveItemDefUuid(itemId);
    if (!uuid) return 0;
    const instance = await this.prisma.itemInstance.findFirst({
      where: { userId, definitionId: uuid },
    });
    return instance?.quantity ?? 0;
  }

  async getBalances(userId: string): Promise<Array<{ itemId: string; quantity: number }>> {
    const instances = await this.prisma.itemInstance.findMany({
      where: { userId },
      include: { definition: true },
    });
    return instances.map((inst) => ({
      itemId: inst.definitionId,
      quantity: inst.quantity,
      item: inst.definition,
    }));
  }

  async addItem(params: AddItemParams): Promise<number> {
    const { userId, quantity, reason, sourceType, sourceId, metadata } = params;
    if (quantity <= 0) throw new BadRequestException('Quantity must be positive');

    const itemDef = this.definitionCache.get('itemDef', params.itemId);
    if (!itemDef) throw new NotFoundException(`Item "${params.itemId}" not found`);
    if (!itemDef.stackable) throw new BadRequestException(`Item "${params.itemId}" is not stackable — use unique instance creation instead`);
    const itemId: string = itemDef.id;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.itemInstance.findFirst({
        where: { userId, definitionId: itemId },
      });

      const currentQty = existing?.quantity ?? 0;
      const newQty = currentQty + quantity;

      if (itemDef.maxStack !== null && newQty > itemDef.maxStack) {
        throw new BadRequestException(`Cannot exceed max stack of ${itemDef.maxStack} for "${itemDef.name}"`);
      }

      if (existing) {
        await tx.itemInstance.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        });
      } else {
        await tx.itemInstance.create({
          data: { userId, definitionId: itemId, quantity },
        });
      }

      await tx.itemLedger.create({
        data: {
          userId,
          itemId,
          delta: BigInt(quantity),
          reason,
          sourceType: sourceType ?? null,
          sourceId: sourceId ?? null,
          metadata: metadata ?? {},
        },
      });

      const updated = await tx.itemInstance.findFirst({
        where: { userId, definitionId: itemId },
      });

      return updated!.quantity;
    });

    return result;
  }

  async removeItem(params: RemoveItemParams): Promise<number> {
    const { userId, quantity, reason, sourceType, sourceId, metadata } = params;
    if (quantity <= 0) throw new BadRequestException('Quantity must be positive');

    const itemDef = this.definitionCache.get('itemDef', params.itemId);
    if (!itemDef) throw new NotFoundException(`Item "${params.itemId}" not found`);
    const itemId: string = itemDef.id;

    const result = await this.prisma.$transaction(async (tx) => {
      const instance = await tx.itemInstance.findFirst({
        where: { userId, definitionId: itemId },
      });

      const currentQty = instance?.quantity ?? 0;
      if (currentQty < quantity) {
        throw new BadRequestException(`Insufficient ${itemDef.name} (have ${currentQty}, need ${quantity})`);
      }

      const newQty = currentQty - quantity;
      if (newQty === 0) {
        await tx.itemInstance.delete({ where: { id: instance!.id } });
      } else {
        await tx.itemInstance.update({
          where: { id: instance!.id },
          data: { quantity: newQty },
        });
      }

      await tx.itemLedger.create({
        data: {
          userId,
          itemId,
          delta: BigInt(-quantity),
          reason,
          sourceType: sourceType ?? null,
          sourceId: sourceId ?? null,
          metadata: metadata ?? {},
        },
      });

      return newQty;
    });

    return result;
  }

  async addItemTx(tx: TxClient, params: AddItemParams): Promise<number> {
    const { userId, quantity, reason, sourceType, sourceId, metadata } = params;
    if (quantity <= 0) throw new BadRequestException('Quantity must be positive');

    const itemDef = this.definitionCache.get('itemDef', params.itemId);
    if (!itemDef) throw new NotFoundException(`Item "${params.itemId}" not found`);
    if (!itemDef.stackable) throw new BadRequestException(`Item "${params.itemId}" is not stackable — use unique instance creation instead`);
    const itemId: string = itemDef.id;

    const existing = await tx.itemInstance.findFirst({
      where: { userId, definitionId: itemId },
    });

    const currentQty = existing?.quantity ?? 0;
    const newQty = currentQty + quantity;

    if (itemDef.maxStack !== null && newQty > itemDef.maxStack) {
      throw new BadRequestException(`Cannot exceed max stack of ${itemDef.maxStack} for "${itemDef.name}"`);
    }

    if (existing) {
      await tx.itemInstance.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await tx.itemInstance.create({
        data: { userId, definitionId: itemId, quantity },
      });
    }

    await tx.itemLedger.create({
      data: {
        userId,
        itemId,
        delta: BigInt(quantity),
        reason,
        sourceType: sourceType ?? null,
        sourceId: sourceId ?? null,
        metadata: metadata ?? {},
      },
    });

    const updated = await tx.itemInstance.findFirst({
      where: { userId, definitionId: itemId },
    });

    return updated!.quantity;
  }

  async removeItemTx(tx: TxClient, params: RemoveItemParams): Promise<number> {
    const { userId, quantity, reason, sourceType, sourceId, metadata } = params;
    if (quantity <= 0) throw new BadRequestException('Quantity must be positive');

    const itemDef = this.definitionCache.get('itemDef', params.itemId);
    if (!itemDef) throw new NotFoundException(`Item "${params.itemId}" not found`);
    const itemId: string = itemDef.id;

    const instance = await tx.itemInstance.findFirst({
      where: { userId, definitionId: itemId },
    });

    const currentQty = instance?.quantity ?? 0;
    if (currentQty < quantity) {
      throw new BadRequestException(`Insufficient ${itemDef.name} (have ${currentQty}, need ${quantity})`);
    }

    const newQty = currentQty - quantity;
    if (newQty === 0) {
      await tx.itemInstance.delete({ where: { id: instance!.id } });
    } else {
      await tx.itemInstance.update({
        where: { id: instance!.id },
        data: { quantity: newQty },
      });
    }

    await tx.itemLedger.create({
      data: {
        userId,
        itemId,
        delta: BigInt(-quantity),
        reason,
        sourceType: sourceType ?? null,
        sourceId: sourceId ?? null,
        metadata: metadata ?? {},
      },
    });

    return newQty;
  }

  async getInventory(userId: string) {
    const instances = await this.prisma.itemInstance.findMany({
      where: { userId },
      include: { definition: true },
    });

    const stackables = instances.filter((i) => i.definition.stackable && i.quantity > 0);
    const gear = instances.filter((i) => !i.definition.stackable || i.definition.uniqueInstance);

    return {
      items: stackables.map((s) => ({
        itemId: s.definitionId,
        name: s.definition.name,
        type: s.definition.type,
        iconKey: s.definition.iconKey,
        rarity: s.definition.rarity,
        category: s.definition.category,
        tags: s.definition.tags,
        description: s.definition.description,
        quantity: s.quantity,
        data: s.definition.data,
        dustingData: s.definition.dustingData ?? null,
        equipData: s.definition.equipData ?? null,
        consumableData: s.definition.consumableData ?? null,
      })),
      gear: gear.map((g) => ({
        instanceId: g.id,
        itemId: g.definitionId,
        name: g.definition.name,
        iconKey: g.definition.iconKey,
        rarity: g.definition.rarity,
        category: g.definition.category,
        tags: g.definition.tags,
        description: g.definition.description,
        level: (g.state as any)?.level ?? 1,
        isEquipped: !!g.equippedToId,
        slot: (g.state as any)?.slot ?? null,
        data: g.state ?? {},
        itemData: g.definition.data,
      })),
    };
  }

  async getLedger(userId: string, itemId?: string, limit = 50, offset = 0) {
    const where: any = { userId };
    if (itemId) {
      const uuid = await this.tryResolveItemDefUuid(itemId);
      where.itemId = uuid ?? itemId;
    }

    const entries = await this.prisma.itemLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { item: { select: { name: true, type: true } } },
    });

    return entries.map((e) => ({
      id: e.id.toString(),
      userId: e.userId,
      itemId: e.itemId,
      itemName: e.item.name,
      delta: Number(e.delta),
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
