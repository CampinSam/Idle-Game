import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NotificationService } from '../notification/notification.service';
import { TickService } from './tick.service';
import { BoostService } from './boost.service';
import { GlobalPowerService } from '../global-power/global-power.service';
import { createJobReadyNotifications } from '../job/job-notification.helper';
import { LocationService } from '../location/location.service';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';
import { PatchBuilder, buildLocationPatches } from '../commands/patch-builder';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import { calculateMP, calculateTeamMP, calculateSuccessChance, calculateInjuryChance, SeededRng, durationSecondsToTicks, rollQualityFromCl, QUALITY_TIERS } from '@derp/math';
import { applyInjuryPenalties, tickDownInjuryPenalties, buildInjuredUntilMap, computeInitialPenaltyTicks, computeInjuryPenaltyForEntity, consumeSessionEffectCharges, PhaseInjury } from '../mission/mission-phase.utils';

const POLL_INTERVAL_MS = 200;
const TICK_SYNC_INTERVAL_MS = 30_000;

/**
 * In-memory set of IDs processed in a recent poll cycle.
 * Protects against double-firing on the same entity/job if the DB write
 * from the previous cycle hasn't committed before the next cycle runs.
 * Each entry expires after DEDUP_TTL_MS.
 */
const DEDUP_TTL_MS = 5_000;

interface DedupEntry {
  expiresAt: number;
}

