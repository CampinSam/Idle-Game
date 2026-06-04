import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { InventoryService } from '../inventory/inventory.service';
import { CurrencyService } from '../currency/currency.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { EventService } from '../event/event.service';
import { rollPassFail, rollQualityFromCl, collapseQualityProbabilities, qualityProbabilities, SeededRng } from '@derp/math';
import type { StartDustingPayload, CollectDustingPayload, DustingData } from '@derp/shared';

const EMPTY_TIER_BLOCK = { rewards: [] };

function normaliseTierRewards(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.rewards)) return raw.rewards;
  }
  return [];
}

function buildDustingTiers(dustingData: DustingData): Record<string, { rewards: any[]; clRequirement?: number }> {
  const tiers = (dustingData.tiers as any) || {};
  const build = (block: any): { rewards: any[]; clRequirement?: number } => {
    if (!block) return EMPTY_TIER_BLOCK;
    return { ...block, rewards: normaliseTierRewards(block.rewards) };
  };
  return {
    failure:   build(tiers.failure)   ?? EMPTY_TIER_BLOCK,
    common:    build(tiers.common)    ?? EMPTY_TIER_BLOCK,
    uncommon:  build(tiers.uncommon)  ?? EMPTY_TIER_BLOCK,
    scare:     build(tiers.scare)     ?? EMPTY_TIER_BLOCK,
    rare:      build(tiers.rare)      ?? EMPTY_TIER_BLOCK,
    epic:      build(tiers.epic)      ?? EMPTY_TIER_BLOCK,
    mythic:    build(tiers.mythic)    ?? EMPTY_TIER_BLOCK,
    legendary: build(tiers.legendary) ?? EMPTY_TIER_BLOCK,
  };
}

function buildCenterOverrides(tiers: Record<string, { rewards: any[]; clRequirement?: number }>): Partial<Record<string, number>> {
  const overrides: Partial<Record<string, number>> = {};
  for (const [key, block] of Object.entries(tiers)) {
    if (key !== 'failure' && typeof block.clRequirement === 'number') {
      overrides[key] = block.clRequirement;
    }
  }
  return overrides;
}

