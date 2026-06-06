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
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../telemetry/telemetry-context-builder.service';
import { SynergyResolverService } from '../synergy/synergy-resolver.service';
import { adoptLegacyCraftingJobLocations } from './legacy-job-adoption.util';
import { EffectCategory, EffectTargetType, applyModifier, emptyResolvedModifier, type TraitPrimitive } from '@derp/shared';
import {
  calculateCraftingLuck,
  effectiveCL,
  rollPassFail,
  rollQualityFromCl,
  qualityProbabilities,
  collapseQualityProbabilities,
  durationSecondsToTicks,
  workshopLuckFloor,
  workshopParallelSlots,
  workshopTimerMultiplier,
  workshopRecipeTierCap,
  QUALITY_TIERS,
  SeededRng,
} from '@derp/math';
import { mergeDisplayStyles, type DisplayStyle } from '@derp/shared';

const EMPTY_TIER_BLOCK = { rewards: [] };

function normaliseRewards(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    // { rewards: [...] } wrapper shape
    if (Array.isArray(raw.rewards)) return raw.rewards;
    // { items: [...] } shape
    if (Array.isArray(raw.items)) return raw.items;
    // { type: 'bundle', entries: [...] } shape
    if (raw.type === 'bundle' && Array.isArray(raw.entries)) return raw.entries;
  }
  return [];
}

