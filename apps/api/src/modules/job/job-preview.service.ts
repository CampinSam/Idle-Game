import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameRulesService, TeamEntitySnap, RequirementContext } from '../game-rules/game-rules.service';
import { evaluateTopLevelRules } from '../game-rules/evaluate-top-level-rules.util';
import { SynergyResolverService } from '../synergy/synergy-resolver.service';
import { EffectService } from '../effect/effect.service';
import { CurrencyService } from '../currency/currency.service';
import { computeEquippedStats } from '../entity/entity-stats.util';
import {
  ANTI_WHALE_CAPS,
  EffectCategory,
  EffectTargetContext,
  EffectTargetType,
  applyModifier,
  applyStatModifiers,
  emptyResolvedModifier,
} from '@derp/shared';
import {
  calculateTeamMP,
  calculateSuccessChance,
  calculateInjuryChance,
  durationSecondsToTicks,
  workshopTimerMultiplier,
  workshopParallelSlots,
  workshopRecipeTierCap,
  calculateCraftingLuck,
  workshopLuckFloor,
  qualityProbabilities,
} from '@derp/math';
import type { EntityForMP } from '@derp/math';
import {
  resolveLevelConfig,
  resolveConstructionCosts,
  calcGrowth,
  type LevelRules,
} from '../game-rules/level-config.util';

export interface JobPreviewDto {
  jobType: 'mission' | 'crafting' | 'building';
  defId: string;
  entityIds?: string[];
  entityId?: string;
  quantity?: number;
  locationId?: string;
}

export interface JobPreviewRequirement {
  label?: string;
  met: boolean;
  text?: string;
  source: 'requirements' | 'launchRequirements';
}

@Injectable()
export class JobPreviewService {
  constructor(
    private prisma: PrismaService,
    private gameRules: GameRulesService,
    private synergyResolver: SynergyResolverService,
    private effectService: EffectService,
    private currencyService: CurrencyService,
  ) {}

  async getPreview(userId: string, dto: JobPreviewDto): Promise<any> {
    switch (dto.jobType) {
      case 'mission':
        return this.getMissionPreview(userId, dto);
      case 'crafting':
        return this.getCraftingPreview(userId, dto);
      case 'building':
        return this.getBuildingPreview(userId, dto);
      default:
        throw new BadRequestException(`Unknown jobType: ${(dto as any).jobType}`);
    }
  }