@Injectable()
export class TickEventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickEventProcessorService.name);
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private tickSyncInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly processedEntityIds = new Map<string, DedupEntry>();
  private readonly processedJobIds = new Map<string, DedupEntry>();

  private _bootTime: number | null = null;
  private _bootTick: number | null = null;
  private _lastProcessedTick: number | null = null;

  getBootInfo(): { bootTime: number; bootTick: number } | null {
    if (this._bootTime === null || this._bootTick === null) return null;
    return { bootTime: this._bootTime, bootTick: this._bootTick };
  }

  getLastProcessedTick(): number | null {
    return this._lastProcessedTick;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickService: TickService,
    private readonly pubsub: PubSubService,
    private readonly notificationService: NotificationService,
    private readonly globalPowerService: GlobalPowerService,
    private readonly boostService: BoostService,
    @Inject(forwardRef(() => LocationService))
    private readonly locationService: LocationService,
    private readonly definitionCache: DefinitionCacheService,
  ) {}

  onModuleInit() {
    this._bootTime = Date.now();
    this.tickService.getCurrentTick().then((tick) => {
      this._bootTick = tick;
    }).catch((err) => {
      this.logger.warn(`Failed to record boot tick: ${err}`);
    });

    this.pollInterval = setInterval(() => {
      if (!this.running) {
        this.running = true;
        this.processTick().catch((err) => {
          this.logger.error('TickEventProcessor error', err);
        }).finally(() => {
          this.running = false;
        });
      }
    }, POLL_INTERVAL_MS);
    this.logger.log(`TickEventProcessor started (interval=${POLL_INTERVAL_MS}ms)`);

    this.tickSyncInterval = setInterval(() => {
      this.broadcastTickSync().catch((err) => {
        this.logger.warn('tick.sync broadcast failed', err);
      });
    }, TICK_SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.tickSyncInterval) {
      clearInterval(this.tickSyncInterval);
      this.tickSyncInterval = null;
    }
  }

  private async broadcastTickSync(): Promise<void> {
    const info = await this.tickService.getTickInfo();
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: info.currentTick,
      tickRate: info.currentRate,
      serverTime: info.serverTime,
      boosts: info.activeBoosts,
    });
  }

  private evictExpiredDedup() {
    const now = Date.now();
    for (const [id, entry] of this.processedEntityIds) {
      if (entry.expiresAt <= now) this.processedEntityIds.delete(id);
    }
    for (const [id, entry] of this.processedJobIds) {
      if (entry.expiresAt <= now) this.processedJobIds.delete(id);
    }
  }

  private markEntityProcessed(id: string) {
    this.processedEntityIds.set(id, { expiresAt: Date.now() + DEDUP_TTL_MS });
  }

  private markJobProcessed(id: string) {
    this.processedJobIds.set(id, { expiresAt: Date.now() + DEDUP_TTL_MS });
  }

  private async processTick(): Promise<void> {
    this.evictExpiredDedup();
    const currentTick = await this.tickService.getCurrentTick();
    this._lastProcessedTick = currentTick;
    await Promise.all([
      this.processInjuryRecovery(currentTick),
      this.processJobReadiness(currentTick),
      this.globalPowerService.expireStale().catch((err) =>
        this.logger.warn('Global power expiry check failed', err),
      ),
      this.boostService.expireStaleBoosts().catch((err) =>
        this.logger.warn('Boost expiry check failed', err),
      ),
    ]);
  }

  private async processInjuryRecovery(currentTick: number): Promise<void> {
    const toRecover = await (this.prisma as any).entity.findMany({
      where: {
        injuredUntilTick: { not: null, lte: currentTick },
        state: { path: ['status'], equals: 'injured' },
      },
      select: { id: true, ownerUserId: true, state: true },
    });

    if (toRecover.length === 0) return;

    const fresh = toRecover.filter((e: any) => !this.processedEntityIds.has(e.id));
    if (fresh.length === 0) return;

    this.logger.log(`Recovering ${fresh.length} injured entities via SSE push`);

    const byUser = new Map<string, Array<{ id: string; state: any }>>();
    for (const ent of fresh) {
      if (!ent.ownerUserId) continue;
      this.markEntityProcessed(ent.id);
      const list = byUser.get(ent.ownerUserId) ?? [];
      list.push({ id: ent.id, state: ent.state });
      byUser.set(ent.ownerUserId, list);
    }

    await Promise.allSettled(
      [...byUser].map(([userId, entities]) =>
        this.recoverEntitiesForUser(userId, entities).catch((err) =>
          this.logger.warn(`Injury recovery failed for user ${userId}: ${err}`),
        ),
      ),
    );
  }

  private async recoverEntitiesForUser(
    userId: string,
    entities: Array<{ id: string; state: any }>,
  ): Promise<void> {
    for (const { id, state } of entities) {
      const existing = (state as any) || {};
      await (this.prisma as any).entity.update({
        where: { id },
        data: {
          state: { ...existing, status: 'idle' },
          injuredUntilTick: null,
        },
      });
    }

    const entityIds = entities.map((e) => e.id);
    const recovered = await (this.prisma as any).entity.findMany({
      where: { id: { in: entityIds }, ownerUserId: userId },
      include: { equipment: true, definition: true },
    });

    const { serializeEntityFull } = await import('../entity/entity-stats.util');

    const patches: any[] = [];
    for (const entity of recovered) {
      try {
        const payload = await serializeEntityFull(this.prisma, entity);
        patches.push({ op: 'upsert', entity: 'entity', id: entity.id, data: payload });
      } catch (err) {
        this.logger.warn(`Failed to serialize entity ${entity.id} for delta: ${err}`);
      }
    }

    if (patches.length === 0) return;

    const delta = await (this.prisma as any).playerDelta.create({
      data: { userId, patches: patches as any, ui: [] as any },
    });

    this.pubsub.publish(`player:${userId}`, {
      userId,
      deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
    });

    this.logger.log(`Pushed injury-recovery delta for user ${userId} (${entityIds.length} entities)`);
  }

  private async processJobReadiness(currentTick: number): Promise<void> {
    const readyJobs = await (this.prisma as any).job.findMany({
      where: {
        readyAtTick: { not: null, lte: currentTick },
        status: 'active',
      },
      select: { id: true, userId: true, type: true, defId: true, timer: true, team: true, data: true, results: true, currentPhase: true, phaseResults: true, accumulatedState: true },
    });

    if (readyJobs.length === 0) return;

    const fresh = readyJobs.filter((j: any) => !this.processedJobIds.has(j.id));
    if (fresh.length === 0) return;

    this.logger.log(`Transitioning ${fresh.length} ready jobs to ready_notified via SSE push`);

    const byUser = new Map<string, any[]>();
    for (const job of fresh) {
      this.markJobProcessed(job.id);
      const list = byUser.get(job.userId) ?? [];
      list.push(job);
      byUser.set(job.userId, list);
    }

    await Promise.allSettled(
      [...byUser].map(([userId, jobs]) =>
        this.notifyJobsReadyForUser(userId, jobs, currentTick).catch((err) =>
          this.logger.warn(`Job readiness processing failed for user ${userId}: ${err}`),
        ),
      ),
    );
  }

  private async notifyJobsReadyForUser(userId: string, jobs: any[], currentTick: number): Promise<void> {
    // Multi-phase MissionJobs manage their own status transitions via processMultiPhaseMissionPhase.
    const multiPhaseJobs = jobs.filter(
      (j: any) => j.type === 'MissionJob' && (j.data as any)?.isMultiPhase === true,
    );
    const regularJobs = jobs.filter(
      (j: any) => !(j.type === 'MissionJob' && (j.data as any)?.isMultiPhase === true),
    );
    const regularJobIds = regularJobs.map((j: any) => j.id);

    // Split building jobs (auto-completed server-side) from others (require player action)
    const buildingJobs = regularJobs.filter((j: any) => j.type === 'BuildingJob');
    const otherJobs = regularJobs.filter((j: any) => j.type !== 'BuildingJob');

    // Mark only regular jobs as ready_notified
    if (regularJobIds.length > 0) {
      await (this.prisma as any).job.updateMany({
        where: { id: { in: regularJobIds }, status: 'active' },
        data: { status: 'ready_notified' },
      });
    }

    const allPatches: any[] = [];

    // ── Non-building jobs: notify player to collect manually ──────────────────
    if (otherJobs.length > 0) {
      const otherJobIds = otherJobs.map((j: any) => j.id);

      const createdNotifs = await createJobReadyNotifications(
        this.prisma,
        this.notificationService,
        this.logger,
        userId,
        otherJobs,
      );

      const updatedOtherJobs = await (this.prisma as any).job.findMany({
        where: { id: { in: otherJobIds }, userId },
      });

      for (const n of createdNotifs) {
        allPatches.push({ op: 'upsert' as const, entity: 'notification', id: n.id, data: n });
      }
      for (const j of updatedOtherJobs) {
        const timer = j.timer as any;
        allPatches.push({
          op: 'upsert' as const,
          entity: 'job',
          id: j.id,
          data: {
            id: j.id,
            type: j.type,
            defId: j.defId,
            status: j.status,
            timer: j.timer,
            team: j.team,
            data: j.data,
            results: j.results,
            startTick: timer?.startTick ?? null,
            durationTicks: timer?.durationTicks ?? null,
          },
        });
      }
    }

    // ── Building jobs: auto-complete immediately ───────────────────────────────
    for (const job of buildingJobs) {
      try {
        const jobData = job.data as any;
        const locationId = jobData?.locationId;
        const buildingId = jobData?.buildingId;

        if (!locationId || !buildingId) {
          this.logger.warn(`BuildingJob ${job.id} missing locationId or buildingId in data — skipping auto-complete`);
          // Still push the ready_notified job patch so the client is aware
          const timer = job.timer as any;
          allPatches.push({
            op: 'upsert' as const,
            entity: 'job',
            id: job.id,
            data: {
              id: job.id, type: job.type, defId: job.defId, status: 'ready_notified',
              timer: job.timer, team: job.team, data: job.data, results: job.results,
              startTick: timer?.startTick ?? null, durationTicks: timer?.durationTicks ?? null,
            },
          });
          continue;
        }

        const result = await this.locationService.completeBuilding(userId, locationId, buildingId);

        // Location patch (reflects upgraded building + recalculated meta)
        const pb = new PatchBuilder();
        await buildLocationPatches(pb, this.prisma, userId, locationId);
        allPatches.push(...pb.build());

        // Job patch (status: completed)
        const completedJob = await (this.prisma as any).job.findUnique({ where: { id: job.id } });
        if (completedJob) {
          const timer = completedJob.timer as any;
          allPatches.push({
            op: 'upsert' as const,
            entity: 'job',
            id: completedJob.id,
            data: {
              id: completedJob.id,
              type: completedJob.type,
              defId: completedJob.defId,
              status: completedJob.status,
              timer: completedJob.timer,
              team: completedJob.team,
              data: completedJob.data,
              results: completedJob.results,
              startTick: timer?.startTick ?? null,
              durationTicks: timer?.durationTicks ?? null,
            },
          });
        }

        // Notification from completeBuilding (building_complete type)
        if (result.updatedNotification) {
          allPatches.push({
            op: 'upsert' as const,
            entity: 'notification',
            id: result.updatedNotification.id,
            data: result.updatedNotification,
          });
        }

        this.logger.log(`Auto-completed BuildingJob ${job.id} for user ${userId} (location=${locationId}, building=${buildingId})`);
      } catch (err) {
        this.logger.warn(`Auto-complete failed for BuildingJob ${job.id}: ${err}`);
        // Fall back: push as ready_notified so the client at least sees the job is done
        const timer = job.timer as any;
        allPatches.push({
          op: 'upsert' as const,
          entity: 'job',
          id: job.id,
          data: {
            id: job.id, type: job.type, defId: job.defId, status: 'ready_notified',
            timer: job.timer, team: job.team, data: job.data, results: job.results,
            startTick: timer?.startTick ?? null, durationTicks: timer?.durationTicks ?? null,
          },
        });
      }
    }

    // ── Multi-phase MissionJobs: process phase outcome ─────────────────────────
    for (const job of multiPhaseJobs) {
      try {
        const phaseResult = await this.processMultiPhaseMissionPhase(job, currentTick);
        allPatches.push(...phaseResult.patches);
        if (phaseResult.shouldNotify) {
          await createJobReadyNotifications(this.prisma, this.notificationService, this.logger, userId, [job]);
        }
      } catch (err) {
        this.logger.warn(`Multi-phase processing failed for job ${job.id}: ${err}`);
        // Fallback: mark ready_notified so the client is aware
        await (this.prisma as any).job.update({ where: { id: job.id }, data: { status: 'ready_notified' } });
        const fallbackJob = await (this.prisma as any).job.findUnique({ where: { id: job.id } });
        if (fallbackJob) allPatches.push(this.serializeJobToPatch(fallbackJob));
      }
    }

    if (allPatches.length === 0) return;

    const delta = await (this.prisma as any).playerDelta.create({
      data: { userId, patches: allPatches as any, ui: [] as any },
    });

    this.pubsub.publish(`player:${userId}`, {
      userId,
      deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
    });

    this.logger.log(`Pushed job-ready delta for user ${userId} (${otherJobs.length} notified, ${buildingJobs.length} auto-completed, ${multiPhaseJobs.length} multi-phase processed)`);
  }

  private serializeJobToPatch(job: any) {
    const timer = job.timer as any;
    return {
      op: 'upsert' as const,
      entity: 'job',
      id: job.id,
      data: {
        id: job.id,
        type: job.type,
        defId: job.defId,
        status: job.status,
        timer: job.timer,
        team: job.team,
        data: job.data,
        results: job.results,
        currentPhase: job.currentPhase ?? 0,
        phaseResults: job.phaseResults ?? null,
        accumulatedState: job.accumulatedState ?? null,
        startTick: timer?.startTick ?? null,
        durationTicks: timer?.durationTicks ?? null,
      },
    };
  }

  private async processMultiPhaseMissionPhase(
    job: any,
    currentTick: number,
  ): Promise<{ patches: any[]; shouldNotify: boolean }> {
    const def = await (this.definitionCache as any).getById('missionDef', job.defId);
    if (!def) {
      this.logger.warn(`Multi-phase: missionDef not found for job ${job.id}`);
      const updated = await (this.prisma as any).job.update({
        where: { id: job.id },
        data: { status: 'ready_notified' },
      });
      return { patches: [this.serializeJobToPatch(updated)], shouldNotify: true };
    }

    const phases: any[] = Array.isArray(def.phases) ? def.phases : [];
    const currentPhaseIndex: number = job.currentPhase ?? 0;
    const phase = phases[currentPhaseIndex];

    if (!phase) {
      this.logger.warn(`Multi-phase: phase ${currentPhaseIndex} missing for job ${job.id}`);
      const updated = await (this.prisma as any).job.update({
        where: { id: job.id },
        data: { status: 'ready_notified' },
      });
      return { patches: [this.serializeJobToPatch(updated)], shouldNotify: true };
    }

    const entityIds: string[] = Array.isArray(job.team) ? job.team : [];
    const entities = await (this.prisma as any).entity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, stats: true, traits: true },
    });

    const accumulated: any = job.accumulatedState ?? {
      injuries: [],
      currentPhaseAttempts: 0,
      currentPhaseSuccesses: 0,
      currentPhaseFailures: 0,
      totalMissionFailures: 0,
      bankedRewards: [],
    };

    // Calculate team MP applying per-entity injury penalties (multiple injuries stack multiplicatively)
    const injuries: PhaseInjury[] = accumulated.injuries ?? [];
    let rawTeamMP = applyInjuryPenalties(entities, injuries);

    const persistedSynergy = (job.data as any)?.synergy;
    if (persistedSynergy?.totals) {
      const syn = persistedSynergy.totals;
      if (typeof syn.synergyScore === 'number' && syn.synergyScore !== 0) rawTeamMP += syn.synergyScore;
      const mpBonus = syn.statModifiers?.['MISSION_POWER']?.percentAdd ?? 0;
      if (mpBonus !== 0) rawTeamMP *= 1 + mpBonus / 100;
    }

    const cap = ANTI_WHALE_CAPS.mpEffectivenessCap;
    const teamMP = rawTeamMP <= cap ? rawTeamMP : cap + Math.sqrt(rawTeamMP - cap);

    const difficulty: number = phase.difficulty ?? def.difficulty ?? 0;
    const successChance = calculateSuccessChance(teamMP, difficulty, def.minSuccessChance ?? 0, def.maxSuccessChance ?? 100);

    const phaseSeed = `${(job.data as any)?.seed ?? job.id}_phase_${currentPhaseIndex}_attempt_${accumulated.currentPhaseAttempts ?? 0}`;
    const rng = new SeededRng(phaseSeed);
    const success = rng.chance(successChance);

    let quality = success ? 'common' : 'failure';
    if (success && phase.tiers && typeof phase.tiers === 'object') {
      const hasPhaseTiers = Object.keys(phase.tiers).some(
        (k) => k !== 'sigma' && Array.isArray(phase.tiers[k]?.rewards) && phase.tiers[k].rewards.length > 0,
      );
      if (hasPhaseTiers) {
        try { quality = rollQualityFromCl(teamMP, rng).key; } catch { /* keep 'common' */ }
      }
    }

    // Update counters
    const newAccumulated = { ...accumulated };
    newAccumulated.currentPhaseAttempts = (accumulated.currentPhaseAttempts ?? 0) + 1;
    if (success) {
      newAccumulated.currentPhaseSuccesses = (accumulated.currentPhaseSuccesses ?? 0) + 1;
    } else {
      newAccumulated.currentPhaseFailures = (accumulated.currentPhaseFailures ?? 0) + 1;
      newAccumulated.totalMissionFailures = (accumulated.totalMissionFailures ?? 0) + 1;
    }

    // Phase injuries on failure — multiple injuries per entity are allowed and stack multiplicatively.
    // Both duration (remainingPenaltyTicks) and severity (penalty) are reduced by entity VIT at
    // injury time, using the same curve as single-phase recovery: higher VIT → shorter, weaker injury.
    const injuryRate: number = phase.injuryRate ?? def.injuryRate ?? 0;
    if (!success && injuryRate > 0 && entities.length > 0) {
      for (const entity of entities) {
        const def_stat: number = (entity.stats as any)?.DEF ?? 0;
        const injuryChance = calculateInjuryChance(difficulty, teamMP, injuryRate, def_stat);
        if (injuryChance > 0 && rng.chance(injuryChance)) {
          const vit: number = (entity.stats as any)?.VIT ?? 0;
            const penalty = computeInjuryPenaltyForEntity(phase, vit);
            const remainingPenaltyTicks = computeInitialPenaltyTicks(phase, def, vit);
            newAccumulated.injuries = [
              ...(newAccumulated.injuries ?? []),
              { entityId: entity.id, penalty, remainingPenaltyTicks },
            ];
        }
      }
    }

    // ── Action determination ───────────────────────────────────────────────────
    // Two independent mechanisms:
    //
    // 1. Count-based success repetition (independent of allowRetry):
    //    Re-arm until currentPhaseSuccesses >= phase.count.
    //
    // 2. Failure retry (allowRetry defaults to FALSE — must be explicitly enabled):
    //    Re-arm on failure while allowRetry === true and per-phase failure cap not reached.
    //
    // When mission-level maxFailures is reached, trigger continueRules.onFailure (not
    // a hard end_job override) so phase designers control the terminal behavior.
    const maxFailures: number | null = def.maxFailures ?? null;
    const missionFailureLimitReached = maxFailures !== null && newAccumulated.totalMissionFailures >= maxFailures;
    const rules = phase.continueRules ?? { onSuccess: 'complete', onFailure: 'end_job' };

    const phaseCount: number = phase.count ?? 1;
    const maxFailuresForCount: number | null = phase.maxFailuresForCount ?? null;
    const successCountMet = newAccumulated.currentPhaseSuccesses >= phaseCount;
    const failureCapReached = maxFailuresForCount !== null && newAccumulated.currentPhaseFailures >= maxFailuresForCount;

    let action: string;
    if (success && !successCountMet) {
      // More successes still needed — re-arm regardless of continueRules or retry flags
      action = '_rearm';
    } else if (!success && phase.allowRetry === true && !failureCapReached && !missionFailureLimitReached) {
      // Failure retry: only when explicitly enabled and caps not reached
      action = '_rearm';
    } else {
      // Phase concluded — apply continueRules; mission failure limit forces onFailure path
      action = (success && !missionFailureLimitReached)
        ? (rules.onSuccess ?? 'complete')
        : (rules.onFailure ?? 'end_job');
    }

    // ── Phase result snapshot — only on phase completion, not on retry re-arms ─
    // phaseResults stores one entry per concluded phase (when count target met or
    // retries exhausted), not one per attempt.
    const existingPhaseResults: any[] = Array.isArray(job.phaseResults) ? job.phaseResults : [];
    const phaseResult = {
      phaseIndex: currentPhaseIndex,
      phaseName: phase.name ?? `Phase ${currentPhaseIndex + 1}`,
      success,
      quality,
      teamMP: Number(teamMP.toFixed(2)),
    };
    const completedPhaseResults = action === '_rearm'
      ? existingPhaseResults
      : [...existingPhaseResults, phaseResult];

    // Elapsed ticks for this phase (used for injury tick-down in every branch)
    const phaseDurationTicks = (job.timer as any)?.durationTicks
      ?? Math.max(1, durationSecondsToTicks(phase.duration ?? 60));

    // Resolve boostable flag once for timer calculations below
    const phaseBoostable = (def?.timer as any)?.boostable ?? true;

    const patches: any[] = [];

    if (action === '_rearm') {
      const dur = Math.max(1, phaseBoostable
        ? durationSecondsToTicks(phase.duration ?? 60)
        : Math.round(phase.duration ?? 60));
      // Tick down injuries by the elapsed phase duration
      newAccumulated.injuries = tickDownInjuryPenalties(newAccumulated.injuries ?? [], phaseDurationTicks);
      // Consume session-effect charges at the start of the upcoming attempt
      await consumeSessionEffectCharges(job.id, this.prisma).catch((err) =>
        this.logger.warn(`consumeSessionEffectCharges failed for job ${job.id}: ${err}`),
      );
      const updated = await (this.prisma as any).job.update({
        where: { id: job.id },
        data: {
          status: 'active',
          readyAtTick: Math.floor(currentTick) + dur,
          timer: { startTick: currentTick, durationTicks: dur },
          phaseResults: existingPhaseResults,
          accumulatedState: newAccumulated,
        },
      });
      patches.push(this.serializeJobToPatch(updated));
      return { patches, shouldNotify: false };
    }

    if (action === 'next_phase') {
      const nextPhaseIndex = currentPhaseIndex + 1;
      if (nextPhaseIndex < phases.length) {
        const nextPhase = phases[nextPhaseIndex];
        const dur = Math.max(1, phaseBoostable
          ? durationSecondsToTicks(nextPhase.duration ?? 60)
          : Math.round(nextPhase.duration ?? 60));
        // Tick down injuries by the completed phase's duration before advancing
        newAccumulated.injuries = tickDownInjuryPenalties(newAccumulated.injuries ?? [], phaseDurationTicks);
        newAccumulated.currentPhaseAttempts = 0;
        newAccumulated.currentPhaseSuccesses = 0;
        newAccumulated.currentPhaseFailures = 0;
        // Consume session-effect charges at the start of the next phase's attempt
        await consumeSessionEffectCharges(job.id, this.prisma).catch((err) =>
          this.logger.warn(`consumeSessionEffectCharges failed for job ${job.id}: ${err}`),
        );
        const updated = await (this.prisma as any).job.update({
          where: { id: job.id },
          data: {
            status: 'active',
            currentPhase: nextPhaseIndex,
            readyAtTick: Math.floor(currentTick) + dur,
            timer: { startTick: currentTick, durationTicks: dur },
            phaseResults: completedPhaseResults,
            accumulatedState: newAccumulated,
          },
        });
        patches.push(this.serializeJobToPatch(updated));
        return { patches, shouldNotify: false };
      }
      // No more phases — fall through to complete
    }

    if (action === 'complete' || action === 'next_phase') {
      newAccumulated.injuries = tickDownInjuryPenalties(newAccumulated.injuries ?? [], phaseDurationTicks);
      const updated = await (this.prisma as any).job.update({
        where: { id: job.id },
        data: {
          status: 'ready_notified',
          phaseResults: completedPhaseResults,
          accumulatedState: newAccumulated,
          data: { ...(job.data as any), lastPhaseSuccess: success },
        },
      });
      patches.push(this.serializeJobToPatch(updated));
      return { patches, shouldNotify: true };
    }

    if (action === 'wait') {
      newAccumulated.injuries = tickDownInjuryPenalties(newAccumulated.injuries ?? [], phaseDurationTicks);
      const updated = await (this.prisma as any).job.update({
        where: { id: job.id },
        data: {
          status: 'phase_ready',
          phaseResults: completedPhaseResults,
          accumulatedState: newAccumulated,
        },
      });
      patches.push(this.serializeJobToPatch(updated));
      return { patches, shouldNotify: true };
    }

    // end_job — tick down injuries, then release entities using remainingPenaltyTicks directly.
    // Multiple injuries per entity: the longest remaining ticks wins for recovery time.
    // Delete all session-scoped ActiveEffect rows for this mission so they do not persist.
    await (this.prisma as any).activeEffect.deleteMany({
      where: { sessionType: 'mission', sessionId: job.id },
    });
    newAccumulated.injuries = tickDownInjuryPenalties(newAccumulated.injuries ?? [], phaseDurationTicks);
    const injuredUntilMap = buildInjuredUntilMap(newAccumulated.injuries, currentTick);
    for (const entityId of entityIds) {
      const ent = await (this.prisma as any).entity.findUnique({ where: { id: entityId } });
      if (ent) {
        const st = (ent.state as any) || {};
        const injuredUntilTick = injuredUntilMap.get(entityId);
        if (injuredUntilTick !== undefined) {
          await (this.prisma as any).entity.update({
            where: { id: entityId },
            data: { state: { ...st, status: 'injured' }, injuredUntilTick },
          });
        } else {
          await (this.prisma as any).entity.update({ where: { id: entityId }, data: { state: { ...st, status: 'idle' } } });
        }
      }
    }
    const updated = await (this.prisma as any).job.update({
      where: { id: job.id },
      data: {
        status: 'abandoned',
        phaseResults: completedPhaseResults,
        accumulatedState: newAccumulated,
        results: { success: false, abandoned: true, phaseResults: completedPhaseResults },
      },
    });
    patches.push(this.serializeJobToPatch(updated));
    return { patches, shouldNotify: true };
  }
}