@Injectable()
export class DustingService {
  private readonly logger = new Logger(DustingService.name);

  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
    private inventoryService: InventoryService,
    private currencyService: CurrencyService,
    private gameRules: GameRulesService,
    private eventService: EventService,
  ) {}

  private async removeSpecificInstanceTx(
    tx: any,
    params: {
      userId: string;
      instanceId: string;
      defId: string;
      defName: string;
      quantity: number;
      reason: string;
      sourceId: string;
    },
  ) {
    const { userId, instanceId, defId, defName, quantity, reason, sourceId } = params;

    const instance = await (tx as any).itemInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.userId !== userId) {
      throw new NotFoundException(`Item instance ${instanceId} not found`);
    }
    const currentQty = Number(instance.quantity ?? 0);
    if (currentQty < quantity) {
      throw new BadRequestException(
        `Insufficient ${defName} (have ${currentQty}, need ${quantity})`,
      );
    }
    const newQty = currentQty - quantity;
    if (newQty === 0) {
      await (tx as any).itemInstance.delete({ where: { id: instanceId } });
    } else {
      await (tx as any).itemInstance.update({
        where: { id: instanceId },
        data: { quantity: newQty },
      });
    }
    await (tx as any).itemLedger.create({
      data: {
        userId,
        itemId: defId,
        delta: BigInt(-quantity),
        reason,
        sourceType: 'dusting',
        sourceId,
        metadata: {},
      },
    });
    return newQty;
  }

  async startDusting(userId: string, payload: StartDustingPayload, externalTx?: any) {
    const { itemInstanceId, quantity } = payload;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    const itemInstance = await (this.prisma as any).itemInstance.findFirst({
      where: { id: itemInstanceId, userId },
      include: { definition: true },
    });
    if (!itemInstance) throw new NotFoundException('Item instance not found');
    if (itemInstance.userId !== userId) throw new ForbiddenException('You do not own this item');

    const def = itemInstance.definition;
    if (!def) throw new NotFoundException('Item definition not found');

    const dustingData = def.dustingData as DustingData | null;
    if (!dustingData) throw new BadRequestException('This item cannot be dusted');

    if (itemInstance.quantity < qty) {
      throw new BadRequestException(`You only have ${itemInstance.quantity} of this item`);
    }

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);

    const timerCfg = dustingData.timer as any;
    const legacyData = dustingData as any;
    const baseDuration = dustingData.instant
      ? 0
      : (timerCfg?.duration ?? legacyData.durationTicks ?? 0);
    const rawScaling: string = legacyData.timerScaling ?? legacyData.quantityScaling ?? 'flat';
    const timerScaling: string =
      rawScaling === 'LINEAR' ? 'per_unit' : rawScaling === 'ALL_AT_ONCE' ? 'flat' : rawScaling;
    const totalDurationTicks = (timerScaling === 'per_unit' && !dustingData.instant)
      ? Math.max(0, baseDuration * qty)
      : baseDuration;

    const readyAtTick = Math.floor(currentTick) + totalDurationTicks;
    const seed = randomUUID();

    const doWrites = async (tx: any) => {
      await this.removeSpecificInstanceTx(tx, {
        userId,
        instanceId: itemInstance.id,
        defId: def.id,
        defName: def.name,
        quantity: qty,
        reason: `Dusting: ${def.name}`,
        sourceId: itemInstanceId,
      });

      const job = await (tx as any).job.create({
        data: {
          userId,
          type: 'DustingJob',
          defId: def.id,
          status: dustingData.instant ? 'completed' : 'active',
          timer: { startTick: currentTick, durationTicks: totalDurationTicks },
          team: [],
          data: { seed, quantity: qty, itemInstanceId },
          readyAtTick: dustingData.instant ? Math.floor(currentTick) : readyAtTick,
        },
      });

      if (dustingData.instant) {
        const resolvedRewards = await this.resolveDusting(tx, userId, job.id, def, dustingData, qty, seed);
        const updated = await (tx as any).job.update({
          where: { id: job.id },
          data: { status: 'collected', results: resolvedRewards.results },
        });
        return { job: updated, instantRewards: resolvedRewards.grantedRewards };
      }

      return { job, instantRewards: null };
    };

    return externalTx
      ? await doWrites(externalTx)
      : await this.prisma.$transaction(doWrites, { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' });
  }

  async collectDusting(userId: string, payload: CollectDustingPayload, externalTx?: any) {
    const { jobId } = payload;

    const job = await (this.prisma as any).job.findFirst({
      where: { id: jobId, userId, type: 'DustingJob', status: { in: ['active', 'ready_notified'] } },
    });
    if (!job) throw new NotFoundException('Dusting job not found');

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const timerData = job.timer as any;
    const targetTick = (timerData?.startTick ?? 0) + (timerData?.durationTicks ?? 0);
    if (currentTick < targetTick) {
      throw new BadRequestException('Dusting is not yet complete');
    }

    const def = await (this.prisma as any).itemDefinition.findUnique({ where: { id: job.defId } });
    if (!def) throw new NotFoundException('Item definition not found');

    const dustingData = def.dustingData as DustingData | null;
    if (!dustingData) throw new BadRequestException('Dusting data missing from definition');

    const jobQuantity: number = (job.data as any)?.quantity ?? 1;
    const seed = (job.data as any)?.seed ?? jobId;

    const doWrites = async (tx: any) => {
      const resolvedRewards = await this.resolveDusting(tx, userId, jobId, def, dustingData, jobQuantity, seed);

      const updated = await (tx as any).job.update({
        where: { id: jobId },
        data: { status: 'collected', results: resolvedRewards.results },
      });

      let updatedNotification: any = null;
      try {
        const existing = await (tx as any).notification.findFirst({
          where: { userId, sourceType: 'job_ready', sourceId: jobId, archivedAt: null },
        });
        if (existing) {
          updatedNotification = await (tx as any).notification.update({
            where: { id: existing.id },
            data: {
              type: 'dust_complete',
              title: 'Dusting Complete!',
              body: `${def.name} dusting finished`,
              readAt: new Date(),
              dismissedAt: null,
              deepLink: { screen: '/inventory', jobId },
            },
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to update dusting notification: ${err}`);
      }

      return { job: updated, grantedRewards: resolvedRewards.grantedRewards, updatedNotification };
    };

    return externalTx
      ? await doWrites(externalTx)
      : await this.prisma.$transaction(doWrites, { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' });
  }

  private async resolveDusting(
    tx: any,
    userId: string,
    jobId: string,
    def: any,
    dustingData: DustingData,
    quantity: number,
    seed: string,
  ) {
    const user = await (tx as any).user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');
    const reqContext = this.gameRules.buildRequirementContext(user as any);

    const tiers = buildDustingTiers(dustingData);
    const centerOverrides = buildCenterOverrides(tiers);
    const difficulty = dustingData.difficulty ?? 0;

    const rng = new SeededRng(seed);
    const passed = rollPassFail(0, difficulty, rng);

    let quality: string;
    let qualityLabel: string;
    let qualityProbs: any[];
    let outcomeItems: any[];

    if (!passed) {
      quality = 'failure';
      qualityLabel = 'Failure';
      qualityProbs = collapseQualityProbabilities(
        qualityProbabilities(0, centerOverrides),
        (key) => Array.isArray(tiers[key]?.rewards) && tiers[key].rewards.length > 0,
      );
      outcomeItems = Array.isArray(tiers.failure?.rewards) ? tiers.failure.rewards : [];
    } else {
      const rolled = rollQualityFromCl(0, rng, centerOverrides);
      quality = rolled.key;
      qualityLabel = rolled.label;
      qualityProbs = collapseQualityProbabilities(
        rolled.probabilities,
        (key) => Array.isArray(tiers[key]?.rewards) && tiers[key].rewards.length > 0,
      );
      const tierBlock = tiers[quality] ?? EMPTY_TIER_BLOCK;
      outcomeItems = Array.isArray(tierBlock.rewards) ? tierBlock.rewards : [];
    }

    const grantedRewards: { type: string; key?: string; amount?: number; defId?: string }[] = [];

    const { resolved, flags: resolvedFlags } = await this.gameRules.resolveOutcomesAsync(outcomeItems, reqContext, rng);

    for (const { entry, amount } of resolved) {
      if (entry.type === 'emitEvent') continue;
      const scaledAmount = typeof amount === 'number' ? amount * quantity : amount;
      if (!scaledAmount || scaledAmount <= 0) continue;

      switch (entry.type) {
        case 'currency': {
          await this.currencyService.creditTx(tx as any, {
            userId,
            currencyId: entry.key,
            amount: scaledAmount,
            reason: `Dusting: ${def.name}`,
            sourceType: 'dusting',
            sourceId: jobId,
          });
          grantedRewards.push({ type: 'currency', key: entry.key, amount: scaledAmount });
          break;
        }
        case 'item': {
          await this.inventoryService.addItemTx(tx as any, {
            userId,
            itemId: entry.key,
            quantity: scaledAmount,
            reason: `Dusting: ${def.name}`,
            sourceType: 'dusting',
            sourceId: jobId,
          });
          grantedRewards.push({ type: 'item', key: entry.key, amount: scaledAmount });
          break;
        }
      }
    }

    if (resolvedFlags.length > 0) {
      await (tx as any).user.update({ where: { id: userId }, data: { flags: reqContext.userFlags as any } });
    }

    for (const { entry } of resolved) {
      if (entry.type !== 'emitEvent') continue;
      try {
        const idempotencyKey = entry.idempotencyKey
          ? entry.idempotencyKey.replace('${jobId}', jobId)
          : undefined;
        await this.eventService.dispatch(entry.defId, entry.payload || {}, {
          userId,
          sourceType: 'DustingJob',
          sourceId: jobId,
          idempotencyKey,
        });
        grantedRewards.push({ type: 'emitEvent', defId: entry.defId });
      } catch (err) {
        this.logger.warn(`emitEvent "${entry.defId}" failed during dusting ${jobId.slice(0, 8)}: ${err}`);
      }
    }

    return {
      grantedRewards,
      results: {
        quality,
        qualityLabel,
        passed,
        difficulty,
        quantity,
        qualityProbabilities: qualityProbs,
        rewards: grantedRewards,
      },
    };
  }
}
