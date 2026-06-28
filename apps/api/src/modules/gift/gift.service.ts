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
import type { GiftSpec } from '@derp/shared';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';

@Injectable()
export class GiftService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
    private gameRules: GameRulesService,
    private definitionCache: DefinitionCacheService,
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

  private async resolveGiftSpec(spec: GiftSpec): Promise<{
    id: string | null;
    version: number;
    name: string;
    presentation: any;
    claimRules: any;
    rewardSpec: any;
    instant: boolean;
    modalDefId: string | null;
  }> {
    if ('giftDefId' in spec) {
      const def = this.definitionCache.get('giftDef', spec.giftDefId);
      if (!def) {
        throw new NotFoundException(`GiftDef "${spec.giftDefId}" not found`);
      }
      return {
        id: def.id,
        version: def.version ?? 1,
        name: def.name,
        presentation: def.presentation ?? {},
        claimRules: def.claimRules ?? {},
        rewardSpec: def.rewardSpec ?? {},
        instant: def.instant !== false,
        modalDefId: def.modalDefId ?? null,
      };
    }

    return {
      id: null,
      version: 1,
      name: spec.name,
      presentation: spec.presentation ?? {},
      claimRules: spec.claimRules ?? {},
      rewardSpec: spec.rewardSpec ?? {},
      instant: spec.instant !== false,
      modalDefId: spec.modalDefId ?? null,
    };
  }

  async createGiftForPlayer(
    userId: string,
    gift: GiftSpec,
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

    const def = await this.resolveGiftSpec(gift);

    const claimRules = def.claimRules || {};
    const giftDefId = def.id;

    if (claimRules.limitPerPlayer && giftDefId) {
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

    const presentation = def.presentation || {};

    const giftRecord = await this.giftInstance.create({
      data: {
        userId,
        giftDefId: giftDefId || null,
        giftDefVersion: def.version,
        status: 'UNCLAIMED',
        expiresAt,
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        idempotencyKey: idempotencyKey || null,
        snapshot: {
          presentation: def.presentation,
          rewardSpec: def.rewardSpec,
          instant: def.instant,
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
      meta: { type: 'gift', giftId: giftRecord.id },
      sourceType: 'Gift',
      sourceId: giftRecord.id,
    });

    return giftRecord;
  }

  async claimGift(userId: string, giftId: string, tx?: any) {
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

    const giftRecord = await giftModel.findUnique({ where: { id: giftId } });
    if (!giftRecord) {
      throw new NotFoundException('Gift not found');
    }

    if (giftRecord.userId !== userId) {
      throw new ForbiddenException('This gift does not belong to you');
    }

    if (giftRecord.status === 'CLAIMED') {
      const existingTx = await claimTxModel.findUnique({
        where: { giftId },
      });
      return { gift: giftRecord, claimTx: existingTx };
    }

    if (giftRecord.status !== 'UNCLAIMED') {
      throw new BadRequestException(
        `Gift cannot be claimed (status: ${giftRecord.status})`,
      );
    }

    if (giftRecord.expiresAt && giftRecord.expiresAt < new Date()) {
      await giftModel.update({
        where: { id: giftId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Gift has expired');
    }

    const seed = crypto
      .createHash('sha256')
      .update(giftId + userId + giftRecord.createdAt.toISOString())
      .digest('hex');

    const snapshot = (giftRecord.snapshot as any) || {};
    const rawRewardSpec = snapshot.rewardSpec || {};
    const rewardSpec = resolveRewardSpecContext(rawRewardSpec, snapshot.contextData);
    const instant: boolean = snapshot.instant !== false;
    const giftDefId = giftRecord.giftDefId;

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

    const readNotifications = await this.notificationService.markReadBySource(userId, 'Gift', giftId, tx);

    try {
      await this.telemetryService.record(userId, 'gift_claimed', giftDefId, 1, {}, db);
    } catch (_) {}

    return { gift: updatedGift, claimTx, readNotifications };
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