  private async getMissionPreview(userId: string, dto: JobPreviewDto): Promise<any> {
    const def = await (this.prisma as any).missionDef.findUnique({ where: { id: dto.defId } });
    if (!def) throw new NotFoundException('Mission not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const entityIds = dto.entityIds ?? [];

    const entities: any[] = [];
    for (const entityId of entityIds) {
      const entity = await (this.prisma as any).entity.findFirst({
        where: { id: entityId, ownerUserId: userId },
        include: { equipment: true },
      });
      if (entity) entities.push(entity);
    }

    const team: TeamEntitySnap[] = [];
    for (const e of entities) {
      const stats = await computeEquippedStats(this.prisma as any, e);
      team.push({
        id: e.id as string,
        entityType: (e.role as string | undefined) ?? undefined,
        traits: (e.traits ?? {}) as Record<string, string>,
        stats,
        speciesId: (e.definitionId as string | undefined) ?? undefined,
        collectionId: (e.nftCollectionDefId as string | undefined) ?? undefined,
        rarity: ((e.traits as any)?.rarity as string | undefined) ?? undefined,
      });
    }

    const reqContext: RequirementContext = this.gameRules.buildRequirementContext(user as any, {
      teamSize: entityIds.length,
      team,
    });

    const requirementStatus = evaluateTopLevelRules(def.requirements, reqContext, this.gameRules);
    const launchRequirementStatus = evaluateTopLevelRules(def.launchRequirements, reqContext, this.gameRules);

    const allRequirements: JobPreviewRequirement[] = [
      ...requirementStatus.map(r => ({ ...r, source: 'requirements' as const })),
      ...launchRequirementStatus.map(r => ({ ...r, source: 'launchRequirements' as const })),
    ];
    const allRequirementsMet = allRequirements.every(r => r.met);

    const { min: teamMin, max: teamMax } = this.extractTeamSizeBounds(
      def.requirements,
      def.launchRequirements,
    );

    const costEntries: Array<{ type: string; id: string; amount: number }> =
      Array.isArray(def.cost) ? def.cost : [];
    const canAfford = await this.checkCanAfford(userId, costEntries);

    const timer = (def.timer as any) ?? {};
    const durationSeconds: number = timer.duration ?? 0;

    let missionPower = 0;
    let synergy: any = null;
    let successChance = 0;
    let injuryChance = 0;
    const difficulty: number = def.difficulty ?? 100;

    if (entities.length > 0) {
      const allEffects = await this.effectService.getActiveEffectsForUser(userId);
      const globalPowerRows = await this.effectService.getGlobalPowerRows(userId, EffectTargetType.PLAYER);
      const playerEffects = [...allEffects, ...globalPowerRows];

      // Per-entity STAT_BOOST: resolveForTarget handles entity active effects,
      // player active effects, equipment passives, AND entity-scoped global
      // powers with per-entity targetContext filtering (archetype/rarity/traits).
      // Other categories (timer speed, etc.) keep player-scoped playerEffects.
      const teamForMP: EntityForMP[] = await Promise.all(entities.map(async (b: any) => {
        const entityTraits = (b.traits as any) || {};
        const entityContext: EffectTargetContext = {
          archetype: b.speciesId ?? b.definitionId ?? undefined,
          rarity: entityTraits.rarity ?? undefined,
          traits: Object.keys(entityTraits).filter((k: string) => k !== 'rarity'),
        };
        const entityStatMod = await this.effectService.resolveForTarget(
          userId, EffectTargetType.ENTITY, b.id, EffectCategory.STAT_BOOST, undefined, entityContext,
        );
        const boostedStats = applyStatModifiers(b.stats as any, entityStatMod);
        return { stats: boostedStats as any, traits: b.traits as any };
      }));

      let rawTeamMP = calculateTeamMP(teamForMP);

      const missionDefData = (def.data as any) ?? {};
      const missionRegionId: string | undefined = missionDefData.regionId ?? undefined;
      const missionType: string | undefined =
        missionDefData.missionType ?? def.missionCategoryDefId ?? undefined;

      const synergyDescriptors = entities.map((e: any) => ({
        entityId: e.id as string,
        entityType: (e.role as string | undefined) ?? undefined,
        traits: (e.traits ?? {}) as Record<string, string>,
        speciesId: e.definitionId as string | undefined,
        collectionId: e.nftCollectionDefId as string | undefined,
        rarity: ((e.traits as any)?.rarity as string | undefined) ?? undefined,
        regionId: missionRegionId,
      }));

      const synergyContext = {
        activityType: 'mission' as const,
        missionType,
        missionTags: Array.isArray(def.tags) ? (def.tags as string[]) : [],
        regionId: missionRegionId,
        teamSize: entityIds.length,
      };

      const synergyResult = await this.synergyResolver.resolveRules(
        synergyContext,
        synergyDescriptors,
        synergyDescriptors,
      );

      synergy = this.buildSynergyPayload(synergyResult.matchedRules, synergyResult.totals);

      const mpPercentBonus =
        synergyResult.totals.statModifiers?.['MISSION_POWER']?.percentAdd ?? 0;
      if (synergyResult.totals.synergyScore !== 0) {
        rawTeamMP += synergyResult.totals.synergyScore;
      }
      if (mpPercentBonus !== 0) {
        rawTeamMP *= 1 + mpPercentBonus / 100;
      }

      const mpMod = this.effectService.resolve(playerEffects, EffectCategory.MISSION_POWER);
      rawTeamMP = applyModifier(rawTeamMP, mpMod);

      const cap = ANTI_WHALE_CAPS.mpEffectivenessCap;
      missionPower = rawTeamMP <= cap ? rawTeamMP : cap + Math.sqrt(rawTeamMP - cap);

      const rawSuccessChance = calculateSuccessChance(
        missionPower,
        difficulty,
        def.minSuccessChance ?? 0,
        def.maxSuccessChance ?? 100,
      );

      const scMod = this.effectService.resolve(playerEffects, EffectCategory.SUCCESS_CHANCE);
      successChance = Math.min(100, Math.max(0, rawSuccessChance * 100 + scMod.flatAdd + scMod.percentAdd));

      const injuryRate = def.injuryRate ?? 0;
      if (injuryRate > 0) {
        injuryChance = calculateInjuryChance(difficulty, missionPower, injuryRate) * 100;
      }
    }

    return {
      jobType: 'mission',
      requirements: allRequirements,
      allRequirementsMet,
      canAfford,
      cost: costEntries,
      durationSeconds,
      mission: {
        teamMin,
        teamMax,
        missionPower: Number(missionPower.toFixed(2)),
        difficulty,
        successChance: Math.round(successChance),
        injuryChance: Math.round(injuryChance),
        synergy,
      },
    };
  }

  private async getCraftingPreview(userId: string, dto: JobPreviewDto): Promise<any> {
    const recipe = await (this.prisma as any).recipeDef.findUnique({ where: { id: dto.defId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const reqContext = this.gameRules.buildRequirementContext(user as any);
    const requirementStatus = evaluateTopLevelRules(recipe.requirements, reqContext, this.gameRules);
    const keeperLevelMet = user.keeperLevel >= recipe.requiredKeeperLevel;
    const baseRequirementsMet = requirementStatus.every(r => r.met) && keeperLevelMet;

    const costEntries: Array<{ type: string; id: string; amount: number }> =
      Array.isArray(recipe.cost) ? recipe.cost : [];
    const canAfford = await this.checkCanAfford(userId, costEntries);

    const timer = (recipe.timer as any) ?? {};
    const baseDurationSeconds: number = timer.duration ?? 0;
    const boostable: boolean = timer.boostable ?? true;

    let effectiveDurationTicks = boostable
      ? durationSecondsToTicks(baseDurationSeconds)
      : baseDurationSeconds;

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
      effectiveDurationTicks = Math.max(1, Math.floor(applyModifier(effectiveDurationTicks, combinedTimer)));
    }

    const recipeTier: number =
      typeof (recipe.data as any)?.tier === 'number' ? (recipe.data as any).tier : 1;

    let workshopTier = 0;
    let slotsTotal = 0;
    let slotsUsed = 0;
    let recipeTierCap = 1;
    let timerMultiplier = 1;
    let recipeTierMet: boolean | null = null;

    if (dto.locationId) {
      const workshop = await (this.prisma as any).locationBuildingInstance.findFirst({
        where: {
          locationId: dto.locationId,
          location: { ownerUserId: userId },
          buildingDef: { category: 'WORKSHOP' },
        },
      });

      if (workshop) {
        workshopTier = Number(workshop.level ?? 0);
        slotsTotal = workshopParallelSlots(workshopTier);
        timerMultiplier = workshopTimerMultiplier(workshopTier);
        recipeTierCap = workshopRecipeTierCap(workshopTier);
        recipeTierMet = recipeTier <= recipeTierCap;

        const activeJobs = await (this.prisma as any).job.findMany({
          where: { userId, type: 'CraftingJob', status: { in: ['active', 'ready_notified'] } },
          select: { data: true },
        });
        slotsUsed = activeJobs.filter(
          (j: any) => (j.data?.locationId ?? null) === dto.locationId,
        ).length;

        if (timerMultiplier !== 1) {
          effectiveDurationTicks = Math.max(1, Math.floor(effectiveDurationTicks * timerMultiplier));
        }
      }
    }

    const allRequirementsMet = baseRequirementsMet && (recipeTierMet !== false);

    const difficulty: number = recipe.difficulty ?? 0;
    const quantity: number = dto.quantity ?? 1;
    const scaledCost = costEntries.map((c) => ({ ...c, amount: c.amount * quantity }));

    let entityCl: number | null = null;
    let passRate: number | null = null;
    let qualityProbs: Array<{ key: string; label: string; probability: number }> | null = null;

    if (dto.entityId) {
      const entity = await (this.prisma as any).entity.findUnique({
        where: { id: dto.entityId },
      });
      if (entity && (entity as any).ownerUserId === userId) {
        const rawCl = calculateCraftingLuck((entity as any).stats as any ?? {});
        const lf = workshopLuckFloor(workshopTier);
        entityCl = Number(Math.max(rawCl, lf).toFixed(2));
        const recipeTiersMap: Record<string, any> = (recipe.tiers as any) ?? {};
        const centerOverrides: Partial<Record<string, number>> = {};
        for (const [key, block] of Object.entries(recipeTiersMap)) {
          if (key !== 'failure' && block && typeof (block as any).clRequirement === 'number') {
            centerOverrides[key] = (block as any).clRequirement;
          }
        }
        qualityProbs = qualityProbabilities(entityCl, centerOverrides);
        passRate = difficulty > 0
          ? Number(Math.min(1, entityCl / (entityCl + difficulty)).toFixed(4))
          : 1;
      }
    }

    return {
      jobType: 'crafting',
      requirements: requirementStatus,
      allRequirementsMet,
      canAfford,
      cost: costEntries,
      durationSeconds: baseDurationSeconds,
      crafting: {
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeTier,
        requiredKeeperLevel: recipe.requiredKeeperLevel,
        keeperLevelMet,
        effectiveDurationTicks,
        rewards: recipe.rewards ?? null,
        workshopTier,
        slotsTotal,
        slotsUsed,
        slotsOpen: Math.max(0, slotsTotal - slotsUsed),
        recipeTierCap,
        timerMultiplier,
        recipeTierMet,
        difficulty,
        entityCl,
        passRate,
        qualityProbabilities: qualityProbs,
        scaledCost,
      },
    };
  }

  private async getBuildingPreview(userId: string, dto: JobPreviewDto): Promise<any> {
    const def = await (this.prisma as any).buildingDef.findUnique({ where: { id: dto.defId } });
    if (!def) throw new NotFoundException('Building definition not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let location: any = null;
    if (dto.locationId) {
      location = await (this.prisma as any).locationInstance.findFirst({
        where: { id: dto.locationId, ownerUserId: userId },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: true,
              rooms: { include: { roomDef: true } },
            },
          },
        },
      });
    }

    const allLocations = await (this.prisma as any).locationInstance.findMany({
      where: { ownerUserId: userId },
      include: {
        definition: true,
        buildings: {
          include: {
            buildingDef: true,
            rooms: { include: { roomDef: true } },
          },
        },
      },
    });

    const allPlayerLocations = allLocations.map((loc: any) => ({
      buildings: (loc.buildings ?? []).map((b: any) => ({
        buildingDefId: b.buildingDefId,
        rooms: (b.rooms ?? []).map((r: any) => ({ roomDefId: r.roomDefId })),
      })),
      regionId: loc.definition?.regionId ?? null,
    }));

    const currentLocationCtx = location
      ? {
          buildings: (location.buildings ?? []).map((b: any) => ({
            buildingDefId: b.buildingDefId,
            rooms: (b.rooms ?? []).map((r: any) => ({ roomDefId: r.roomDefId })),
          })),
          regionId: location.definition?.regionId ?? null,
        }
      : undefined;

    const reqContext = this.gameRules.buildRequirementContext(user as any, {
      allPlayerLocations,
      currentLocation: currentLocationCtx,
    });

    const requirementStatus = evaluateTopLevelRules(def.requirements, reqContext, this.gameRules);
    const allRequirementsMet = requirementStatus.every(r => r.met);

    const defRules = (def.rules as LevelRules) ?? {};
    const maxLevel: number = defRules.maxLevel ?? 10;
    const buildLevel = 1;
    const buildConfig = resolveLevelConfig(defRules, buildLevel);
    const costs = resolveConstructionCosts(buildConfig.constructionCost, buildLevel);

    const timerCfg = (buildConfig.timer as any) ?? {};
    const baseDurationSeconds: number = calcGrowth(
      timerCfg.duration ?? 0,
      timerCfg.growthRate,
      timerCfg.growthScalar,
      buildLevel,
    );
    let effectiveDurationTicks = baseDurationSeconds;

    const [buildTimerMod, legacyBuildTimerMod] = await Promise.all([
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.BUILDING_BUILD_TIMER_SPEED),
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED),
    ]);
    const combinedBuildTimer = {
      ...emptyResolvedModifier(),
      flatAdd: buildTimerMod.flatAdd + legacyBuildTimerMod.flatAdd,
      percentAdd: buildTimerMod.percentAdd + legacyBuildTimerMod.percentAdd,
      multiplier: buildTimerMod.multiplier * legacyBuildTimerMod.multiplier,
    };
    if (combinedBuildTimer.flatAdd !== 0 || combinedBuildTimer.percentAdd !== 0 || combinedBuildTimer.multiplier !== 1) {
      effectiveDurationTicks = Math.max(0, Math.floor(applyModifier(effectiveDurationTicks, combinedBuildTimer)));
    }

