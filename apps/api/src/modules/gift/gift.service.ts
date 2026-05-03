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
import { TelemetryService } from '../telemetry/telemetry.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { resolveRewardSpec } from './reward-resolver.util';
import { resolveRewardSpecContext } from './reward-spec-resolver.util';

@Injectable()
export class GiftService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
    private gameRules: GameRulesService,
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
    contextData?: Record<string, unknown>,
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
          instant: def.instant ?? true,
          ...(contextData && Object.keys(contextData).length > 0 ? { contextData } : {}),
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

  async claimGift(userId: string, giftId: string, tx?: any) {
    // When called from inside an existing transaction (e.g. via the
    // ClaimGiftHandler under /v1/commands), we participate in that tx.
    // When called via the standalone /gifts/:id/claim REST endpoint, we
    // MUST start our own transaction — otherwise the item create, claimTx
    // create, gift status update and notification become four separate
    // writes and a crash mid-flow leaves the player in an inconsistent
    // state (rewards granted but gift still UNCLAIMED, or vice versa).
    if (!tx) {
      return this.prisma.$transaction(
        (innerTx) => this._claimGiftWithTx(userId, giftId, innerTx),
        { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
      );
    }
    return this._claimGiftWithTx(userId, giftId, tx);
  }

  private async _claimGiftWithTx(userId: string, giftId: string, tx: any) {
    const db = tx;
    const giftModel = (db as any).giftInstance ?? this.giftInstance;
    const claimTxModel = (db as any).giftClaimTx ?? this.giftClaimTx;

    const gift = await giftModel.findUnique({ where: { id: giftId } });
    if (!gift) {
      throw new NotFoundException('Gift not found');
    }

    if (gift.userId !== userId) {
      throw new ForbiddenException('This gift does not belong to you');
    }

    if (gift.status === 'CLAIMED') {
      const existingTx = await claimTxModel.findUnique({
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
      await giftModel.update({
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
    const rawRewardSpec = snapshot.rewardSpec || {};
    const rewardSpec = resolveRewardSpecContext(rawRewardSpec, snapshot.contextData);
    const instant: boolean = snapshot.instant !== false;
    const giftDefId = gift.giftDefId;

    let grants: any[];
    let claimTx: any;

    if (!instant) {
      const packageItemDef = await (db as any).itemDefinition.findFirst({
        where: { type: 'GIFT_PACKAGE' },
      });

      if (!packageItemDef) {
        throw new BadRequestException('No GIFT_PACKAGE item definition found in the system');
      }

      const existing = await db.itemInstance.findFirst({
        where: { userId, definitionId: packageItemDef.id },
      });

      let itemInstance: any;
      if (existing && packageItemDef.stackable) {
        itemInstance = await db.itemInstance.update({
          where: { id: existing.id },
          data: { quantity: { increment: 1 }, state: { rewardSpec } },
        });
      } else {
        itemInstance = await db.itemInstance.create({
          data: {
            userId,
            definitionId: packageItemDef.id,
            quantity: 1,
            state: { rewardSpec },
          },
        });
      }

      grants = [{ type: 'gift_package', itemInstanceId: itemInstance.id }];

      claimTx = await claimTxModel.create({
        data: {
          giftId,
          userId,
          status: 'completed',
          seed,
          grants,
        },
      });
    } else {
      grants = await this.resolveRewards(userId, rewardSpec, giftId, db);

      try {
        claimTx = await claimTxModel.create({
          data: {
            giftId,
            userId,
            status: 'completed',
            seed,
            grants,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          const existingTx = await claimTxModel.findUnique({ where: { giftId } });
          const currentGift = await giftModel.findUnique({ where: { id: giftId } });
          return { gift: currentGift, claimTx: existingTx };
        }
        throw err;
      }
    }

    const updatedGift = await giftModel.update({
      where: { id: giftId },
      data: {
        status: 'CLAIMED',
        claimTxId: claimTx.id,
        claim: { claimedAt: new Date() },
      },
    });

    await this.notificationService.markReadBySource(userId, 'Gift', giftId, tx);

    try {
      await this.telemetryService.record(userId, 'gift_claimed', giftDefId, 1, {}, db);
    } catch (_) {}

    return { gift: updatedGift, claimTx };
  }

  private async resolveRewards(
    userId: string,
    spec: any,
    giftId: string,
    db?: any,
  ): Promise<any[]> {
    return resolveRewardSpec(
      db || this.prisma,
      this.currencyService,
      this.inventoryService,
      this.gameRules,
      userId,
      spec,
      giftId,
    );
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
