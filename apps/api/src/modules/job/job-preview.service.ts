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
  EffectTargetType,
  applyModifier,
  applyStatModifiers,
} from '@derp/shared';
import {
  calculateTeamMP,
  calculateSuccessChance,
  calculateInjuryChance,
} from '@derp/math';
import type { EntityForMP } from '@derp/math';

export interface JobPreviewDto {
  jobType: 'mission' | 'crafting' | 'building';
  defId: string;
  entityIds?: string[];
  locationId?: string;
}

export interface JobPreviewRequirement {
  label?: string;
  met: boolean;
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
      case 'building':
        throw new BadRequestException(`Job type '${dto.jobType}' preview is not yet supported`);
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
      const globalPowerRows = await this.effectService.getGlobalPowerRows();
      const playerEffects = [...allEffects, ...globalPowerRows];

      const equipmentEffectsByEntity = new Map<string, any[]>();
      for (const ent of entities) {
        const passive = await this.effectService.getPassiveEffectsFromEquipment(
          userId,
          EffectTargetType.ENTITY,
          ent.id,
        );
        equipmentEffectsByEntity.set(ent.id, passive);
      }

      const teamForMP: EntityForMP[] = entities.map((b: any) => {
        const passive = equipmentEffectsByEntity.get(b.id) ?? [];
        const entityStatMod = this.effectService.resolve(
          [...playerEffects, ...passive] as any,
          EffectCategory.STAT_BOOST,
        );
        const boostedStats = applyStatModifiers(b.stats as any, entityStatMod);
        return { stats: boostedStats as any, traits: b.traits as any };
      });

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

      successChance = calculateSuccessChance(
        missionPower,
        difficulty,
        def.minSuccessChance ?? 0,
        def.maxSuccessChance ?? 100,
      );

      const scMod = this.effectService.resolve(playerEffects, EffectCategory.SUCCESS_CHANCE);
      successChance = Math.min(100, Math.max(0, successChance + scMod.flatAdd + scMod.percentAdd));

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
