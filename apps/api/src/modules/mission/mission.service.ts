import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mergeDisplayStyles, type DisplayStyle } from '@derp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityService } from '../entity/entity.service';
import { CurrencyService } from '../currency/currency.service';
import { PlayerService } from '../player/player.service';
import { TickService } from '../tick/tick.service';
import { InventoryService } from '../inventory/inventory.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { NotificationService } from '../notification/notification.service';
import { EventService } from '../event/event.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ANTI_WHALE_CAPS, XP_PER_LEVEL, MAX_ENTITY_LEVEL, EffectCategory, EffectTargetType, applyModifier, applyStatModifiers, emptyResolvedModifier } from '@derp/shared';
import { calculateTeamMP, calculateSuccessChance, calculateInjuryChance, calculateInjuryRecoveryTicks, SeededRng, durationSecondsToTicks } from '@derp/math';
import type { EntityForMP } from '@derp/math';
import { EffectService } from '../effect/effect.service';
import { SynergyResolverService } from '../synergy/synergy-resolver.service';

@Injectable()
export class MissionService {
  private readonly logger = new Logger(MissionService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private currencyService: CurrencyService,
    private playerService: PlayerService,
    private tickService: TickService,
    private inventoryService: InventoryService,
    private gameRules: GameRulesService,
    private notificationService: NotificationService,
    private eventService: EventService,
    private telemetryService: TelemetryService,
    private effectService: EffectService,
    private synergyResolver: SynergyResolverService,
  ) {}

  private async isCategoryChainEnabled(categoryId: string, db?: any): Promise<boolean> {
    const client = db || this.prisma;
    const visited = new Set<string>();
    let currentId: string | null = categoryId;
    while (currentId) {
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const cat: { enabled: boolean; parentId: string | null } | null =
        await (client as any).missionCategoryDef.findUnique({
          where: { id: currentId },
          select: { enabled: true, parentId: true },
        });
      if (!cat) return false;
      if (cat.enabled === false) return false;
      currentId = cat.parentId;
    }
    return true;
  }

  private mapJobToMissionResponse(job: any) {
    return {
      id: job.id,
      userId: job.userId,
      defId: job.defId,
      startTick: job.timer.startTick,
      durationTicks: job.timer.durationTicks,
      team: job.team,
      status: job.status,
      result: job.results,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getMissionCategoryDefs(userId?: string) {
    const categories = await (this.prisma as any).missionCategoryDef.findMany({
      include: { displayDef: true },
      orderBy: { sortOrder: 'asc' },
    });

    let filtered = categories;
    let reqContext: any = null;
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        filtered = categories.filter((c: any) =>
          this.gameRules.checkVisibility(c.visibilityRequirements, user as any)
        );
        reqContext = this.gameRules.buildRequirementContext(user as any);
      }
    }

    return filtered.map((c: any) => {
      const reqs: any[] = Array.isArray(c.requirements) ? c.requirements : [];
      const requirementStatus = reqContext
        ? reqs
            .filter((r: any) => r.type !== 'team_size')
            .map((r: any) => ({
              ...r,
              met: this.gameRules.checkRequirement(r, reqContext),
            }))
        : [];

      return {
        id: c.id,
        name: c.name,
        parentId: c.parentId ?? null,
        tags: c.tags,
        requirements: c.requirements ?? [],
        visibilityRequirements: c.visibilityRequirements ?? [],
        enabled: c.enabled ?? true,
        sortOrder: c.sortOrder,
        inlineOnly: c.inlineOnly ?? false,
        data: c.data,
        displayDef: c.displayDef ? {
          id: c.displayDef.id,
          borderColor: c.displayDef.borderColor,
          backgroundImage: c.displayDef.backgroundImage,
          cardBackground: c.displayDef.cardBackground,
          style: c.displayDef.style ?? {},
          data: c.displayDef.data,
        } : null,
        requirementStatus,
      };
    });
  }

