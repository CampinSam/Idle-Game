import { Logger } from '@nestjs/common';
import { TickEventProcessorService } from './tick-event-processor.service';

/**
 * Unit tests for processMultiPhaseMissionPhase (private method on TickEventProcessorService).
 *
 * Coverage:
 *  - next_phase auto-advance (onSuccess: 'next_phase', more phases remain)
 *  - wait → phase_ready (onSuccess: 'wait')
 *  - end_job → abandoned (onFailure: 'end_job')
 *  - complete → ready_notified (last phase or onSuccess: 'complete')
 *  - _rearm on count-not-met (success but phase.count > currentPhaseSuccesses)
 *  - _rearm on allowRetry (failure, allowRetry: true, cap not reached)
 *  - maxFailures force-abandon (missions-level failure threshold)
 *  - Injury accumulation: injuries written to accumulatedState on failure
 *  - Injury tick-down: remainingPenaltyTicks decremented per phase duration
 *  - Injury MP penalty: injuries reduce effective teamMP in subsequent phases
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMultiPhaseDef(overrides: any = {}) {
  return {
    id: 'def-mp',
    // Use difficulty: 1 so calculateSuccessChance(0, 1, ...) = 0/(0+1) = 0 (not NaN).
    // Then minSuccessChance: 100 clamps result to 1.0 (guaranteed success).
    // And maxSuccessChance: 0 clamps result to 0.0 (guaranteed failure).
    difficulty: 1,
    minSuccessChance: 100,
    maxSuccessChance: 100,
    injuryRate: 0,
    injuryRecoveryTicks: 0,
    maxFailures: null,
    timer: { duration: 60, boostable: false },
    phases: [
      {
        name: 'Phase 1',
        duration: 60,
        count: 1,
        allowRetry: false,
        injuryRate: 0,
        injuryPenalty: 0.8,
        injuryPenaltyDuration: 100,
        continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        tiers: {},
      },
    ],
    ...overrides,
  };
}

function makeMultiPhaseJob(overrides: any = {}) {
  return {
    id: 'job-mp',
    userId: 'user-1',
    type: 'MissionJob',
    defId: 'def-mp',
    status: 'active',
    team: ['entity-1'],
    data: { seed: 'test-seed', isMultiPhase: true },
    timer: { startTick: 1, durationTicks: 60 },
    currentPhase: 0,
    phaseResults: [],
    accumulatedState: {
      injuries: [],
      currentPhaseAttempts: 0,
      currentPhaseSuccesses: 0,
      currentPhaseFailures: 0,
      totalMissionFailures: 0,
      bankedRewards: [],
    },
    results: null,
    readyAtTick: 61,
    ...overrides,
  };
}

const ZERO_STATS = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 };

function makeEntity(overrides: any = {}) {
  return {
    id: 'entity-1',
    // Zero-initialized so calculateMP returns 0 (not NaN from undefined * 0.4).
    stats: ZERO_STATS,
    traits: {},
    state: { status: 'mission' },
    ...overrides,
  };
}

type PrismaStore = {
  missionDef: Map<string, any>;
  jobs: Map<string, any>;
  entities: Map<string, any>;
  activeEffects: any[];
};

function makeService(store: PrismaStore) {
  const prisma: any = {
    missionDef: {
      findUnique: jest.fn(async ({ where }: any) => store.missionDef.get(where.id) ?? null),
    },
    entity: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return ids.map((id) => store.entities.get(id)).filter(Boolean);
      }),
      findUnique: jest.fn(async ({ where }: any) => store.entities.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const ent = store.entities.get(where.id) ?? {};
        const updated = { ...ent, ...data };
        store.entities.set(where.id, updated);
        return updated;
      }),
    },
    job: {
      update: jest.fn(async ({ where, data }: any) => {
        const existing = store.jobs.get(where.id) ?? {};
        const updated = { ...existing, ...data };
        store.jobs.set(where.id, updated);
        return updated;
      }),
      findUnique: jest.fn(async ({ where }: any) => store.jobs.get(where.id) ?? null),
    },
    activeEffect: {
      findMany: jest.fn(async () => store.activeEffects),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      delete: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    playerDelta: {
      create: jest.fn(async () => ({ id: 1 })),
    },
  };

  const tickService: any = { getCurrentTick: jest.fn(async () => 100) };
  const pubsub: any = { publish: jest.fn(), publishBroadcast: jest.fn() };
  const notificationService: any = { createNotification: jest.fn(async () => ({ id: 'notif-1' })) };
  const globalPowerService: any = { expireStale: jest.fn(async () => {}) };
  const boostService: any = { expireStaleBoosts: jest.fn(async () => 0) };
  const locationService: any = { completeBuilding: jest.fn(async () => ({ id: 'b1', updatedNotification: null })) };

  const definitionCache: any = { getById: jest.fn(async (t: string, id: string) => (prisma as any).missionDef?.findFirst({ where: { OR: [{ id }, { key: id }] } })), getAll: jest.fn(async () => []) };

  const svc = new TickEventProcessorService(
    prisma as any,
    tickService,
    pubsub,
    notificationService,
    globalPowerService,
    boostService,
    locationService,
    definitionCache,
  );

  (svc as any).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;

  return { svc, prisma, store };
}

function runPhase(svc: any, job: any, currentTick = 100) {
  return (svc as any).processMultiPhaseMissionPhase(job, currentTick);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processMultiPhaseMissionPhase — phase transition logic', () => {

  it('next_phase: advances to phase 1 and stays active when onSuccess is next_phase', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' },
        },
        {
          name: 'Phase 2',
          duration: 90,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.currentPhase).toBe(1);
    expect(updateCall.data.accumulatedState.currentPhaseSuccesses).toBe(0);
    expect(result.shouldNotify).toBe(false);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].data.status).toBe('active');
    expect(result.patches[0].data.currentPhase).toBe(1);
  });

  it('wait: sets status to phase_ready and notifies when onSuccess is wait', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'wait', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('phase_ready');
    expect(result.shouldNotify).toBe(true);
    expect(result.patches[0].data.status).toBe('phase_ready');
  });

  it('end_job: sets status to abandoned and releases entities on failure with onFailure end_job', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const entity = makeEntity();
    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', entity]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('abandoned');
    expect(updateCall.data.results.success).toBe(false);
    expect(updateCall.data.results.abandoned).toBe(true);
    expect(result.shouldNotify).toBe(true);

    const entityUpdate = prisma.entity.update.mock.calls[0][0];
    expect(entityUpdate.data.state.status).toBe('idle');
  });

  it('complete (last phase): sets status to ready_notified on success with onSuccess complete', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('ready_notified');
    expect(updateCall.data.data.lastPhaseSuccess).toBe(true);
    expect(result.shouldNotify).toBe(true);
  });

  it('_rearm on count: re-arms the phase when success count target not yet met', async () => {
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [],
        currentPhaseAttempts: 0,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 0,
        totalMissionFailures: 0,
        bankedRewards: [],
      },
    });
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 3,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.accumulatedState.currentPhaseSuccesses).toBe(1);
    expect(result.shouldNotify).toBe(false);
  });

  it('_rearm on allowRetry: re-arms the phase on failure when allowRetry is true', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: true,
          maxFailuresForCount: null,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.accumulatedState.currentPhaseFailures).toBe(1);
    expect(result.shouldNotify).toBe(false);
  });

  it('maxFailures: forces onFailure path when mission failure limit is reached', async () => {
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [],
        currentPhaseAttempts: 1,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 1,
        totalMissionFailures: 1,
        bankedRewards: [],
      },
    });
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      maxFailures: 2,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: true,
          maxFailuresForCount: null,
          injuryRate: 0,
          continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' },
        },
        {
          name: 'Phase 2',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const entity = makeEntity();
    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', entity]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('abandoned');
    expect(updateCall.data.accumulatedState.totalMissionFailures).toBe(2);
    expect(result.shouldNotify).toBe(true);
  });

  it('failure retry cap: stops re-arming when maxFailuresForCount is reached', async () => {
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [],
        currentPhaseAttempts: 2,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 2,
        totalMissionFailures: 2,
        bankedRewards: [],
      },
    });
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: true,
          maxFailuresForCount: 3,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const entity = makeEntity();
    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', entity]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.accumulatedState.currentPhaseFailures).toBe(3);
    expect(updateCall.data.status).toBe('abandoned');
  });

});

describe('processMultiPhaseMissionPhase — injury accumulation', () => {

  it('banks an injury into accumulatedState when a phase fails with injuryRate = 1.0', async () => {
    const job = makeMultiPhaseJob();
    // Zero stats → teamMP=0. With difficulty=100: injuryChance = 100/(0+100)*1.0 = 1.0 (guaranteed).
    const entity = makeEntity({ id: 'entity-1', stats: ZERO_STATS });
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 1.0,
          injuryPenalty: 0.8,
          injuryPenaltyDuration: 200,
          difficulty: 100,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
      difficulty: 100,
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', entity]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    const injuries: any[] = updateCall.data.accumulatedState.injuries;
    expect(injuries.length).toBeGreaterThanOrEqual(1);
    const entityInjury = injuries.find((i: any) => i.entityId === 'entity-1');
    expect(entityInjury).toBeDefined();
    expect(entityInjury.penalty).toBeCloseTo(0.8, 3);
    expect(entityInjury.remainingPenaltyTicks).toBeGreaterThan(0);
  });

  it('ticks down injury remainingPenaltyTicks by phaseDurationTicks on next_phase advance', async () => {
    const existingInjury = { entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 200 };
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [existingInjury],
        currentPhaseAttempts: 0,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 0,
        totalMissionFailures: 1,
        bankedRewards: [],
      },
    });

    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' },
        },
        {
          name: 'Phase 2',
          duration: 90,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const phaseDurationTicks = 60;
    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    const injuries: any[] = updateCall.data.accumulatedState.injuries;
    expect(injuries).toHaveLength(1);
    expect(injuries[0].remainingPenaltyTicks).toBe(existingInjury.remainingPenaltyTicks - phaseDurationTicks);
  });

  it('removes an injury from accumulatedState once its remainingPenaltyTicks reaches zero during tick-down', async () => {
    const existingInjury = { entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 30 };
    const job = makeMultiPhaseJob({
      timer: { startTick: 1, durationTicks: 60 },
      accumulatedState: {
        injuries: [existingInjury],
        currentPhaseAttempts: 0,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 0,
        totalMissionFailures: 1,
        bankedRewards: [],
      },
    });

    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        {
          name: 'Phase 1',
          duration: 60,
          count: 1,
          allowRetry: false,
          injuryRate: 0,
          continueRules: { onSuccess: 'complete', onFailure: 'end_job' },
        },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    const injuries: any[] = updateCall.data.accumulatedState.injuries;
    expect(injuries).toHaveLength(0);
  });

  it('applies injury MP penalty to subsequent phase: lower teamMP reflected in phaseResult', async () => {
    const injuredEntityId = 'entity-1';
    const penalty = 0.5;
    const existingInjury = { entityId: injuredEntityId, penalty, remainingPenaltyTicks: 500 };

    const job = makeMultiPhaseJob({
      currentPhase: 1,
      accumulatedState: {
        injuries: [existingInjury],
        currentPhaseAttempts: 0,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 0,
        totalMissionFailures: 1,
        bankedRewards: [],
      },
    });

    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        { name: 'Phase 1', duration: 60, count: 1, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' } },
        { name: 'Phase 2', duration: 90, count: 1, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'complete', onFailure: 'end_job' } },
      ],
    });

    const entityWithStats = makeEntity({
      id: injuredEntityId,
      stats: { ATK: 250, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 },
    });
    const expectedBaseMP = 250 * 0.4;
    const expectedPenalizedMP = expectedBaseMP * penalty;

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([[injuredEntityId, entityWithStats]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    const phaseResults: any[] = updateCall.data.phaseResults;
    expect(phaseResults).toHaveLength(1);
    expect(phaseResults[0].teamMP).toBeCloseTo(expectedPenalizedMP, 1);
  });

  it('entity is set to injured status in end_job when an injury is in accumulatedState', async () => {
    // remainingPenaltyTicks must exceed phaseDurationTicks (60) so the injury survives tick-down.
    const existingInjury = { entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 200 };
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [existingInjury],
        currentPhaseAttempts: 0,
        currentPhaseSuccesses: 0,
        currentPhaseFailures: 0,
        totalMissionFailures: 0,
        bankedRewards: [],
      },
    });
    const def = makeMultiPhaseDef({
      maxSuccessChance: 0,
      phases: [
        { name: 'Phase 1', duration: 60, count: 1, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'complete', onFailure: 'end_job' } },
      ],
    });

    const entity = makeEntity({ id: 'entity-1' });
    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', entity]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job, 100);

    const entityUpdate = prisma.entity.update.mock.calls[0][0];
    expect(entityUpdate.data.state.status).toBe('injured');
    expect(entityUpdate.data.injuredUntilTick).toBeGreaterThan(100);
  });

});

describe('processMultiPhaseMissionPhase — phaseResult snapshot', () => {

  it('does NOT record a phaseResult snapshot on a _rearm (retry or count re-arm)', async () => {
    const job = makeMultiPhaseJob();
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        { name: 'Phase 1', duration: 60, count: 3, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'complete', onFailure: 'end_job' } },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.phaseResults).toHaveLength(0);
  });

  it('records one phaseResult entry per concluded phase (when count target met)', async () => {
    const job = makeMultiPhaseJob({
      accumulatedState: {
        injuries: [],
        currentPhaseAttempts: 2,
        currentPhaseSuccesses: 2,
        currentPhaseFailures: 0,
        totalMissionFailures: 0,
        bankedRewards: [],
      },
    });
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        { name: 'Phase 1', duration: 60, count: 3, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'complete', onFailure: 'end_job' } },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.phaseResults).toHaveLength(1);
    expect(updateCall.data.phaseResults[0].phaseIndex).toBe(0);
    expect(updateCall.data.phaseResults[0].success).toBe(true);
  });

  it('next_phase with falling-through to complete when all phases exhausted', async () => {
    const job = makeMultiPhaseJob({ currentPhase: 1 });
    const def = makeMultiPhaseDef({
      minSuccessChance: 100,
      phases: [
        { name: 'Phase 1', duration: 60, count: 1, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' } },
        { name: 'Phase 2', duration: 60, count: 1, allowRetry: false, injuryRate: 0, continueRules: { onSuccess: 'next_phase', onFailure: 'end_job' } },
      ],
    });

    const store: PrismaStore = {
      missionDef: new Map([['def-mp', def]]),
      jobs: new Map([['job-mp', job]]),
      entities: new Map([['entity-1', makeEntity()]]),
      activeEffects: [],
    };

    const { svc, prisma } = makeService(store);
    const result = await runPhase(svc, job);

    const updateCall = prisma.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('ready_notified');
    expect(result.shouldNotify).toBe(true);
  });

});
