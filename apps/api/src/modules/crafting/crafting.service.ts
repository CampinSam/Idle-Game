import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityService } from '../entity/entity.service';
import { CurrencyService } from '../currency/currency.service';
import { TickService } from '../tick/tick.service';
import { NotificationService } from '../notification/notification.service';
import { InventoryService } from '../inventory/inventory.service';
import { PlayerService } from '../player/player.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { EventService } from '../event/event.service';
import { calculateCraftingLuck, durationSecondsToTicks } from '@derp/math';

@Injectable()
export class CraftingService {
  private readonly logger = new Logger(CraftingService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private currencyService: CurrencyService,
    private tickService: TickService,
    private notificationService: NotificationService,
    private inventoryService: InventoryService,
    private playerService: PlayerService,
    private gameRules: GameRulesService,
    private eventService: EventService,
  ) {}

  private mapJobToCraftingResponse(job: any) {
    return {
      id: job.id,
      userId: job.userId,
      recipeId: job.defId,
      entityId: job.team[0],
      startTick: job.timer.startTick,
      durationTicks: job.timer.durationTicks,
      status: job.status,
      result: job.results,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getRecipes(userId?: string) {
    const allDefs = await (this.prisma as any).recipeDef.findMany();

    if (!userId) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    return allDefs
      .filter((d: any) => this.gameRules.checkVisibility(d.visibilityRequirements, user))
      .map((d: any) => this.mapDefToLegacy(d));
  }

  private mapDefToLegacy(def: any) {
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      group: def.group,
      cost: def.cost,
      timer: def.timer,
      requiredKeeperLevel: def.requiredKeeperLevel,
      rewards: def.rewards,
      requirements: def.requirements,
      visibilityRequirements: def.visibilityRequirements,
    };
  }

  async getActiveJobs(userId: string) {
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId, type: 'CraftingJob', status: { in: ['active', 'ready_notified'] } },
      orderBy: { createdAt: 'asc' },
    });

    const tickInfo = await this.tickService.getTickInfo();
    const serverTime = new Date().toISOString();

    return jobs.map((j: any) => ({
      ...this.mapJobToCraftingResponse(j),
      serverTime,
      tickInfo: {
        currentTick: tickInfo.currentTick,
        currentRate: tickInfo.currentRate,
      },
    }));
  }

  async startCrafting(userId: string, recipeId: string, entityId: string) {
    const recipe = await (this.prisma as any).recipeDef.findUnique({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');

    if (!this.gameRules.checkVisibility(recipe.visibilityRequirements, user)) {
      throw new BadRequestException('Recipe is not available');
    }

    if (user.keeperLevel < recipe.requiredKeeperLevel) {
      throw new BadRequestException(
        `Requires Keeper Level ${recipe.requiredKeeperLevel}`,
      );
    }

    const entity = await this.entityService.getEntity(userId, entityId);
    const entityStatus = (entity as any).state?.status || 'idle';
    if (entityStatus !== 'idle') {
      throw new BadRequestException(`Entity is currently ${entityStatus}`);
    }

    const costEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(recipe.cost) ? recipe.cost : [];
    for (const cost of costEntries) {
      if (cost.amount <= 0) continue;
      if (cost.type === 'currency') {
        await this.currencyService.spend({ userId, currencyId: cost.id, amount: cost.amount, reason: `Craft: ${recipe.name}`, sourceType: 'crafting', sourceId: recipe.id });
      } else {
        await this.inventoryService.removeItem({ userId, itemId: cost.id, quantity: cost.amount, reason: `Craft: ${recipe.name}`, sourceType: 'crafting', sourceId: recipe.id });
      }
    }
    await this.entityService.setEntityStatus(entityId, userId, 'working');

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const timer = recipe.timer as any;
    const durationSeconds = timer?.duration ?? 0;
    const boostable = timer?.boostable ?? true;
    const durationTicks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;

    const job = await (this.prisma as any).job.create({
      data: {
        userId,
        type: 'CraftingJob',
        defId: recipe.id,
        status: 'active',
        timer: { startTick: currentTick, durationTicks },
        team: [entityId],
      },
    });

    return this.mapJobToCraftingResponse(job);
  }

  async collectCrafting(userId: string, jobId: string) {
    const job = await (this.prisma as any).job.findFirst({
      where: { id: jobId, userId, type: 'CraftingJob', status: { in: ['active', 'ready_notified'] } },
    });
    if (!job) throw new NotFoundException('Crafting job not found');

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const timerData = job.timer as any;
    const targetTick = timerData.startTick + timerData.durationTicks;
    if (currentTick < targetTick) {
      throw new BadRequestException('Crafting is not yet complete');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');
    const reqContext = this.gameRules.buildRequirementContext(user);

    const entityId = job.team[0];
    const entity = await (this.prisma as any).entity.findUnique({ where: { id: entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    const cl = calculateCraftingLuck(entity.stats as any);

    let quality: string;
    if (cl >= 100) quality = 'epic';
    else if (cl >= 60) quality = 'rare';
    else if (cl >= 30) quality = 'uncommon';
    else quality = 'common';

    const recipeId = job.defId;
    const recipe = await (this.prisma as any).recipeDef.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      this.logger.warn(`collectCrafting: definition not found for defId=${recipeId}, failing job gracefully`);
      await this.entityService.setEntityStatus(entity.id, userId, 'idle');
      const errorMsg = `ERROR: Job with id CraftingJob - ${jobId} could not be found.`;
      const updated = await (this.prisma as any).job.update({
        where: { id: jobId },
        data: { status: 'failed', results: { success: false, error: errorMsg, rewards: [] } },
      });
      try {
        await this.notificationService.updateBySource({
          userId,
          sourceType: 'job_ready',
          sourceId: jobId,
          type: 'craft_complete',
          category: 'crafting',
          priority: 'normal',
          title: 'Crafting Failed',
          body: errorMsg,
          markRead: true,
        });
      } catch (err) {
        this.logger.warn(`Failed to update crafting notification: ${err}`);
      }
      return this.mapJobToCraftingResponse(updated);
    }
    const outcomeItems: any[] = Array.isArray(recipe?.rewards) ? recipe.rewards : [];
    const grantedRewards: { type: string; key?: string; amount?: number; name?: string; defId?: string }[] = [];

    const { resolved, texts: rolledTexts } = this.gameRules.resolveOutcomes(outcomeItems, reqContext);

    for (const { entry, amount } of resolved) {
      if (entry.type === 'flag') {
        await this.gameRules.applyFlagEffect(userId, entry);
        continue;
      }
      if (entry.type === 'emitEvent') {
        try {
          const idempotencyKey = entry.idempotencyKey
            ? entry.idempotencyKey.replace('${jobId}', jobId)
            : undefined;
          await this.eventService.dispatch(entry.defId, entry.payload || {}, {
            userId,
            sourceType: 'CraftingJob',
            sourceId: jobId,
            idempotencyKey,
          });
          grantedRewards.push({ type: 'emitEvent', defId: entry.defId });
        } catch (err) {
          this.logger.warn(`emitEvent "${entry.defId}" failed during crafting ${jobId.slice(0,8)}: ${err}`);
        }
        continue;
      }
      if (!amount || amount <= 0) continue;
      switch (entry.type) {
        case 'entity_xp':
          await this.entityService.addEntityXp(entity.id, userId, amount);
          grantedRewards.push({ type: 'entity_xp', amount });
          break;
        case 'keeper_xp':
          await this.playerService.addKeeperXp(userId, amount);
          grantedRewards.push({ type: 'keeper_xp', amount });
          break;
        case 'currency': {
          await this.currencyService.credit({
            userId,
            currencyId: entry.key,
            amount,
            reason: `Crafting: ${recipe?.name || recipeId}`,
            sourceType: 'crafting',
            sourceId: jobId,
          });
          const name = await this.gameRules.resolveName('currency', entry.key);
          grantedRewards.push({ type: 'currency', key: entry.key, amount, name });
          break;
        }
        case 'item': {
          await this.inventoryService.addItem({ userId, itemId: entry.key, quantity: amount, reason: `Crafting: ${recipe?.name || recipeId}`, sourceType: 'crafting', sourceId: jobId });
          const name = await this.gameRules.resolveName('item', entry.key);
          grantedRewards.push({ type: 'item', key: entry.key, amount, name });
          break;
        }
      }
    }

    await this.entityService.setEntityStatus(entity.id, userId, 'idle');

    const updated = await (this.prisma as any).job.update({
      where: { id: jobId },
      data: {
        status: 'collected',
        results: { quality, craftingLuck: cl, rewards: grantedRewards, ...(rolledTexts.length > 0 ? { texts: rolledTexts } : {}) },
      },
    });

    const rewardSummary = grantedRewards.map(r => `${r.amount}x ${r.name || r.key || r.type}`).join(', ');
    try {
      await this.notificationService.updateBySource({
        userId,
        sourceType: 'job_ready',
        sourceId: jobId,
        type: 'craft_complete',
        category: 'crafting',
        priority: 'normal',
        title: 'Crafting Complete!',
        body: `${recipe?.name || recipeId} — ${quality} quality${rewardSummary ? ` (${rewardSummary})` : ''}`,
        deepLink: { screen: '/crafting', craftJobId: jobId },
        markRead: true,
      });
    } catch (err) {
      // notification update is non-critical
    }

    return this.mapJobToCraftingResponse(updated);
  }
}