function getRecipeTiers(recipe: any): Record<string, { rewards: any[]; clRequirement?: number }> {
  const tiers = (recipe?.tiers as any) || {};
  // Legacy fallback: if tiers is empty and a top-level rewards value exists
  const legacyRewards = normaliseRewards(recipe?.rewards);
  const legacyCommon =
    Object.keys(tiers).length === 0 && legacyRewards.length > 0
      ? { rewards: legacyRewards }
      : EMPTY_TIER_BLOCK;

  const build = (block: any): { rewards: any[]; clRequirement?: number } => {
    if (!block) return EMPTY_TIER_BLOCK;
    return { ...block, rewards: normaliseRewards(block.rewards) };
  };

  return {
    failure:   build(tiers.failure)   ?? EMPTY_TIER_BLOCK,
    common:    build(tiers.common)    ?? legacyCommon,
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
    private telemetryService: TelemetryService,
    private synergyResolver: SynergyResolverService,
    private telemetryContextBuilder: TelemetryContextBuilderService,
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

    if (!userId) return allDefs.map((d: any) => this.mapDefToRecipeResponse(d));

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return allDefs.map((d: any) => this.mapDefToRecipeResponse(d));

    return allDefs
      .filter((d: any) => this.gameRules.checkVisibility(d.visibilityRequirements, user as any))
      .map((d: any) => this.mapDefToRecipeResponse(d));
  }

  private mapDefToRecipeResponse(def: any) {
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
      difficulty: def.difficulty ?? 0,
      tiers: def.tiers ?? {},
      multicraft: def.multicraft ?? null,
      requirements: def.requirements,
      visibilityRequirements: def.visibilityRequirements,
      tier: this.recipeTier(def),
      displayDef: display,
    };
  }

  async getMaxWorkshopTier(userId: string, locationId?: string): Promise<number> {
    const workshops = await this.getWorkshops(userId);
    const eligible = workshops.filter((w: any) => w.enabled && (locationId ? w.locationId === locationId : true));
    return eligible.reduce((m: number, w: any) => Math.max(m, Number(w.level || 0)), 0);
  }

  private async countActiveCraftingAtLocation(userId: string, locationId: string): Promise<number> {
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId, type: 'CraftingJob', status: { in: ['active', 'ready_notified'] } },
      select: { data: true },
    });
    return jobs.filter((j: any) => (j.data?.locationId ?? null) === locationId).length;
  }

  private recipeTier(def: any): number {
    const explicit = (def?.data as any)?.tier;
    if (typeof explicit === 'number' && explicit >= 1 && explicit <= 3) return explicit;
    return 1;
  }

  async getLuckForecast(userId: string, options: { includeAll?: boolean; locationId?: string; recipeId?: string } = {}) {
    const includeAll = options.includeAll === true;
    const entities = await (this.prisma as any).entity.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ createdAt: 'asc' }],
    });

    const tiers = QUALITY_TIERS.map((t) => ({ key: t.key, label: t.label, center: t.center }));
    const cap = 200;
    const workshopTier = await this.getMaxWorkshopTier(userId, options.locationId);
    const luckFloor = workshopLuckFloor(workshopTier);

    let recipeTiersMap: Record<string, any> | null = null;
    let recipeCenterOverrides: Partial<Record<string, number>> = {};
    let recipeSigma: number | undefined;
    if (options.recipeId) {
      const recipe = await (this.prisma as any).recipeDef.findUnique({ where: { id: options.recipeId } });
      if (recipe) {
        recipeTiersMap = (recipe.tiers as any) ?? {};
        for (const [key, block] of Object.entries(recipeTiersMap!)) {
          if (key !== 'failure' && key !== 'sigma' && block && typeof block === 'object' && typeof (block as any).clRequirement === 'number') {
            recipeCenterOverrides[key] = (block as any).clRequirement;
          }
        }
        recipeSigma = typeof recipeTiersMap!.sigma === 'number' ? recipeTiersMap!.sigma : undefined;
      }
    }

    const forecasts = entities.map((entity: any) => {
      const stats = (entity.stats as any) || {};
      const state = (entity.state as any) || {};
      const status = state.status || 'idle';
      const progression = (entity.progression as any) || {};
      const rawCl = calculateCraftingLuck(stats);
      const cl = Math.max(rawCl, luckFloor);
      const rawProbs = qualityProbabilities(cl, recipeCenterOverrides, recipeSigma);
      let probs = rawProbs;
      if (recipeTiersMap !== null) {
        probs = collapseQualityProbabilities(rawProbs, (key) => {
          const block = recipeTiersMap![key];
          return block != null && typeof block === 'object' && Array.isArray((block as any).rewards) && (block as any).rewards.length > 0;
        });
      }
      const topTier = probs.length > 0
        ? probs.reduce((best, p) => p.probability > best.probability ? p : best, probs[0])
        : rawProbs.reduce((best, p) => p.probability > best.probability ? p : best, rawProbs[0]);
      const display = (entity.display as any) || {};
      return {
        entityId: entity.id,
        name: display.name || `Lvl ${progression.level || 1}`,
        level: Number(progression.level ?? 1),
        status,
        idle: status === 'idle',
        stats: { FOC: Number(stats.FOC ?? 0), LCK: Number(stats.LCK ?? 0) },
        craftingLuck: Number(cl.toFixed(2)),
        rawCraftingLuck: Number(rawCl.toFixed(2)),
        luckFloor,
        probabilities: probs,
        expectedQuality: topTier.key,
        expectedQualityLabel: topTier.label,
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

    try {
      await adoptLegacyCraftingJobLocations(this.prisma, jobs as any[], async () => {
        const workshops = await this.getWorkshops(userId).catch(() => [] as any[]);
        return workshops.find((w: any) => w.enabled)?.locationId
          || workshops[0]?.locationId
          || null;
      });
    } catch { /* best-effort */ }

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

  async startCrafting(
    userId: string,
    recipeId: string,
    entityId: string,
    locationId?: string,
    outerTx?: any,
    quantity = 1,
  ) {
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

    // Validate multicraft quantity
    const multicraft = (recipe.multicraft as any) ?? null;
    const validatedQuantity = this.validateMulticraftQuantity(quantity, multicraft);

    const entity = await this.entityService.getEntity(entityId, userId);
    const entityStatus = (entity as any).state?.status || 'idle';
    if (entityStatus !== 'idle') {
      throw new BadRequestException(`Entity is currently ${entityStatus}`);
    }

    const costEntries: Array<{ type: string; id: string; amount: number }> = recipe.cost ?? [];

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const timer = recipe.timer as any;
    const durationSeconds = timer?.duration ?? 0;
    const boostable = timer?.boostable ?? true;
    let durationTicks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;

    const [timerMod, legacyTimerMod] = await Promise.all([
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.CRAFTING_TIMER_SPEED),
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED),
    ]);
    const combinedTimer = {
      ...emptyResolvedModifier(),
      flatAdd: timerMod.flatAdd + legacyTimerMod.flatAdd,
      percentAdd: timerMod.percentAdd + legacyTimerMod.percentAdd,
      multiplier: timerMod.multiplier * legacyTimerMod.multiplier,
    };
    if (combinedTimer.flatAdd !== 0 || combinedTimer.percentAdd !== 0 || combinedTimer.multiplier !== 1) {
      durationTicks = Math.max(1, Math.floor(applyModifier(durationTicks, combinedTimer)));
    }

    {
      const tier = Number(workshopMatch?.level || 0);
      const mult = workshopTimerMultiplier(tier);
      if (mult !== 1) {
        durationTicks = Math.max(1, Math.floor(durationTicks * mult));
      }
    }

    const craftingDescriptor = [{
      entityId: (entity as any).id as string,
      entityType: ((entity as any).role as string | undefined) ?? undefined,
      traits: ((entity as any).traits ?? {}) as Record<string, TraitPrimitive>,
      speciesId: (entity as any).definitionId as string | undefined,
      collectionId: (entity as any).nftCollectionDefId as string | undefined,
      rarity: typeof ((entity as any).traits as any)?.rarity === 'string' ? ((entity as any).traits as any).rarity : undefined,
    }];
    const craftingSynergyResult = await this.synergyResolver.resolveRules(
      { activityType: 'crafting', teamSize: 1 },
      craftingDescriptor,
      craftingDescriptor,
    );
    const craftingSynergySnapshot = {
      ruleIds: craftingSynergyResult.matchedRules.map(r => r.ruleId),
      totals: craftingSynergyResult.totals,
    };
    const craftingDurationMod = craftingSynergyResult.totals.durationModifiers['crafting'];
    if (craftingDurationMod) {
      if (craftingDurationMod.percentAdd !== 0) {
        durationTicks = Math.max(1, Math.floor(durationTicks * (1 + craftingDurationMod.percentAdd / 100)));
      }
      if (craftingDurationMod.flatSeconds !== 0) {
        durationTicks = Math.max(1, durationTicks + Math.round(craftingDurationMod.flatSeconds));
      }
    }

    // Scale duration by quantity when timer mode is linear
    const timerMode = multicraft?.timer ?? 'flat';
    const totalDurationTicks = timerMode === 'linear'
      ? Math.max(1, durationTicks * validatedQuantity)
      : durationTicks;

    const doWrites = async (tx: any) => {
      for (const cost of costEntries) {
        if (cost.amount <= 0) continue;
        const scaledAmount = cost.amount * validatedQuantity;
        if (cost.type === 'currency') {
          await this.currencyService.spendTx(tx, { userId, currencyId: cost.id, amount: scaledAmount, reason: `Craft ×${validatedQuantity}: ${recipe.name}`, sourceType: 'crafting', sourceId: recipe.id });
        } else {
          await this.inventoryService.removeItemTx(tx, { userId, itemId: cost.id, quantity: scaledAmount, reason: `Craft ×${validatedQuantity}: ${recipe.name}`, sourceType: 'crafting', sourceId: recipe.id });
        }
      }
      await this.entityService.setEntityStatus(entityId, userId, 'working', tx);

      return (tx as any).job.create({
        data: {
          userId,
          type: 'CraftingJob',
          defId: recipe.id,
          status: 'active',
          timer: { startTick: currentTick, durationTicks: totalDurationTicks },
          team: [entityId],
          data: {
            seed: randomUUID(),
            locationId: effectiveLocationId,
            synergy: craftingSynergySnapshot,
            quantity: validatedQuantity,
          },
          readyAtTick: Math.floor(currentTick) + totalDurationTicks,
        },
      });
    };

    const job = outerTx
      ? await doWrites(outerTx)
      : await this.prisma.$transaction((tx) => doWrites(tx));

    return this.mapJobToCraftingResponse(job);
  }

  private validateMulticraftQuantity(requested: number, multicraft: any): number {
    if (!multicraft) return 1;
    const raw = Number(requested);
    if (!Number.isFinite(raw) || raw < 1) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
    const qty = Math.max(1, Math.floor(raw));
    if (multicraft.mode === 'tiers' && Array.isArray(multicraft.tiers)) {
      if (!multicraft.tiers.includes(qty)) {
        throw new BadRequestException(
          `Invalid quantity ${qty}. Allowed quantities: ${multicraft.tiers.join(', ')}`,
        );
      }
      return qty;
    }
    if (multicraft.mode === 'free') {
      const max = Number(multicraft.max);
      if (Number.isFinite(max) && qty > max) {
        throw new BadRequestException(`Maximum quantity for this recipe is ${max}`);
      }
      return qty;
    }
    return 1;
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

    let rawCl = calculateCraftingLuck(entity.stats as any);
    const persistedCraftingSynergy = (job.data as any)?.synergy as
      | { ruleIds: string[]; totals: import('../synergy/synergy.types').SynergyTotals }
      | undefined;
    if (persistedCraftingSynergy) {
      const luckPctAdd = persistedCraftingSynergy.totals.statModifiers?.['CRAFTING_LUCK']?.percentAdd ?? 0;
      if (luckPctAdd !== 0) {
        rawCl = rawCl * (1 + luckPctAdd / 100);
      }
    }
    const jobLocationId = (job.data as { locationId?: string | null })?.locationId ?? undefined;
    const workshopTier = await this.getMaxWorkshopTier(userId, jobLocationId);
    const luckFloor = workshopLuckFloor(workshopTier);
    const cl = Math.max(rawCl, luckFloor);
    const jobQuantity: number = (job.data as any)?.quantity ?? 1;

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
        await this.notificationService.upsertJobNotification({
          userId,
          jobId,
          type: 'craft_complete',
          category: 'crafting',
          priority: 'normal',
          title: 'Crafting Failed',
          body: errorMsg,
        });
      } catch (err) {
        this.logger.warn(`Failed to update crafting notification: ${err}`);
      }
      return { ...this.mapJobToCraftingResponse(updated), updatedNotification: null };
    }

    const recipeTiers = getRecipeTiers(recipe);
    const centerOverrides = buildCenterOverrides(recipeTiers);
    const recipeSigma: number | undefined = typeof (recipe.tiers as any)?.sigma === 'number'
      ? (recipe.tiers as any).sigma
      : undefined;
    const difficulty = recipe.difficulty ?? 0;
    const effectiveCLValue = effectiveCL(cl);

    const seed = (job.data as { seed?: string })?.seed ?? jobId;
    const rng = new SeededRng(seed);

    // Step 1 — pass/fail gate
    const passed = rollPassFail(effectiveCLValue, difficulty, rng);

    let quality: string;
    let qualityLabel: string;
    let qualityProbs: any[];
    let outcomeItems: any[];

    if (!passed) {
      quality = 'failure';
      qualityLabel = 'Failure';
      qualityProbs = collapseQualityProbabilities(
        qualityProbabilities(effectiveCLValue, centerOverrides, recipeSigma),
        (key) => Array.isArray(recipeTiers[key]?.rewards) && recipeTiers[key].rewards.length > 0,
      );
      outcomeItems = Array.isArray(recipeTiers.failure?.rewards) ? recipeTiers.failure.rewards : [];
    } else {
      // Step 2 — quality roll across success tiers
      const rolled = rollQualityFromCl(effectiveCLValue, rng, centerOverrides, recipeSigma);
      quality = rolled.key;
      qualityLabel = rolled.label;
      qualityProbs = collapseQualityProbabilities(
        rolled.probabilities,
        (key) => Array.isArray(recipeTiers[key]?.rewards) && recipeTiers[key].rewards.length > 0,
      );
      const tierBlock = recipeTiers[quality] ?? EMPTY_TIER_BLOCK;
      outcomeItems = Array.isArray(tierBlock.rewards) ? tierBlock.rewards : [];
    }

    const grantedRewards: { type: string; key?: string; amount?: number; name?: string; defId?: string }[] = [];

    const { resolved, texts: rolledTexts, flags: resolvedFlags } = await this.gameRules.resolveOutcomesAsync(outcomeItems, reqContext, rng);

    const nameCache: Record<string, string> = {};
    for (const { entry } of resolved) {
      if ((entry.type === 'currency' || entry.type === 'item') && entry.key && !nameCache[`${entry.type}:${entry.key}`]) {
        try {
          nameCache[`${entry.type}:${entry.key}`] = await this.gameRules.resolveName(entry.type, entry.key);
        } catch {
          nameCache[`${entry.type}:${entry.key}`] = entry.key;
        }
      }
    }

    const doWrites = async (tx: any) => {
      for (const { entry, amount } of resolved) {
        if (entry.type === 'emitEvent') continue;
        // Scale reward amounts by quantity
        const scaledAmount = typeof amount === 'number' ? amount * jobQuantity : amount;
        if (!scaledAmount || scaledAmount <= 0) continue;
        switch (entry.type) {
          case 'entity_xp':
            await this.entityService.addEntityXp(entity.id, userId, scaledAmount, tx);
            grantedRewards.push({ type: 'entity_xp', amount: scaledAmount });
            break;
          case 'keeper_xp':
            await this.playerService.addKeeperXp(userId, scaledAmount, tx);
            grantedRewards.push({ type: 'keeper_xp', amount: scaledAmount });
            break;
          case 'currency': {
            await this.currencyService.creditTx(tx as any, {
              userId,
              currencyId: entry.key,
              amount: scaledAmount,
              reason: `Crafting: ${recipe?.name || recipeId}`,
              sourceType: 'crafting',
              sourceId: jobId,
            });
            grantedRewards.push({ type: 'currency', key: entry.key, amount: scaledAmount, name: nameCache[`currency:${entry.key}`] });
            break;
          }
          case 'item': {
            await this.inventoryService.addItemTx(tx as any, { userId, itemId: entry.key, quantity: scaledAmount, reason: `Crafting: ${recipe?.name || recipeId}`, sourceType: 'crafting', sourceId: jobId });
            grantedRewards.push({ type: 'item', key: entry.key, amount: scaledAmount, name: nameCache[`item:${entry.key}`] });
            break;
          }
        }
      }

      if (resolvedFlags.length > 0) {
        await (tx as any).user.update({ where: { id: userId }, data: { flags: reqContext.userFlags as any } });
      }

      await this.entityService.setEntityStatus(entity.id, userId, 'idle', tx);

      return await (tx as any).job.update({
        where: { id: jobId },
        data: {
          status: 'collected',
          results: {
            quality,
            qualityLabel,
            passed,
            craftingLuck: cl,
            rawCraftingLuck: rawCl,
            luckFloor,
            workshopTier,
            difficulty,
            quantity: jobQuantity,
            qualityProbabilities: qualityProbs,
            rewards: grantedRewards,
            ...(rolledTexts.length > 0 ? { texts: rolledTexts } : {}),
          },
        },
      });
    };

    const updated = externalTx
      ? await doWrites(externalTx)
      : await this.prisma.$transaction(doWrites, { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' });

    try {
      let selectionContext;
      try {
        selectionContext = await this.telemetryContextBuilder.buildContext(userId, {
          entityIds: entityId ? [entityId] : [],
        });
      } catch (ctxErr) {
        this.logger.warn(`Failed to build selection context for crafting telemetry: ${ctxErr}`);
      }
      await this.telemetryService.record(
        userId,
        'crafting_completed',
        recipeId,
        1,
        { quality, passed, jobId },
        externalTx,
        selectionContext,
      );
    } catch (err) {
      this.logger.warn(`Failed to record crafting telemetry: ${err}`);
    }

    for (const { entry } of resolved) {
      if (entry.type !== 'emitEvent') continue;
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
    }

    const rewardSummary = grantedRewards.map(r => `${r.amount}x ${r.name || r.key || r.type}`).join(', ');
    const notifBody = passed
      ? `${recipe?.name || recipeId} — ${qualityLabel} quality${rewardSummary ? ` (${rewardSummary})` : ''}`
      : `${recipe?.name || recipeId} — Craft failed`;
    const notifDeepLink = jobLocationId
      ? { screen: `/locations/${jobLocationId}/workshop`, craftJobId: jobId, locationId: jobLocationId }
      : { screen: '/crafting', craftJobId: jobId };
    let updatedNotification: any = null;
    try {
      updatedNotification = await this.notificationService.upsertJobNotification({
        userId,
        jobId,
        type: 'craft_complete',
        category: 'crafting',
        priority: 'normal',
        title: passed ? 'Crafting Complete!' : 'Crafting Failed',
        body: notifBody,
        deepLink: notifDeepLink,
      }, externalTx);
    } catch (err) {
      // notification update is non-critical
    }

    return { ...this.mapJobToCraftingResponse(updated), updatedNotification };
  }
}