    const canAfford = await this.checkCanAfford(userId, costs as any);

    let upgrade: {
      toLevel: number;
      cost: any[];
      durationSeconds: number;
      effectiveDurationTicks: number;
      canAfford: boolean;
    } | null = null;

    if (dto.locationId) {
      const existingBuilding = await (this.prisma as any).locationBuildingInstance.findFirst({
        where: {
          locationId: dto.locationId,
          buildingDefId: dto.defId,
          location: { ownerUserId: userId },
        },
      });

      const buildingState = (existingBuilding?.state as any) ?? {};
      if (existingBuilding && buildingState.status === 'active' && existingBuilding.level < maxLevel) {
        const nextLevel: number = existingBuilding.level + 1;
        const nextConfig = resolveLevelConfig(defRules, nextLevel);
        const upgradeCosts = resolveConstructionCosts(nextConfig.constructionCost, nextLevel);

        const nextTimerCfg = (nextConfig.timer as any) ?? {};
        const upgradeBaseDuration: number = calcGrowth(
          nextTimerCfg.duration ?? 0,
          nextTimerCfg.growthRate,
          nextTimerCfg.growthScalar,
          nextLevel,
        );
        let upgradeEffectiveTicks = upgradeBaseDuration;

        const [upgradeTimerMod, legacyUpgradeTimerMod] = await Promise.all([
          this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.BUILDING_UPGRADE_TIMER_SPEED),
          this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED),
        ]);
        const combinedUpgradeTimer = {
          ...emptyResolvedModifier(),
          flatAdd: upgradeTimerMod.flatAdd + legacyUpgradeTimerMod.flatAdd,
          percentAdd: upgradeTimerMod.percentAdd + legacyUpgradeTimerMod.percentAdd,
          multiplier: upgradeTimerMod.multiplier * legacyUpgradeTimerMod.multiplier,
        };
        if (combinedUpgradeTimer.flatAdd !== 0 || combinedUpgradeTimer.percentAdd !== 0 || combinedUpgradeTimer.multiplier !== 1) {
          upgradeEffectiveTicks = Math.max(0, Math.floor(applyModifier(upgradeEffectiveTicks, combinedUpgradeTimer)));
        }

