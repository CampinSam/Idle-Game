import { randomUUID } from 'crypto';
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
import { EffectService } from '../effect/effect.service';
import { EffectCategory, EffectTargetType, applyModifier } from '@derp/shared';
import {
  calculateCraftingLuck,
  durationSecondsToTicks,
  workshopLuckFloor,
  workshopParallelSlots,
  workshopTimerMultiplier,
  workshopRecipeTierCap,
  QUALITY_TIERS,
  SeededRng,
} from '@derp/math';
import { mergeDisplayStyles, type DisplayStyle } from '@derp/shared';

function qualityFromCl(cl: number): { key: string; label: string } {
  for (let i = QUALITY_TIERS.length - 1; i >= 0; i--) {
    if (cl >= QUALITY_TIERS[i].minCl) return { key: QUALITY_TIERS[i].key, label: QUALITY_TIERS[i].label };
  }
  return { key: QUALITY_TIERS[0].key, label: QUALITY_TIERS[0].label };
}

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
    private effectService: EffectService,
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
    const allDefs = await (this.prisma as any).recipeDef.findMany({
      include: { displayDef: true },
    });

    if (!userId) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    return allDefs
      .filter((d: any) => this.gameRules.checkVisibility(d.visibilityRequirements, user as any))
      .map((d: any) => this.mapDefToLegacy(d));
  }

  private mapDefToLegacy(def: any) {
    const dd = def.displayDef;
    const display = dd ? {
      id: dd.id,
      borderColor: dd.borderColor,
      backgroundImage: dd.backgroundImage,
      cardBackground: dd.cardBackground,
      style: mergeDisplayStyles(undefined, dd.style as DisplayStyle | undefined),
    } : null;
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
      // Surface the resolved tier so the client can compute Codex availability
      // and lock state without re-deriving the rule.
      tier: this.recipeTier(def),
      displayDef: display,
    };
  }

  /**
   * Returns the highest workshop tier (level) the player owns. Returns 0 if
   * the player has no enabled workshop. Used to apply a CL "luck floor" so
   * higher-tier workshops shore up bad-stat entities.
   */
  async getMaxWorkshopTier(userId: string, locationId?: string): Promise<number> {
    const workshops = await this.getWorkshops(userId);
    const eligible = workshops.filter((w: any) => w.enabled && (locationId ? w.locationId === locationId : true));
    return eligible.reduce((m: number, w: any) => Math.max(m, Number(w.level || 0)), 0);
  }

  /**
   * Counts active CraftingJob rows scoped to a specific location (read from
   * Job.data.locationId). Used for slot-cap enforcement.
   */
  private async countActiveCraftingAtLocation(userId: string, locationId: string): Promise<number> {
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId, type: 'CraftingJob', status: { in: ['active', 'ready_notified'] } },
      select: { data: true },
    });
    return jobs.filter((j: any) => (j.data?.locationId ?? null) === locationId).length;
  }

  /**
   * Recipe "tier" comes from optional metadata in recipeDef.data.tier (1-3).
   * Falls back to derive from requiredKeeperLevel: ≤3 → tier 1, ≤6 → tier 2,
   * else tier 3, so existing seeds without explicit tiers still gate sensibly.
   */
  private recipeTier(def: any): number {
    const explicit = (def?.data as any)?.tier;
    if (typeof explicit === 'number' && explicit >= 1 && explicit <= 3) return explicit;
    const lvl = Number(def?.requiredKeeperLevel ?? 1);
    if (lvl <= 3) return 1;
    if (lvl <= 6) return 2;
    return 3;
  }

  async getLuckForecast(userId: string, options: { includeAll?: boolean; locationId?: string } = {}) {
    const includeAll = options.includeAll === true;
    const entities = await (this.prisma as any).entity.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ createdAt: 'asc' }],
    });

    const tiers = QUALITY_TIERS.map((t) => ({ key: t.key, label: t.label, minCl: t.minCl }));
    const cap = 150;
    const workshopTier = await this.getMaxWorkshopTier(userId, options.locationId);
    const luckFloor = workshopLuckFloor(workshopTier);

    const forecasts = entities.map((entity: any) => {
      const stats = (entity.stats as any) || {};
      const state = (entity.state as any) || {};
      const status = state.status || 'idle';
      const progression = (entity.progression as any) || {};
      const rawCl = calculateCraftingLuck(stats);
      const effectiveCl = Math.max(rawCl, luckFloor);
      const expected = qualityFromCl(effectiveCl);
      const display = (entity.display as any) || {};
      return {
        entityId: entity.id,
        name: display.name || `Lvl ${progression.level || 1}`,
        level: Number(progression.level ?? 1),
        status,
        idle: status === 'idle',
        stats: { FOC: Number(stats.FOC ?? 0), LCK: Number(stats.LCK ?? 0) },
        craftingLuck: Number(effectiveCl.toFixed(2)),
        rawCraftingLuck: Number(rawCl.toFixed(2)),
        luckFloor,
        expectedQuality: expected.key,
        expectedQualityLabel: expected.label,
      };
    });

    const slotsTotal = workshopParallelSlots(workshopTier);
    const slotsUsed = options.locationId
      ? await this.countActiveCraftingAtLocation(userId, options.locationId)
      : 0;
    const timerMultiplier = workshopTimerMultiplier(workshopTier);
    const recipeTierCap = workshopRecipeTierCap(workshopTier);

    return {
      cap,
      tiers,
      workshopTier,
      luckFloor,
      slotsTotal,
      slotsUsed,
      slotsOpen: Math.max(0, slotsTotal - slotsUsed),
      timerMultiplier,
      recipeTierCap,
      entities: includeAll ? forecasts : forecasts.filter((f: any) => f.idle),
    };
  }

  /**
   * Returns the workshop-eligible buildings owned by the user. Used by the Home
   * Forge hero card and Items "Craft with this" entry to know whether a player
   * can actually open the Forge yet, and which outpost to deep-link to.
   */
  async getWorkshops(userId: string) {
    const buildings = await (this.prisma as any).locationBuildingInstance.findMany({
      where: {
        location: { ownerUserId: userId },
        OR: [
          { buildingDef: { category: 'WORKSHOP' } },
          { buildingDef: { tags: { array_contains: 'workshop' } } },
        ],
      },
      include: {
        location: { include: { definition: { include: { region: true } } } },
        buildingDef: { include: { displayDef: true } },
      },
      orderBy: { createdAt: 'asc' },
    }).catch(async () => {
      // tags JSON `array_contains` may not be supported on every Postgres setup;
      // fall back to a category-only filter and let the seed data drive WORKSHOP.
      return (this.prisma as any).locationBuildingInstance.findMany({
        where: {
          location: { ownerUserId: userId },
          buildingDef: { category: 'WORKSHOP' },
        },
        include: {
          location: { include: { definition: { include: { region: true } } } },
          buildingDef: { include: { displayDef: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    return buildings.map((b: any) => ({
      buildingId: b.id,
      buildingDefId: b.buildingDefId,
      name: b.buildingDef?.name || b.buildingDefId,
      level: b.level,
      enabled: b.enabled !== false,
      locationId: b.locationId,
      // Surfaced so the /crafting redirect can show a meaningful outpost
      // selector when the player owns more than one Forge. LocationDefinition
      // has no `name` column today; the friendly label comes from the region.
      locationName: b.location?.definition?.region?.displayName
        || b.location?.definition?.id
        || b.locationId,
      displayDef: this.mapBuildingDisplayDef(b.buildingDef),
    }));
  }

  private mapBuildingDisplayDef(def: any) {
    const dd = def?.displayDef;
    if (!dd) return null;
    return {
      id: dd.id,
      borderColor: dd.borderColor,
      backgroundImage: dd.backgroundImage,
      cardBackground: dd.cardBackground,
      style: mergeDisplayStyles(undefined, dd.style as DisplayStyle | undefined),
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

  /**
   * Crafting is a place — the player must own at least one enabled WORKSHOP
   * (Forge) building before any craft can begin. Throws BadRequestException
   * otherwise so the API surface enforces the rule in addition to the UI.
   */
  private async assertHasEnabledWorkshop(userId: string): Promise<void> {
    const workshops = await this.getWorkshops(userId);
    const hasEnabled = workshops.some((w: any) => w.enabled);
    if (!hasEnabled) {
      throw new BadRequestException(
        'You need to build a Forge in your Outpost before crafting.',
      );
    }
  }

  /**
   * Used by the Forge page to verify that a given location actually hosts an
   * enabled WORKSHOP building owned by this player. Returns the matching
   * workshop entry, or throws so the UI can redirect.
   */
  async assertWorkshopAtLocation(userId: string, locationId: string) {
    const workshops = await this.getWorkshops(userId);
    const match = workshops.find(
      (w: any) => w.locationId === locationId && w.enabled,
    );
    if (!match) {
      throw new NotFoundException('No enabled workshop at this location.');
    }
    return match;
  }

  async startCrafting(userId: string, recipeId: string, entityId: string, locationId?: string) {
    // Crafting is a place: always resolve to a concrete enabled workshop so
    // slot cap / tier-cap / timer mechanics apply uniformly. If the caller
    // didn't pass a locationId, fall back to the player's first enabled
    // workshop (legacy clients).
    let workshopMatch: any = null;
    let effectiveLocationId: string;
    if (locationId) {
      workshopMatch = await this.assertWorkshopAtLocation(userId, locationId);
      effectiveLocationId = locationId;
    } else {
      const workshops = await this.getWorkshops(userId);
      workshopMatch = workshops.find((w: any) => w.enabled);
      if (!workshopMatch) {
        throw new BadRequestException(
          'You need to build a Forge in your Outpost before crafting.',
        );
      }
      effectiveLocationId = workshopMatch.locationId;
    }

    // Place-scoped slot cap: workshop tier governs how many parallel crucibles
    // a single Forge can run. Block before any spend so failed starts don't
    // burn currencies/items.
    {
      const tier = Number(workshopMatch?.level || 0);
      const slotsTotal = workshopParallelSlots(tier);
      const slotsUsed = await this.countActiveCraftingAtLocation(userId, effectiveLocationId);
      if (slotsUsed >= slotsTotal) {
        throw new BadRequestException(
          `All ${slotsTotal} crucible${slotsTotal === 1 ? '' : 's'} at this Forge are in use. Upgrade the Workshop to unlock more slots.`,
        );
      }
    }

    const recipe = await (this.prisma as any).recipeDef.findUnique({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');

    if (!this.gameRules.checkVisibility(recipe.visibilityRequirements, user as any)) {
      throw new BadRequestException('Recipe is not available');
    }

    if (user.keeperLevel < recipe.requiredKeeperLevel) {
      throw new BadRequestException(
        `Requires Keeper Level ${recipe.requiredKeeperLevel}`,
      );
    }

    // Recipe tier vs workshop tier — Tier-2 recipes need a Tier-2 Workshop.
    {
      const tier = Number(workshopMatch?.level || 0);
      const recipeTier = this.recipeTier(recipe);
      const cap = workshopRecipeTierCap(tier);
      if (recipeTier > cap) {
        throw new BadRequestException(
          `This recipe needs a Tier ${recipeTier} Workshop. Your Forge here is Tier ${tier || 1}.`,
        );
      }
    }

    const entity = await this.entityService.getEntity(entityId, userId);
    const entityStatus = (entity as any).state?.status || 'idle';
    if (entityStatus !== 'idle') {
      throw new BadRequestException(`Entity is currently ${entityStatus}`);
    }

    const costEntries: Array<{ type: string; id: string; amount: number }> = recipe.cost ?? [];
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
    let durationTicks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;

    const timerMod = await this.effectService.resolveForTarget(
      userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED,
    );
    if (timerMod.flatAdd !== 0 || timerMod.percentAdd !== 0 || timerMod.multiplier !== 1) {
      durationTicks = Math.max(1, Math.floor(applyModifier(durationTicks, timerMod)));
    }

    // Workshop tier shortens the timer (Tier 2 ×0.9, Tier 3 ×0.8). Applied
    // after effect modifiers so high-tier Workshops compound with boosts.
    {
      const tier = Number(workshopMatch?.level || 0);
      const mult = workshopTimerMultiplier(tier);
      if (mult !== 1) {
        durationTicks = Math.max(1, Math.floor(durationTicks * mult));
      }
    }

    const job = await (this.prisma as any).job.create({
      data: {
        userId,
        type: 'CraftingJob',
        defId: recipe.id,
        status: 'active',
        timer: { startTick: currentTick, durationTicks },
        team: [entityId],
        data: { seed: randomUUID(), locationId: effectiveLocationId },
      },
    });

    return this.mapJobToCraftingResponse(job);
  }

  async collectCrafting(userId: string, jobId: string, externalTx?: any) {
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
    const reqContext = this.gameRules.buildRequirementContext(user as any);

    const entityId = job.team[0];
    const entity = await (this.prisma as any).entity.findUnique({ where: { id: entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    const rawCl = calculateCraftingLuck(entity.stats as any);
    const jobLocationId = (job.data as { locationId?: string | null })?.locationId ?? undefined;
    const workshopTier = await this.getMaxWorkshopTier(userId, jobLocationId);
    const luckFloor = workshopLuckFloor(workshopTier);
    const cl = Math.max(rawCl, luckFloor);

    const quality = qualityFromCl(cl).key;

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
      return { ...this.mapJobToCraftingResponse(updated), updatedNotification: null };
    }
    const outcomeItems: any[] = Array.isArray(recipe?.rewards) ? recipe.rewards : [];
    const grantedRewards: { type: string; key?: string; amount?: number; name?: string; defId?: string }[] = [];

    const seed = (job.data as { seed?: string })?.seed ?? jobId;
    const rng = new SeededRng(seed);
    const { resolved, texts: rolledTexts, flags: resolvedFlags } = await this.gameRules.resolveOutcomesAsync(outcomeItems, reqContext, rng);

    for (const { entry, amount } of resolved) {
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

    if (resolvedFlags.length > 0) {
      await (this.prisma as any).user.update({ where: { id: userId }, data: { flags: reqContext.userFlags as any } });
    }

    await this.entityService.setEntityStatus(entity.id, userId, 'idle');

    const updated = await (this.prisma as any).job.update({
      where: { id: jobId },
      data: {
        status: 'collected',
        results: {
          quality,
          craftingLuck: cl,
          rawCraftingLuck: rawCl,
          luckFloor,
          workshopTier,
          rewards: grantedRewards,
          ...(rolledTexts.length > 0 ? { texts: rolledTexts } : {}),
        },
      },
    });

    const rewardSummary = grantedRewards.map(r => `${r.amount}x ${r.name || r.key || r.type}`).join(', ');
    const notifBody = `${recipe?.name || recipeId} — ${quality} quality${rewardSummary ? ` (${rewardSummary})` : ''}`;
    const notifDeepLink = { screen: '/crafting', craftJobId: jobId };
    let updatedNotification: any = null;

    if (externalTx) {
      try {
        const existing = await (externalTx as any).notification.findFirst({
          where: { userId, sourceType: 'job_ready', sourceId: jobId, archivedAt: null },
        });
        if (existing) {
          updatedNotification = await (externalTx as any).notification.update({
            where: { id: existing.id },
            data: { type: 'craft_complete', title: 'Crafting Complete!', body: notifBody, readAt: new Date(), dismissedAt: null, deepLink: notifDeepLink },
          });
        }
      } catch (err) {
        // notification update is non-critical
      }
    } else {
      try {
        await this.notificationService.updateBySource({
          userId,
          sourceType: 'job_ready',
          sourceId: jobId,
          type: 'craft_complete',
          category: 'crafting',
          priority: 'normal',
          title: 'Crafting Complete!',
          body: notifBody,
          deepLink: notifDeepLink,
          markRead: true,
        });
      } catch (err) {
        // notification update is non-critical
      }
    }

    return { ...this.mapJobToCraftingResponse(updated), updatedNotification };
  }
}