  async getMissionDefinitions(userId?: string) {
    const allDefs = await (this.prisma as any).missionDef.findMany({
      include: { displayDef: true, missionCategoryDef: { include: { displayDef: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    if (!userId) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return allDefs.map((d: any) => this.mapDefToLegacy(d));

    const reqContext = this.gameRules.buildRequirementContext(user as any);

    return allDefs
      .filter((d: any) => this.gameRules.checkVisibility(d.visibilityRequirements, user as any))
      .map((d: any) => this.mapDefToLegacy(d, reqContext));
  }

  private mapDefToLegacy(def: any, reqContext?: any) {
    const catDisplay = def.missionCategoryDef?.displayDef;
    const missionDisplay = def.displayDef;

    const resolvedDisplay = {
      borderColor: missionDisplay?.borderColor ?? catDisplay?.borderColor ?? null,
      backgroundImage: missionDisplay?.backgroundImage ?? catDisplay?.backgroundImage ?? null,
      cardBackground: missionDisplay?.cardBackground ?? catDisplay?.cardBackground ?? null,
      style: mergeDisplayStyles(
        catDisplay?.style as DisplayStyle | undefined,
        missionDisplay?.style as DisplayStyle | undefined,
      ),
    };

    const reqs: any[] = Array.isArray(def.requirements) ? def.requirements : [];
    const requirementStatus = reqContext
      ? reqs
          .filter((r: any) => r.type !== 'team_size')
          .map((r: any) => ({
            ...r,
            met: this.gameRules.checkRequirement(r, reqContext),
          }))
      : [];

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      difficulty: def.difficulty,
      timer: def.timer,
      success: def.success,
      failure: def.failure,
      requirements: def.requirements,
      visibilityRequirements: def.visibilityRequirements,
      tags: def.tags ?? [],
      rewardPreview: def.rewardPreview ?? [],
      cost: def.cost ?? [],
      enabled: def.enabled ?? true,
      sortOrder: def.sortOrder ?? 0,
      inline: def.inline ?? false,
      inlineLabel: def.inlineLabel ?? null,
      missionCategoryDefId: def.missionCategoryDefId,
      display: resolvedDisplay,
      requirementStatus,
    };
  }

  private getReqValues(reqs: any[], type: string): any[] {
    if (!reqs || !Array.isArray(reqs)) return [];
    return reqs.filter((r: any) => r.type === type);
  }

  async getActiveMissions(userId: string) {
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId, type: 'MissionJob', status: { in: ['active', 'ready_notified'] } },
      orderBy: { createdAt: 'asc' },
    });

    const tickInfo = await this.tickService.getTickInfo();
    const serverTime = new Date().toISOString();

    return jobs.map((job: any) => ({
      ...this.mapJobToMissionResponse(job),
      serverTime,
      tickInfo: {
        currentTick: tickInfo.currentTick,
        currentRate: tickInfo.currentRate,
      },
    }));
  }

  async getMissionHistory(userId: string) {
    const jobs = await (this.prisma as any).job.findMany({
      where: { userId, type: 'MissionJob', status: { in: ['completed', 'failed'] } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return jobs.map((job: any) => this.mapJobToMissionResponse(job));
  }

  async startMission(userId: string, missionDefId: string, entityIds: string[], externalTx?: any): Promise<any> {
    // Atomicity: cost-spend, entity status flip and Job row creation must
    // commit together. When called from /v1/commands the outer pipeline
    // already gives us a tx; when called from REST POST /missions/start we
    // open our own here so a crash mid-flow can't burn currency without
    // creating the mission row.
    if (!externalTx) {
      return this.prisma.$transaction(
        (tx) => this.startMission(userId, missionDefId, entityIds, tx),
        { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
      );
    }
    const db = externalTx;
    const dbDef = await (db as any).missionDef.findUnique({ where: { id: missionDefId } });
    if (!dbDef) throw new NotFoundException('Mission not found');

    if (dbDef.enabled === false) {
      throw new BadRequestException('This mission is currently unavailable');
    }

    if (dbDef.missionCategoryDefId) {
      const categoryEnabled = await this.isCategoryChainEnabled(dbDef.missionCategoryDefId, db);
      if (!categoryEnabled) {
        throw new BadRequestException('This mission\'s category is currently unavailable');
      }
    }

    const reqs: any[] = Array.isArray(dbDef.requirements) ? dbDef.requirements : [];

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');

    if (!this.gameRules.checkVisibility(dbDef.visibilityRequirements, user)) {
      throw new BadRequestException('Mission is not available');
    }

    const reqContext = this.gameRules.buildRequirementContext(user);

    for (const req of reqs) {
      if (req.type === 'team_size') {
        const op = req.operator ?? 'gte';
        if (!this.gameRules.compareValues(entityIds.length, Number(req.value ?? 0), op)) {
          throw new BadRequestException(`Team size does not meet requirement: ${op} ${req.value}`);
        }
      } else if (req.type === 'trait') {
        continue;
      } else if (!this.gameRules.checkRequirement(req, reqContext)) {
        throw new BadRequestException(`Requirement not met: ${req.type}${req.key ? ` (${req.key})` : ''}`);
      }
    }

    const activeMissions = await (db as any).job.count({
      where: { userId, type: 'MissionJob', status: { in: ['active', 'ready_notified'] } },
    });
    const maxMissions = ANTI_WHALE_CAPS.maxActiveMissions(user.keeperLevel);
    if (activeMissions >= maxMissions) {
      throw new BadRequestException(
        `Maximum ${maxMissions} active missions allowed at Keeper Level ${user.keeperLevel}`,
      );
    }

    const entities = [];
    for (const entityId of entityIds) {
      const entity = await (db as any).entity.findFirst({ where: { id: entityId, ownerUserId: userId }, include: { equipment: true } });
      if (!entity) throw new NotFoundException(`Entity ${entityId} not found`);
      const entityStatus = (entity as any).state?.status || 'idle';
      if (entityStatus !== 'idle') {
        throw new BadRequestException(`"${entity.name}" is currently ${entityStatus}`);
      }
      entities.push(entity);
    }

    const traitReqs = reqs.filter((r: any) => r.type === 'trait');
    for (const req of traitReqs) {
      const traitKey = req.key;
      const op = req.operator ?? 'gte';
      const traitCount = this.gameRules.countTeamTraits(entities, traitKey);
      if (!this.gameRules.compareValues(traitCount, Number(req.value ?? 0), op)) {
        throw new BadRequestException(`Team trait requirement not met: ${traitKey} ${op} ${req.value} (team has ${traitCount})`);
      }
    }

    const costEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(dbDef.cost) ? dbDef.cost : [];
    for (const cost of costEntries) {
      if (cost.amount <= 0) continue;
      if (cost.type === 'currency') {
        await this.currencyService.spendTx(db as any, { userId, currencyId: cost.id, amount: cost.amount, reason: `Mission: ${dbDef.name}`, sourceType: 'mission', sourceId: dbDef.id });
      } else {
        await this.inventoryService.removeItemTx(db as any, { userId, itemId: cost.id, quantity: cost.amount, reason: `Mission: ${dbDef.name}`, sourceType: 'mission', sourceId: dbDef.id });
      }
    }

    for (const entity of entities) {
      const st = (entity.state as any) || {};
      await (db as any).entity.update({ where: { id: entity.id }, data: { state: { ...st, status: 'mission' } } });
    }

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const timer = dbDef.timer as any;
    const durationSeconds = timer?.duration ?? 0;
    const boostable = timer?.boostable ?? true;
    let durationTicks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;

    const [timerMod, legacyTimerMod] = await Promise.all([
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.MISSION_TIMER_SPEED, db),
      this.effectService.resolveForTarget(userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED, db),
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

    // Call the synergy resolver at start time so the result can be persisted
    // in Job.data.synergy. completeMission reads the snapshot instead of
    // re-querying rules, ensuring rewards use the state captured here.
    const missionDefData = (dbDef.data as any) ?? {};
    const missionRegionId: string | undefined = missionDefData.regionId ?? undefined;
    const missionType: string | undefined =
      missionDefData.missionType ?? dbDef.missionCategoryDefId ?? undefined;
    const synergyDescriptorsForStart = entities.map((e: any) => ({
      entityId: e.id as string,
      entityType: (e.role as string | undefined) ?? undefined,
      traits: (e.traits ?? {}) as Record<string, string>,
      speciesId: e.definitionId as string | undefined,
      collectionId: e.nftCollectionDefId as string | undefined,
      rarity: ((e.traits as any)?.rarity as string | undefined) ?? undefined,
      regionId: missionRegionId,
    }));
    const synergyContextForStart = {
      activityType: 'mission' as const,
      missionType,
      missionTags: Array.isArray(dbDef.tags) ? (dbDef.tags as string[]) : [],
      regionId: missionRegionId,
      teamSize: entityIds.length,
    };
    const startSynergyResult = await this.synergyResolver.resolveRules(
      synergyContextForStart,
      synergyDescriptorsForStart,
      synergyDescriptorsForStart,
    );
    const synergySnapshot = {
      ruleIds: startSynergyResult.matchedRules.map(r => r.ruleId),
      totals: startSynergyResult.totals,
    };

    // Apply synergy duration modifier (shortens/lengthens the mission timer).
    const missionDurationMod = startSynergyResult.totals.durationModifiers['mission'];
    if (missionDurationMod) {
      if (missionDurationMod.percentAdd !== 0) {
        durationTicks = Math.max(1, Math.floor(durationTicks * (1 + missionDurationMod.percentAdd / 100)));
      }
      if (missionDurationMod.flatSeconds !== 0) {
        durationTicks = Math.max(1, durationTicks + Math.round(missionDurationMod.flatSeconds));
      }
    }

    const seed = randomUUID();

    const job = await (db as any).job.create({
      data: {
        userId,
        type: 'MissionJob',
        defId: dbDef.id,
        status: 'active',
        timer: { startTick: currentTick, durationTicks },
        team: entityIds,
        data: { difficulty: dbDef.difficulty, seed, synergy: synergySnapshot },
        readyAtTick: Math.floor(currentTick) + durationTicks,
      },
    });

    await (db as any).activeEffect.updateMany({
      where: {
        userId,
        sessionType: 'mission',
        sessionId: null,
      },
      data: { sessionId: job.id },
    });

    const response = this.mapJobToMissionResponse(job);
    // Include synergy preview so the client can display which rules fired.
    return {
      ...response,
      synergyPreview: {
        matchedRules: startSynergyResult.matchedRules.map(r => {
          const apps = r.applications;
          const scoreContrib = r.effects
            .filter(e => e.type === 'synergy_score_modifier' && e.operation === 'flat_add')
            .reduce((sum, e) => sum + (e.value ?? 0), 0) * apps;
          const mpBonusContrib = r.effects
            .filter(e => e.type === 'stat_modifier' && e.stat === 'MISSION_POWER' && e.operation === 'percent_add')
            .reduce((sum, e) => sum + (e.value ?? 0), 0) * apps;
          const durationBonusContrib = r.effects
            .filter(e => e.type === 'duration_modifier' && e.operation === 'percent_add')
            .reduce((sum, e) => sum + (e.value ?? 0), 0) * apps;
          const isPenalty = scoreContrib < 0 || mpBonusContrib < 0 || durationBonusContrib > 0;
          return { ruleId: r.ruleId, name: r.name, applications: apps, scoreContrib, mpBonusContrib, durationBonusContrib, isPenalty };
        }),
        synergyScore: startSynergyResult.totals.synergyScore,
        missionPowerBonus: startSynergyResult.totals.statModifiers['MISSION_POWER']?.percentAdd ?? 0,
        durationBonus: missionDurationMod?.percentAdd ?? 0,
      },
    };
  }

  async completeMission(userId: string, missionId: string, externalTx?: any): Promise<any> {
    // Atomicity: keeper-XP, currency credits, item grants, entity XP/level
    // updates, status-flip back to idle, ActiveEffect cleanup and the Job
    // row update must all commit together. When invoked from /v1/commands
    // the outer pipeline supplies the tx; when invoked from REST
    // POST /missions/:id/complete (or admin tools) we open our own so a
    // mid-loop crash can't half-pay rewards.
    if (!externalTx) {
      return this.prisma.$transaction(
        (tx) => this.completeMission(userId, missionId, tx),
        { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
      );
    }
    const db = externalTx;
    this.logger.log(`completeMission called: userId=${userId.slice(0,8)}, missionId=${missionId.slice(0,8)}`);
    const mission = await (db as any).job.findFirst({
      where: { id: missionId, userId, type: 'MissionJob', status: { in: ['active', 'ready_notified'] } },
    });
    if (!mission) {
      this.logger.warn(`completeMission: no active mission found for id=${missionId.slice(0,8)}, userId=${userId.slice(0,8)}`);
      throw new NotFoundException('Active mission not found');
    }

    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    const startTick = mission.timer.startTick;
    const durationTicks = mission.timer.durationTicks;
    const targetTick = startTick + durationTicks;
    this.logger.log(`completeMission: startTick=${startTick}, durationTicks=${durationTicks}, currentTick=${currentTick}, targetTick=${targetTick}`);

    if (currentTick < targetTick) {
      this.logger.warn(`completeMission: mission not yet complete. Need tick ${targetTick}, have ${currentTick}`);
      throw new BadRequestException('Mission is not yet complete');
    }

    const missionDefId = mission.defId;
    const def = await (db as any).missionDef.findUnique({ where: { id: missionDefId } });
    if (!def) {
      this.logger.warn(`completeMission: definition not found for defId=${missionDefId}, failing job gracefully`);
      const entityIds = (mission.team as string[]) || [];
      for (const entityId of entityIds) {
        try {
          const ent = await (db as any).entity.findUnique({ where: { id: entityId } });
          if (ent) {
            const st = (ent.state as any) || {};
            await (db as any).entity.update({ where: { id: entityId }, data: { state: { ...st, status: 'idle' } } });
          }
        } catch (err) {
          this.logger.warn(`Failed to free entity ${entityId}: ${err}`);
        }
      }
      const errorMsg = `ERROR: Job with id MissionJob - ${missionId} could not be found.`;
      const updated = await (db as any).job.update({
        where: { id: missionId },
        data: { status: 'failed', results: { success: false, error: errorMsg, rewards: [] } },
      });
      return {
        ...this.mapJobToMissionResponse(updated),
        missionResult: { success: false, missionName: missionDefId, defId: missionDefId, entityIds, rewards: [], error: errorMsg },
      };
    }

    if (def.enabled === false) {
      throw new BadRequestException('This mission is currently unavailable');
    }

    if (def.missionCategoryDefId) {
      const categoryEnabled = await this.isCategoryChainEnabled(def.missionCategoryDefId, db);
      if (!categoryEnabled) {
        throw new BadRequestException('This mission\'s category is currently unavailable');
      }
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');
    const reqContext = this.gameRules.buildRequirementContext(user);

    const entityIds = mission.team as string[];
    const entities = await (db as any).entity.findMany({
      where: { id: { in: entityIds } },
    });

    const allEffects = await this.effectService.getActiveEffectsForUser(userId, db);
    const globalPowerRows = await this.effectService.getGlobalPowerRows();
    const playerEffects = [
      ...allEffects.filter((e: any) =>
        !e.sessionType || (e.sessionType === 'mission' && e.sessionId === missionId)
      ),
      ...globalPowerRows,
    ];

    // Per-entity STAT_BOOST resolution: combine player-scoped boosts (mission
    // potions, global buffs) with each entity's own equipped-gear passives so
    // gear actually contributes to mission MP. Other categories below stay
    // player-scoped because gear today only emits STAT_BOOST/FLAT_ADD.
    const equipmentEffectsByEntity = new Map<string, any[]>();
    for (const ent of entities) {
      const passive = await this.effectService.getPassiveEffectsFromEquipment(
        userId,
        EffectTargetType.ENTITY,
        ent.id,
        db,
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
      return { stats: boostedStats, traits: b.traits as any };
    });

    let rawTeamMP = calculateTeamMP(teamForMP);

    // Read the synergy snapshot persisted by startMission instead of
    // re-querying rules. This guarantees reward outcomes use the rule state
    // that was captured when the mission launched.
    const persistedSynergy = (mission.data as any)?.synergy as
      | { ruleIds: string[]; totals: import('./../../modules/synergy/synergy.types').SynergyTotals }
      | undefined;
    if (persistedSynergy) {
      const syn = persistedSynergy.totals;
      // Flat synergy-score add (synergy_score_modifier effects).
      if (syn.synergyScore !== 0) {
        rawTeamMP += syn.synergyScore;
      }
      // Percent add from MISSION_POWER stat_modifier effects.
      const mpPercentBonus = syn.statModifiers?.['MISSION_POWER']?.percentAdd ?? 0;
      if (mpPercentBonus !== 0) {
        rawTeamMP *= 1 + mpPercentBonus / 100;
      }
      this.logger.debug(
        `Mission ${missionId}: synergy snapshot applied (score=${syn.synergyScore}, mpPct=${mpPercentBonus}) from ${persistedSynergy.ruleIds.length} rule(s)`,
      );
    }

    const mpMod = this.effectService.resolve(playerEffects, EffectCategory.MISSION_POWER);
    rawTeamMP = applyModifier(rawTeamMP, mpMod);

    const cap = ANTI_WHALE_CAPS.mpEffectivenessCap;
    const teamMP = rawTeamMP <= cap ? rawTeamMP : cap + Math.sqrt(rawTeamMP - cap);
    const difficulty = mission.data.difficulty;
    let successChance = calculateSuccessChance(
      teamMP,
      difficulty,
      def.minSuccessChance ?? 0,
      def.maxSuccessChance ?? 100,
    );

    const scMod = this.effectService.resolve(playerEffects, EffectCategory.SUCCESS_CHANCE);
    successChance = Math.min(100, Math.max(0, successChance + scMod.flatAdd + scMod.percentAdd));

    const missionSeed = mission.data.seed;
    const rng = new SeededRng(missionSeed);
    const success = rng.chance(successChance);

    const outcome = success ? (def.success as any) : (def.failure as any);
    const outcomeItems: any[] = Array.isArray(outcome?.rewards) ? outcome.rewards : [];

    const grantedRewards: { type: string; key?: string; amount?: number; name?: string; defId?: string }[] = [];
    const entityResultsMap = new Map<string, { id: string; name: string; oldLevel: number; newLevel: number; xpGained: number; leveledUp: boolean; injured: boolean }>();

    const { resolved, texts: rolledTexts, flags: resolvedFlags } = await this.gameRules.resolveOutcomesAsync(outcomeItems, reqContext, rng);

    const rewardMod = this.effectService.resolve(playerEffects, EffectCategory.REWARD_MULTIPLIER);
    const xpMod = this.effectService.resolve(playerEffects, EffectCategory.XP_MULTIPLIER);
    const keeperXpMod = this.effectService.resolve(playerEffects, EffectCategory.KEEPER_XP_MULTIPLIER);
    const currencyMod = this.effectService.resolve(playerEffects, EffectCategory.CURRENCY_MULTIPLIER);

    for (const { entry, amount: rawAmount } of resolved) {
      let amount = rawAmount;
      if (amount && amount > 0) {
        if (entry.type === 'entity_xp') {
          amount = Math.floor(applyModifier(amount, xpMod));
        } else if (entry.type === 'keeper_xp') {
          amount = Math.floor(applyModifier(amount, keeperXpMod));
        } else if (entry.type === 'currency') {
          amount = Math.floor(applyModifier(amount, currencyMod));
        } else if (entry.type === 'item') {
          amount = Math.max(1, Math.floor(applyModifier(amount, rewardMod)));
        }
      }
      if (entry.type === 'emitEvent') {
        try {
          const idempotencyKey = entry.idempotencyKey
            ? entry.idempotencyKey.replace('${jobId}', missionId)
            : undefined;
          await this.eventService.dispatch(entry.defId, entry.payload || {}, {
            userId,
            sourceType: 'MissionJob',
            sourceId: missionId,
            idempotencyKey,
          });
          grantedRewards.push({ type: 'emitEvent', defId: entry.defId });
        } catch (err) {
          this.logger.warn(`emitEvent "${entry.defId}" failed during mission ${missionId.slice(0,8)}: ${err}`);
        }
        continue;
      }
      if (!amount || amount <= 0) continue;
      switch (entry.type) {
        case 'entity_xp': {
          if (entities.length === 0) break;
          const perEntity = Math.max(1, Math.floor(amount / entities.length));
          for (const entity of entities) {
            // Canonical XP grant: applies weighted stat gains, appends a
            // levelHistory entry per level transition, and (on level-up)
            // emits a grouped `entity_level_up` notification. We pass
            // `skipEffects: true` because the mission settlement has
            // already applied the xp_multiplier above, so the canonical
            // method must not re-apply it.
            let result;
            try {
              result = await this.entityService.addEntityXp(
                entity.id, userId, perEntity, db, { skipEffects: true },
              );
            } catch (err) {
              this.logger.warn(`Failed to grant entity_xp to ${entity.id}: ${err}`);
              continue;
            }
            const existing = entityResultsMap.get(entity.id);
            if (existing) {
              existing.xpGained += result.xpGained;
              existing.newLevel = result.newLevel;
              existing.leveledUp = result.newLevel > existing.oldLevel;
            } else {
              entityResultsMap.set(entity.id, {
                id: entity.id,
                name: result.entity.name || 'Entity',
                oldLevel: result.oldLevel,
                newLevel: result.newLevel,
                xpGained: result.xpGained,
                leveledUp: result.leveledUp,
                injured: false,
              });
            }
          }
          grantedRewards.push({ type: 'entity_xp', amount: perEntity });
          break;
        }
        case 'keeper_xp': {
          const kUser = await db.user.findUnique({ where: { id: userId } });
          if (kUser) {
            let newXp = Number(kUser.keeperXp) + amount;
            let newLevel = kUser.keeperLevel;
            while (newLevel < 100 && newXp >= XP_PER_LEVEL(newLevel)) {
              newXp -= XP_PER_LEVEL(newLevel);
              newLevel++;
            }
            await db.user.update({ where: { id: userId }, data: { keeperXp: BigInt(newXp), keeperLevel: newLevel } });
          }
          grantedRewards.push({ type: 'keeper_xp', amount });
          break;
        }
        case 'currency': {
          // We always run inside a tx (see top of completeMission), so the
          // Tx variants are the only correct choice — they participate in
          // the same transaction as the keeper-XP/item/entity writes.
          await this.currencyService.creditTx(db, {
            userId, currencyId: entry.key, amount,
            reason: `Mission: ${def.name}`, sourceType: 'mission', sourceId: missionId,
          });
          const name = await this.gameRules.resolveName('currency', entry.key);
          grantedRewards.push({ type: 'currency', key: entry.key, amount, name });
          break;
        }
        case 'item': {
          await this.inventoryService.addItemTx(db, {
            userId, itemId: entry.key, quantity: amount,
            reason: `Mission: ${def.name}`, sourceType: 'mission', sourceId: missionId,
          });
          const name = await this.gameRules.resolveName('item', entry.key);
          grantedRewards.push({ type: 'item', key: entry.key, amount, name });
          break;
        }
      }
    }

    if (resolvedFlags.length > 0) {
      await (db as any).user.update({ where: { id: userId }, data: { flags: reqContext.userFlags as any } });
    }

    const injuredEntityUntilTick = new Map<string, number>();
    if (!success) {
      const injuryRate = (def.injuryRate as number | null) ?? 0;
      const injuryRecoveryTicksBase = (def.injuryRecoveryTicks as number | null) ?? 0;
      if (injuryRate > 0 && injuryRecoveryTicksBase > 0) {
        const injuryChance = calculateInjuryChance(difficulty, teamMP, injuryRate);
        if (injuryChance > 0) {
          for (const entity of entities) {
            if (rng.chance(injuryChance)) {
              const vit = (entity.stats as any)?.VIT ?? 0;
              let recoveryTicks = calculateInjuryRecoveryTicks(injuryRecoveryTicksBase, vit);
              const injuryMod = await this.effectService.resolveForTarget(
                userId, EffectTargetType.PLAYER, userId, EffectCategory.INJURY_RECOVERY_SPEED, db,
              );
              if (injuryMod.flatAdd !== 0 || injuryMod.percentAdd !== 0 || injuryMod.multiplier !== 1) {
                recoveryTicks = Math.max(1, Math.floor(applyModifier(recoveryTicks, injuryMod)));
              }
              const untilTick = currentTick + recoveryTicks;
              injuredEntityUntilTick.set(entity.id, untilTick);
              const existing = entityResultsMap.get(entity.id);
              if (existing) {
                existing.injured = true;
              } else {
                entityResultsMap.set(entity.id, {
                  id: entity.id,
                  name: (entity as any).name || 'Entity',
                  oldLevel: 0,
                  newLevel: 0,
                  xpGained: 0,
                  leveledUp: false,
                  injured: true,
                });
              }
            }
          }
        }
      }
    }

    const entityResults = entityIds
      .map((id: string) => entityResultsMap.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null);

    const characterEvents: Array<{ type: 'level_up'; entityName: string; newLevel: number } | { type: 'injured'; entityName: string }> = [];
    for (const r of entityResults) {
      if (r.leveledUp) characterEvents.push({ type: 'level_up', entityName: r.name, newLevel: r.newLevel });
      if (r.injured)   characterEvents.push({ type: 'injured',  entityName: r.name });
    }

    const results = {
      success,
      rewards: grantedRewards,
      seed: mission.data.seed,
      ...(rolledTexts.length > 0 ? { texts: rolledTexts } : {}),
      entityResults,
      ...(characterEvents.length > 0 ? { characterEvents } : {}),
    };

    for (const entityId of entityIds) {
      const ent = await (db as any).entity.findUnique({ where: { id: entityId } });
      if (ent) {
        const st = (ent.state as any) || {};
        if (injuredEntityUntilTick.has(entityId)) {
          await (db as any).entity.update({
            where: { id: entityId },
            data: {
              state: { ...st, status: 'injured' },
              injuredUntilTick: injuredEntityUntilTick.get(entityId),
            },
          });
        } else {
          await (db as any).entity.update({ where: { id: entityId }, data: { state: { ...st, status: 'idle' } } });
        }
      }
    }

    const sessionEffects = await (db as any).activeEffect.findMany({
      where: { sessionType: 'mission', sessionId: missionId },
    });
    if (sessionEffects.length > 0) {
      await (db as any).activeEffect.deleteMany({
        where: { sessionType: 'mission', sessionId: missionId },
      });
    }

    const updated = await (db as any).job.update({
      where: { id: missionId },
      data: {
        status: success ? 'completed' : 'failed',
        results,
      },
    });

    this.logger.log(`completeMission success: missionId=${missionId.slice(0,8)}, result=${success ? 'completed' : 'failed'}, rewards=${JSON.stringify(grantedRewards)}`);

    try {
      await this.telemetryService.record(
        userId,
        'mission_complete',
        missionDefId,
        1,
        { outcome: success ? 'success' : 'failure' },
        externalTx,
      );
    } catch (_) {}

    try {
      const rewardSummary = grantedRewards.map((r: any) => `${r.amount}x ${r.name || r.key || r.type}`).join(', ');
      const notifTitle = success ? 'Mission Complete!' : 'Mission Failed';
      const notifBody = success
        ? `${def.name}: ${rewardSummary || 'Success'}`
        : `${def.name}: Failed — better luck next time`;
      const notifDeepLink = { screen: '/missions', missionRunId: missionId, defId: def.id };
      if (externalTx) {
        const existing = await (db as any).notification.findFirst({
          where: { userId, sourceType: 'job_ready', sourceId: missionId, type: 'job_ready', archivedAt: null },
        });
        if (existing) {
          await (db as any).notification.update({
            where: { id: existing.id },
            data: { type: 'mission_complete', title: notifTitle, body: notifBody, deepLink: notifDeepLink, readAt: new Date() },
          });
        }
      } else {
        await this.notificationService.updateBySource({
          userId,
          sourceType: 'job_ready',
          sourceId: missionId,
          type: 'mission_complete',
          category: 'missions',
          priority: 'normal',
          title: notifTitle,
          body: notifBody,
          deepLink: notifDeepLink,
          markRead: true,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to update mission notification: ${err}`);
    }

    return {
      ...this.mapJobToMissionResponse(updated),
      missionResult: {
        success,
        missionName: def.name,
        defId: def.id,
        entityIds,
        rewards: grantedRewards,
        removedEffectIds: sessionEffects.map((e: any) => e.id),
      },
    };
  }

}
