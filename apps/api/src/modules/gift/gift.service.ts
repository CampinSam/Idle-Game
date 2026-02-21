import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';
import { generateEntityData } from '../entity/entity-generator.util';

@Injectable()
export class GiftService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
  ) {}

  private get giftInstance() {
    return (this.prisma as any).giftInstance;
  }

  private get giftDef() {
    return (this.prisma as any).giftDef;
  }

  private get giftClaimTx() {
    return (this.prisma as any).giftClaimTx;
  }

  async createGiftForPlayer(
    userId: string,
    giftDefId: string,
    sourceType?: string,
    sourceId?: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.giftInstance.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return existing;
    }

    const def = await this.giftDef.findUnique({ where: { id: giftDefId } });
    if (!def) {
      throw new NotFoundException(`GiftDef "${giftDefId}" not found`);
    }

    const claimRules = (def.claimRules as any) || {};

    if (claimRules.limitPerPlayer) {
      const count = await this.giftInstance.count({
        where: { userId, giftDefId },
      });
      if (count >= claimRules.limitPerPlayer) {
        throw new BadRequestException(
          `Player has reached the limit of ${claimRules.limitPerPlayer} for gift "${giftDefId}"`,
        );
      }
    }

    let expiresAt: Date | null = null;
    if (claimRules.expiresInSeconds) {
      expiresAt = new Date(Date.now() + claimRules.expiresInSeconds * 1000);
    }

    const presentation = (def.presentation as any) || {};

    const gift = await this.giftInstance.create({
      data: {
        userId,
        giftDefId,
        giftDefVersion: def.version,
        status: 'UNCLAIMED',
        expiresAt,
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        idempotencyKey: idempotencyKey || null,
        snapshot: {
          presentation: def.presentation,
          rewardSpec: def.rewardSpec,
        },
      },
    });

    await this.notificationService.createNotification({
      userId,
      type: 'gift',
      category: 'gift',
      priority: 'high',
      title: presentation.title || 'You received a gift!',
      body: presentation.body || 'Check your gifts to claim it.',
      meta: { type: 'gift', giftId: gift.id },
      sourceType: 'Gift',
      sourceId: gift.id,
    });

    return gift;
  }

  async claimGift(userId: string, giftId: string) {
    const gift = await this.giftInstance.findUnique({ where: { id: giftId } });
    if (!gift) {
      throw new NotFoundException('Gift not found');
    }

    if (gift.userId !== userId) {
      throw new ForbiddenException('This gift does not belong to you');
    }

    if (gift.status === 'CLAIMED') {
      const existingTx = await this.giftClaimTx.findUnique({
        where: { giftId },
      });
      return { gift, claimTx: existingTx };
    }

    if (gift.status !== 'UNCLAIMED') {
      throw new BadRequestException(
        `Gift cannot be claimed (status: ${gift.status})`,
      );
    }

    if (gift.expiresAt && gift.expiresAt < new Date()) {
      await this.giftInstance.update({
        where: { id: giftId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Gift has expired');
    }

    const seed = crypto
      .createHash('sha256')
      .update(giftId + userId + gift.createdAt.toISOString())
      .digest('hex');

    const snapshot = (gift.snapshot as any) || {};
    const rewardSpec = snapshot.rewardSpec || {};

    const grants = await this.resolveRewards(userId, rewardSpec, giftId);

    try {
      const claimTx = await this.giftClaimTx.create({
        data: {
          giftId,
          userId,
          status: 'completed',
          seed,
          grants,
        },
      });

      const updatedGift = await this.giftInstance.update({
        where: { id: giftId },
        data: {
          status: 'CLAIMED',
          claimTxId: claimTx.id,
          claim: { claimedAt: new Date() },
        },
      });

      return { gift: updatedGift, claimTx };
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existingTx = await this.giftClaimTx.findUnique({
          where: { giftId },
        });
        const currentGift = await this.giftInstance.findUnique({
          where: { id: giftId },
        });
        return { gift: currentGift, claimTx: existingTx };
      }
      throw err;
    }
  }

  private async resolveRewards(
    userId: string,
    spec: any,
    giftId: string,
  ): Promise<any[]> {
    if (!spec || !spec.type) return [];

    const grants: any[] = [];

    switch (spec.type) {
      case 'currency': {
        await this.currencyService.credit({
          userId,
          currencyId: spec.currencyId,
          amount: spec.amount,
          reason: 'Gift claim',
          sourceType: 'gift',
          sourceId: giftId,
        });
        grants.push({
          type: 'currency',
          currencyId: spec.currencyId,
          amount: spec.amount,
        });
        break;
      }

      case 'item': {
        await this.inventoryService.addItem({
          userId,
          itemId: spec.itemDefId,
          quantity: spec.qty,
          reason: 'Gift claim',
          sourceType: 'gift',
          sourceId: giftId,
        });
        grants.push({
          type: 'item',
          itemDefId: spec.itemDefId,
          qty: spec.qty,
        });
        break;
      }

      case 'entity': {
        const entityData = await generateEntityData(
          this.prisma,
          userId,
          spec.definitionId,
          'New Entity',
        );
        const entity = await (this.prisma as any).entity.create({
          data: entityData,
        });
        grants.push({
          type: 'entity',
          entityId: entity.id,
          definitionId: spec.definitionId,
        });
        break;
      }

      case 'bundle': {
        if (Array.isArray(spec.entries)) {
          for (const entry of spec.entries) {
            const subGrants = await this.resolveRewards(userId, entry, giftId);
            grants.push(...subGrants);
          }
        }
        break;
      }

      case 'cosmetic':
      case 'lootTable': {
        grants.push({ type: spec.type, status: 'not_implemented' });
        break;
      }

      default:
        break;
    }

    return grants;
  }


  async getGifts(userId: string, status?: string) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    return this.giftInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGift(userId: string, giftId: string) {
    const gift = await this.giftInstance.findUnique({ where: { id: giftId } });
    if (!gift) {
      throw new NotFoundException('Gift not found');
    }
    if (gift.userId !== userId) {
      throw new ForbiddenException('This gift does not belong to you');
    }
    return gift;
  }
}