        upgrade = {
          toLevel: nextLevel,
          cost: upgradeCosts as any[],
          durationSeconds: upgradeBaseDuration,
          effectiveDurationTicks: upgradeEffectiveTicks,
          canAfford: await this.checkCanAfford(userId, upgradeCosts as any),
        };
      }
    }

    return {
      jobType: 'building',
      requirements: requirementStatus,
      allRequirementsMet,
      canAfford,
      cost: costs,
      durationSeconds: baseDurationSeconds,
      building: {
        buildingDefId: def.id,
        name: def.name,
        description: def.description,
        category: def.category ?? null,
        buildLevel,
        maxLevel,
        effectiveDurationTicks,
        upgrade,
      },
    };
  }

  private extractTeamSizeBounds(
    requirements: any,
    launchRequirements?: any,
  ): { min: number; max: number } {
    let min = 0;
    let max = 9;

    const walkRules = (rules: any[]) => {
      if (!Array.isArray(rules)) return;
      for (const rule of rules) {
        if (rule.scope === 'context' && rule.field === 'teamSize') {
          if (rule.operator === 'gte' && typeof rule.value === 'number') {
            min = Math.max(min, rule.value);
          }
          if (rule.operator === 'lte' && typeof rule.value === 'number') {
            max = Math.min(max, rule.value);
          }
          if (rule.operator === 'eq' && typeof rule.value === 'number') {
            min = rule.value;
            max = rule.value;
          }
        }
        if (Array.isArray(rule.rules)) walkRules(rule.rules);
      }
    };

    if (requirements?.rules) walkRules(requirements.rules);
    if (launchRequirements?.rules) walkRules(launchRequirements.rules);

    return { min, max };
  }

  private async checkCanAfford(
    userId: string,
    costs: { type: string; id: string; amount: number }[],
  ): Promise<boolean> {
    for (const cost of costs) {
      if (cost.amount <= 0) continue;
      if (cost.type === 'currency') {
        const balance = await this.currencyService.getBalance(userId, cost.id);
        if (balance < cost.amount) return false;
      } else {
        const items = await this.prisma.itemInstance.findMany({
          where: { userId, definitionId: cost.id },
        });
        const total = items.reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
        if (total < cost.amount) return false;
      }
    }
    return true;
  }

  private buildSynergyPayload(matchedRules: any[], totals: any) {
    const missionDurationMod = totals.durationModifiers?.['mission'];
    return {
      matchedRules: matchedRules.map((r) => {
        const apps = r.applications;
        const scoreContrib = r.effects
          .filter((e: any) => e.type === 'synergy_score_modifier' && e.operation === 'flat_add')
          .reduce((sum: number, e: any) => sum + (e.value ?? 0), 0) * apps;
        const mpBonusContrib = r.effects
          .filter(
            (e: any) =>
              e.type === 'stat_modifier' &&
              e.stat === 'MISSION_POWER' &&
              e.operation === 'percent_add',
          )
          .reduce((sum: number, e: any) => sum + (e.value ?? 0), 0) * apps;
        const durationBonusContrib = r.effects
          .filter((e: any) => e.type === 'duration_modifier' && e.operation === 'percent_add')
          .reduce((sum: number, e: any) => sum + (e.value ?? 0), 0) * apps;
        const isPenalty =
          scoreContrib < 0 || mpBonusContrib < 0 || durationBonusContrib > 0;
        return {
          ruleId: r.ruleId,
          name: r.name,
          applications: apps,
          scoreContrib,
          mpBonusContrib,
          durationBonusContrib,
          isPenalty,
        };
      }),
      synergyScore: totals.synergyScore,
      missionPowerBonus: totals.statModifiers?.['MISSION_POWER']?.percentAdd ?? 0,
      durationBonus: missionDurationMod?.percentAdd ?? 0,
    };
  }
}
