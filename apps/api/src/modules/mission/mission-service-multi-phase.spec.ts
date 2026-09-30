import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MissionService } from './mission.service';

/**
 * Unit / integration tests for MissionService multi-phase logic.
 *
 * Coverage:
 *  - advanceToNextPhase: happy path, throws when no next phase
 *  - abandonMission: marks job abandoned with no rewards; carries over injuries to entities
 *  - completeMission rewardsMode:
 *      final_bundle  — tiers-driven bundle only
 *      per_phase     — suppresses final bundle; grants per-phase rewards for successful phases
 *      hybrid        — grants both final bundle AND per-phase rewards
 *  - ContinueMissionHandler: calls advanceToNextPhase when more phases remain; calls completeMission on last
 *  - AbandonMissionHandler: calls abandonMission on a phase_ready job
 */

// ─── Shared fixture factories ─────────────────────────────────────────────────

function makeJob(overrides: any = {}) {
  return {
    id: 'job-1',
    userId: 'user-1',
    defId: 'def-mp',
    type: 'MissionJob',
    status: 'phase_ready',
    team: ['entity-1'],
    timer: { startTick: 1, durationTicks: 10 },
    data: { seed: 'seed-1', isMultiPhase: true, difficulty: 50, synergy: null },
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
    readyAtTick: 11,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDef(overrides: any = {}) {
  return {
    id: 'def-mp',
    name: 'Test Multi-Phase Mission',
    difficulty: 50,
    minSuccessChance: 0,
    maxSuccessChance: 100,
    injuryRate: 0,
    injuryRecoveryTicks: 0,
    mode: 'multi_phase',
    rewardsMode: 'final_bundle',
    maxFailures: null,
    tiers: {},
    phases: [
      { name: 'Phase 1', duration: 10 },
      { name: 'Phase 2', duration: 10 },
    ],
    timer: { duration: 10, boostable: false },
    enabled: true,
    missionCategoryDefId: null,
    cost: [],
    tags: [],
    data: {},
    ...overrides,
  };
}

function makeEntity(overrides: any = {}) {
  return {
    id: 'entity-1',
    name: 'Tester',
    stats: {},
    traits: {},
    state: { status: 'mission' },
    progression: { level: 1 },
    ...overrides,
  };
}

function makeUser(overrides: any = {}) {
  return {
    id: 'user-1',
    keeperLevel: 1,
    keeperXp: BigInt(0),
    flags: {},
    ...overrides,
  };
}

// ─── Mock builder for MissionService dependencies ────────────────────────────

function makeDeps(dbOverrides: any = {}) {
  const jobRow = makeJob();
  const defRow = makeDef();
  const entityRow = makeEntity();
  const userRow = makeUser();

  const db: any = {
    job: {
      create: jest.fn(async ({ data }: any) => {
        Object.assign(jobRow, { id: jobRow.id, ...data });
        return jobRow;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.id !== jobRow.id) return null;
        const statusOk = where.status
          ? (Array.isArray(where.status.in) ? where.status.in.includes(jobRow.status) : jobRow.status === where.status)
          : true;
        return statusOk ? jobRow : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => (where.id === jobRow.id ? jobRow : null)),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(jobRow, data);
        return jobRow;
      }),
      count: jest.fn(async () => 0),
    },
    missionDef: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === defRow.id ? defRow : null)),
      findFirst: jest.fn(async () => defRow),
    },
    entity: {
      findFirst: jest.fn(async () => entityRow),
      findMany: jest.fn(async () => [entityRow]),
      findUnique: jest.fn(async () => entityRow),
      update: jest.fn(async ({ where, data }: any) => ({ ...entityRow, ...data })),
    },
    user: {
      findUnique: jest.fn(async () => userRow),
      update: jest.fn(async ({ where, data }: any) => ({ ...userRow, ...data })),
    },
    activeEffect: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    notification: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (data: any) => ({ id: 'notif-1', ...data })),
      update: jest.fn(async (data: any) => ({ id: 'notif-1', ...data })),
    },
    missionCategoryDef: {
      findUnique: jest.fn(async () => null),
    },
    ...dbOverrides,
  };

  const emptyMod = { flatAdd: 0, percentAdd: 0, multiplier: 1 };

  const prisma: any = db;
  prisma.$transaction = jest.fn(async (fn: any) => fn(db));

  const tickService: any = {
    getCurrentTick: jest.fn(async () => 100),
    getTickInfo: jest.fn(async () => ({ currentTick: 100, currentRate: 1 })),
  };

  const entityService: any = {
    addEntityXp: jest.fn(async (entityId: string) => ({
      entity: entityRow,
      oldLevel: 1,
      newLevel: 1,
      xpGained: 10,
      leveledUp: false,
    })),
  };

  const currencyService: any = {
    creditTx: jest.fn(async () => {}),
    spendTx: jest.fn(async () => {}),
  };

  const inventoryService: any = {
    addItemTx: jest.fn(async () => {}),
    removeItemTx: jest.fn(async () => {}),
  };

  const playerService: any = {};

  const gameRules: any = {
    buildRequirementContext: jest.fn(() => ({
      user: userRow,
      userFlags: {},
      tempFlags: {},
    })),
    checkRequirements: jest.fn(() => true),
    checkVisibility: jest.fn(() => true),
    resolveOutcomes: jest.fn(async (items: any[]) => ({
      resolved: [],
      texts: [],
      flags: [],
      unlocks: [],
    })),
    resolveName: jest.fn(async (type: string, key: string) => key),
  };

  const notificationService: any = {
    updateBySource: jest.fn(async () => {}),
    createNotification: jest.fn(async () => ({ id: 'notif-1' })),
    upsertJobNotification: jest.fn(async () => ({ id: 'notif-1' })),
    markReadBySource: jest.fn(async () => []),
  };

  const eventService: any = {
    dispatch: jest.fn(async () => {}),
  };

  const telemetryService: any = {
    record: jest.fn(async () => {}),
  };

  const effectService: any = {
    resolve: jest.fn(() => emptyMod),
    resolveTimerSpeed: jest.fn(async () => emptyMod),
    resolveForTarget: jest.fn(async () => emptyMod),
    getActiveEffectsForUser: jest.fn(async () => []),
    getGlobalPowerRows: jest.fn(async () => []),
  };

  const synergyResolver: any = {
    resolveRules: jest.fn(async () => ({
      matchedRules: [],
      totals: {
        synergyScore: 0,
        statModifiers: {},
        durationModifiers: {},
      },
    })),
  };

  const telemetryContextBuilder: any = {
    buildContext: jest.fn(async () => ({})),
  };

  return {
    prisma,
    db,
    jobRow,
    defRow,
    entityRow,
    userRow,
    tickService,
    entityService,
    currencyService,
    inventoryService,
    playerService,
    gameRules,
    notificationService,
    eventService,
    telemetryService,
    effectService,
    synergyResolver,
    telemetryContextBuilder,
  };
}

function buildService(deps: ReturnType<typeof makeDeps>): MissionService {
  const gameConstants: any = { get: jest.fn(async () => 300) };
  const fakeDefinitionCache: any = {
    get: jest.fn((_table: string, id: string) => id === deps.defRow.id ? deps.defRow : null),
    getAll: jest.fn(() => [deps.defRow]),
    invalidate: jest.fn(),
  };
  return new MissionService(
    deps.prisma as any,
    deps.entityService as any,
    deps.currencyService as any,
    deps.playerService as any,
    deps.tickService as any,
    deps.inventoryService as any,
    deps.gameRules as any,
    deps.notificationService as any,
    deps.eventService as any,
    deps.telemetryService as any,
    deps.effectService as any,
    deps.synergyResolver as any,
    deps.telemetryContextBuilder as any,
    gameConstants,
    fakeDefinitionCache,
  );
}

// ─── Mission duration integration coverage ───────────────────────────────────

describe('MissionService mission duration persistence', () => {
  it('persists the unmodified duration and ready tick for an ordinary mission', async () => {
    const deps = makeDeps();
    Object.assign(deps.defRow, {
      mode: 'standard',
      phases: [],
      timer: { duration: 41, boostable: false },
    });
    deps.entityRow.state = { status: 'idle' };

    const svc = buildService(deps);
    await svc.startMission('user-1', 'def-mp', ['entity-1'], deps.db);

    expect(deps.db.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timer: { startTick: 100, durationTicks: 41 },
          readyAtTick: 141,
        }),
      }),
    );
    expect(deps.jobRow.timer.durationTicks).toBe(41);
    expect(deps.jobRow.readyAtTick).toBe(141);
  });

  it('persists phase 0 duration after timer effect, synergy, and team SPD are stacked', async () => {
    const deps = makeDeps();
    Object.assign(deps.defRow, {
      mode: 'multi_phase',
      phases: [{ name: 'Phase 1', duration: 100 }, { name: 'Phase 2', duration: 80 }],
      timer: { duration: 999, boostable: true },
    });
    const entityRows = [
      makeEntity({ id: 'slow-1', stats: { SPD: 0 }, state: { status: 'idle' } }),
      makeEntity({ id: 'slow-2', stats: { SPD: 0 }, state: { status: 'idle' } }),
      makeEntity({ id: 'fast', stats: { SPD: 300 }, state: { status: 'idle' } }),
    ];
    deps.db.entity.findFirst = jest.fn(async ({ where }: any) =>
      entityRows.find((entity) => entity.id === where.id) ?? null,
    );
    deps.effectService.resolveTimerSpeed.mockResolvedValue({
      flatAdd: 10,
      percentAdd: 20,
      multiplier: 1.5,
    });
    deps.synergyResolver.resolveRules.mockResolvedValue({
      matchedRules: [],
      totals: {
        synergyScore: 0,
        statModifiers: {},
        durationModifiers: { mission: { percentAdd: 25, flatSeconds: 4 } },
      },
    });

    const svc = buildService(deps);
    await svc.startMission('user-1', 'def-mp', ['slow-1', 'slow-2', 'fast'], deps.db);

    // 100s → timer modifier 198 → synergy 251 → stored SPD multiplier 0.5 → 125 ticks.
    expect(deps.db.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timer: { startTick: 100, durationTicks: 125 },
          readyAtTick: 225,
          data: expect.objectContaining({ spdTimerMultiplier: 0.5 }),
        }),
      }),
    );
    expect(deps.jobRow.timer.durationTicks).toBe(125);
    expect(deps.jobRow.readyAtTick).toBe(225);
    expect(deps.effectService.resolveTimerSpeed).toHaveBeenCalledTimes(1);
    expect(deps.synergyResolver.resolveRules).toHaveBeenCalledTimes(1);
  });

  it('advances using the stored SPD multiplier without reapplying timer effects or synergy', async () => {
    const deps = makeDeps();
    deps.jobRow.currentPhase = 0;
    deps.jobRow.data = { ...deps.jobRow.data, spdTimerMultiplier: 0.5 };
    deps.defRow.phases = [
      { name: 'Phase 1', duration: 10 },
      { name: 'Phase 2', duration: 100 },
    ];
    deps.defRow.timer = { duration: 999, boostable: true };

    const svc = buildService(deps);
    await svc.advanceToNextPhase('user-1', 'job-1', deps.db);

    const updateData = deps.db.job.update.mock.calls[0][0].data;
    expect(updateData.timer).toEqual({ startTick: 100, durationTicks: 50 });
    expect(updateData.readyAtTick).toBe(150);
    expect(deps.effectService.resolveTimerSpeed).not.toHaveBeenCalled();
    expect(deps.synergyResolver.resolveRules).not.toHaveBeenCalled();
  });

  it('falls back to the mission timer duration when the next phase duration is invalid', async () => {
    const deps = makeDeps();
    deps.jobRow.currentPhase = 0;
    deps.jobRow.data = { ...deps.jobRow.data, spdTimerMultiplier: 0.5 };
    deps.defRow.phases = [
      { name: 'Phase 1', duration: 10 },
      { name: 'Phase 2', duration: 'invalid' },
    ];
    deps.defRow.timer = { duration: 37, boostable: false };

    const svc = buildService(deps);
    await svc.advanceToNextPhase('user-1', 'job-1', deps.db);

    const updateData = deps.db.job.update.mock.calls[0][0].data;
    expect(updateData.timer).toEqual({ startTick: 100, durationTicks: 18 });
    expect(updateData.readyAtTick).toBe(118);
  });

  it('defaults missing stored SPD multipliers to 1 for legacy jobs', async () => {
    const deps = makeDeps();
    deps.jobRow.currentPhase = 0;
    deps.jobRow.data = { ...deps.jobRow.data };
    delete deps.jobRow.data.spdTimerMultiplier;
    deps.defRow.phases = [
      { name: 'Phase 1', duration: 10 },
      { name: 'Phase 2', duration: 29 },
    ];
    deps.defRow.timer = { duration: 999, boostable: true };

    const svc = buildService(deps);
    await svc.advanceToNextPhase('user-1', 'job-1', deps.db);

    const updateData = deps.db.job.update.mock.calls[0][0].data;
    expect(updateData.timer).toEqual({ startTick: 100, durationTicks: 29 });
    expect(updateData.readyAtTick).toBe(129);
  });
});

// ─── advanceToNextPhase ───────────────────────────────────────────────────────

describe('MissionService.advanceToNextPhase', () => {

  it('advances the job to the next phase: sets status active, increments currentPhase, resets per-phase counters', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.currentPhase = 0;

    const svc = buildService(deps);
    await svc.advanceToNextPhase('user-1', 'job-1', deps.db);

    const updateCall = deps.db.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.currentPhase).toBe(1);
    expect(updateCall.data.accumulatedState.currentPhaseAttempts).toBe(0);
    expect(updateCall.data.accumulatedState.currentPhaseSuccesses).toBe(0);
    expect(updateCall.data.accumulatedState.currentPhaseFailures).toBe(0);
  });

  it('preserves accumulated injuries and totalMissionFailures when advancing phase', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.currentPhase = 0;
    deps.jobRow.accumulatedState = {
      injuries: [{ entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 50 }],
      currentPhaseAttempts: 3,
      currentPhaseSuccesses: 2,
      currentPhaseFailures: 1,
      totalMissionFailures: 1,
      bankedRewards: [],
    };

    const svc = buildService(deps);
    await svc.advanceToNextPhase('user-1', 'job-1', deps.db);

    const updateCall = deps.db.job.update.mock.calls[0][0];
    expect(updateCall.data.accumulatedState.injuries).toHaveLength(1);
    expect(updateCall.data.accumulatedState.totalMissionFailures).toBe(1);
    expect(updateCall.data.accumulatedState.currentPhaseAttempts).toBe(0);
  });

  it('throws BadRequestException when nextPhaseIndex >= phases.length', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.currentPhase = 1;
    deps.defRow.phases = [
      { name: 'Phase 1', duration: 10 },
      { name: 'Phase 2', duration: 10 },
    ];

    const svc = buildService(deps);
    await expect(svc.advanceToNextPhase('user-1', 'job-1', deps.db)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when no phase_ready job exists for the given id', async () => {
    const deps = makeDeps();
    deps.db.job.findFirst = jest.fn(async () => null);

    const svc = buildService(deps);
    await expect(svc.advanceToNextPhase('user-1', 'job-1', deps.db)).rejects.toThrow(
      NotFoundException,
    );
  });

});

// ─── abandonMission ───────────────────────────────────────────────────────────

describe('MissionService.abandonMission', () => {

  it('marks the job as abandoned with success:false and abandoned:true', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';

    const svc = buildService(deps);
    await svc.abandonMission('user-1', 'job-1', deps.db);

    const updateCall = deps.db.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('abandoned');
    expect(updateCall.data.results.success).toBe(false);
    expect(updateCall.data.results.abandoned).toBe(true);
  });

  it('returns the entityIds from the job team', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.team = ['entity-1', 'entity-2'];
    deps.db.entity.findMany = jest.fn(async () => [
      makeEntity({ id: 'entity-1' }),
      makeEntity({ id: 'entity-2' }),
    ]);

    const svc = buildService(deps);
    const result = await svc.abandonMission('user-1', 'job-1', deps.db);

    expect(result.entityIds).toEqual(['entity-1', 'entity-2']);
  });

  it('sets entity status to idle when there are no injuries in accumulatedState', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.accumulatedState.injuries = [];

    const svc = buildService(deps);
    await svc.abandonMission('user-1', 'job-1', deps.db);

    const entityUpdate = deps.db.entity.update.mock.calls[0][0];
    expect(entityUpdate.data.state.status).toBe('idle');
    expect(entityUpdate.data.injuredUntilTick).toBeUndefined();
  });

  it('sets entity status to injured and sets injuredUntilTick when an injury is in accumulatedState', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.accumulatedState.injuries = [
      { entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 120 },
    ];

    const currentTick = 100;
    deps.tickService.getCurrentTick = jest.fn(async () => currentTick);

    const svc = buildService(deps);
    await svc.abandonMission('user-1', 'job-1', deps.db);

    const entityUpdate = deps.db.entity.update.mock.calls[0][0];
    expect(entityUpdate.data.state.status).toBe('injured');
    expect(entityUpdate.data.injuredUntilTick).toBe(currentTick + 120);
  });

  it('applies the longest remaining injury when the entity has multiple banked injuries', async () => {
    const deps = makeDeps();
    deps.jobRow.status = 'phase_ready';
    deps.jobRow.accumulatedState.injuries = [
      { entityId: 'entity-1', penalty: 0.8, remainingPenaltyTicks: 50 },
      { entityId: 'entity-1', penalty: 0.7, remainingPenaltyTicks: 150 },
    ];

    const currentTick = 100;
    deps.tickService.getCurrentTick = jest.fn(async () => currentTick);

    const svc = buildService(deps);
    await svc.abandonMission('user-1', 'job-1', deps.db);

    const entityUpdate = deps.db.entity.update.mock.calls[0][0];
    expect(entityUpdate.data.injuredUntilTick).toBe(currentTick + 150);
  });

  it('throws NotFoundException when the job does not exist or is in the wrong status', async () => {
    const deps = makeDeps();
    deps.db.job.findFirst = jest.fn(async () => null);

    const svc = buildService(deps);
    await expect(svc.abandonMission('user-1', 'job-1', deps.db)).rejects.toThrow(NotFoundException);
  });

});

// ─── completeMission — rewardsMode ───────────────────────────────────────────

describe('MissionService.completeMission — rewardsMode', () => {

  function makeCompletableDeps(defOverrides: any = {}) {
    const deps = makeDeps();
    deps.jobRow.status = 'ready_notified';
    deps.jobRow.phaseResults = [
      { phaseIndex: 0, success: true, quality: 'common', teamMP: 50 },
    ];
    deps.defRow = {
      ...makeDef(),
      mode: 'multi_phase',
      tiers: {
        common: { rewards: [{ type: 'currency', key: 'gold', min: 10, max: 10 }] },
      },
      phases: [
        {
          name: 'Phase 1',
          duration: 10,
          success: { rewards: [{ type: 'currency', key: 'gems', min: 5, max: 5 }] },
        },
      ],
      ...defOverrides,
    };
    deps.db.missionDef.findUnique = jest.fn(async () => deps.defRow);
    deps.db.missionDef.findFirst = jest.fn(async () => deps.defRow);

    deps.gameRules.resolveOutcomes = jest.fn(async (items: any[]) => ({
      resolved: items.map((item: any) => ({ entry: item, amount: item.min ?? 1 })),
      texts: [],
      flags: [],
      unlocks: [],
    }));

    return deps;
  }

  it('final_bundle: calls resolveOutcomes with the tiers rewards (non-empty outcomeItems)', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'final_bundle' });
    const svc = buildService(deps);

    await svc.completeMission('user-1', 'job-1', deps.db);

    const calls: any[][] = deps.gameRules.resolveOutcomes.mock.calls;
    const firstCallItems = calls[0][0];
    expect(firstCallItems.length).toBeGreaterThan(0);
    expect(firstCallItems[0].type).toBe('currency');
    expect(firstCallItems[0].key).toBe('gold');
  });

  it('per_phase: suppresses the final bundle (first resolveOutcomes call has empty outcomeItems)', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'per_phase' });
    const svc = buildService(deps);

    await svc.completeMission('user-1', 'job-1', deps.db);

    const calls: any[][] = deps.gameRules.resolveOutcomes.mock.calls;
    const finalBundleItems = calls[0][0];
    expect(finalBundleItems).toHaveLength(0);
  });

  it('per_phase: calls resolveOutcomes for each successful phase (per-phase reward resolution)', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'per_phase' });
    const svc = buildService(deps);

    await svc.completeMission('user-1', 'job-1', deps.db);

    const callCount = deps.gameRules.resolveOutcomes.mock.calls.length;
    expect(callCount).toBe(2);
  });

  it('hybrid: uses both the tiers final bundle AND per-phase rewards', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'hybrid' });
    const svc = buildService(deps);

    await svc.completeMission('user-1', 'job-1', deps.db);

    const calls: any[][] = deps.gameRules.resolveOutcomes.mock.calls;
    expect(calls.length).toBe(2);

    const finalBundleItems = calls[0][0];
    expect(finalBundleItems.length).toBeGreaterThan(0);
    expect(finalBundleItems[0].key).toBe('gold');
  });

  it('per_phase: skips phase reward resolution for unsuccessful phases', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'per_phase' });
    deps.jobRow.phaseResults = [
      { phaseIndex: 0, success: false, quality: 'failure', teamMP: 10 },
    ];

    const svc = buildService(deps);
    await svc.completeMission('user-1', 'job-1', deps.db);

    const calls: any[][] = deps.gameRules.resolveOutcomes.mock.calls;
    expect(calls.length).toBe(1);
  });

  it('marks the job as completed or failed based on last phase success', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'final_bundle' });
    deps.jobRow.data = { ...deps.jobRow.data, lastPhaseSuccess: true };

    const svc = buildService(deps);
    await svc.completeMission('user-1', 'job-1', deps.db);

    const updateCall = deps.db.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('completed');
  });

  it('marks the job as failed when lastPhaseSuccess is false', async () => {
    const deps = makeCompletableDeps({ rewardsMode: 'final_bundle' });
    deps.jobRow.data = { ...deps.jobRow.data, lastPhaseSuccess: false };

    const svc = buildService(deps);
    await svc.completeMission('user-1', 'job-1', deps.db);

    const updateCall = deps.db.job.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('failed');
  });

  it('throws BadRequestException when mission timer has not elapsed', async () => {
    const deps = makeCompletableDeps();
    deps.jobRow.status = 'active';
    deps.jobRow.timer = { startTick: 1, durationTicks: 200 };
    deps.tickService.getCurrentTick = jest.fn(async () => 50);

    const svc = buildService(deps);
    await expect(svc.completeMission('user-1', 'job-1', deps.db)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the mission job does not exist', async () => {
    const deps = makeCompletableDeps();
    deps.db.job.findFirst = jest.fn(async () => null);

    const svc = buildService(deps);
    await expect(svc.completeMission('user-1', 'job-1', deps.db)).rejects.toThrow(
      NotFoundException,
    );
  });

});

// ─── ContinueMissionHandler integration ──────────────────────────────────────

describe('ContinueMissionHandler integration', () => {

  function makeCompleteTx(jobOverrides: any = {}) {
    const job = {
      id: 'job-1',
      userId: 'user-1',
      defId: 'def-mp',
      type: 'MissionJob',
      status: 'phase_ready',
      currentPhase: 0,
      timer: { startTick: 1, durationTicks: 10 },
      team: [],
      data: {},
      results: null,
      phaseResults: [],
      accumulatedState: null,
      ...jobOverrides,
    };

    return {
      job: {
        findFirst: jest.fn(async () => job),
        findUnique: jest.fn(async () => job),
      },
      missionDef: {
        findUnique: jest.fn(async () =>
          makeDef({
            phases: [{ name: 'P1', duration: 10 }, { name: 'P2', duration: 10 }],
          }),
        ),
        findFirst: jest.fn(async () =>
          makeDef({
            phases: [{ name: 'P1', duration: 10 }, { name: 'P2', duration: 10 }],
          }),
        ),
      },
      user: {
        findUnique: jest.fn(async () => makeUser()),
      },
      userCurrencyBalance: {
        findMany: jest.fn(async () => []),
      },
      itemInstance: {
        findMany: jest.fn(async () => []),
      },
      notification: {
        create: jest.fn(async () => ({ id: 'notif-1' })),
        findFirst: jest.fn(async () => null),
      },
      userUnlock: {
        findMany: jest.fn(async () => []),
      },
    };
  }

  async function runContinue(
    missionService: any,
    notificationService: any,
    jobOverrides: any = {},
  ) {
    const { ContinueMissionHandler } = await import('../commands/handlers/continue-mission.handler');
    const fakeDef = makeDef({ phases: [{ name: 'P1', duration: 10 }, { name: 'P2', duration: 10 }] });
    const fakeDefinitionCache: any = {
      get: jest.fn((_t: string, id: string) => (id === fakeDef.id || id === fakeDef.key) ? fakeDef : null),
      getAll: jest.fn(() => [fakeDef]),
      invalidate: jest.fn(),
    };
    const handler = new ContinueMissionHandler(missionService, notificationService, fakeDefinitionCache);

    const tx = makeCompleteTx(jobOverrides);

    return handler.execute(
      { userId: 'user-1', tx, commandId: 'cmd-1' } as any,
      { jobId: 'job-1' },
    );
  }

  it('calls advanceToNextPhase when more phases remain after current phase', async () => {
    const missionService: any = {
      advanceToNextPhase: jest.fn(async () => {}),
      completeMission: jest.fn(async () => ({
        missionResult: { success: true, entityIds: [], rewards: [], removedEffectIds: [] },
      })),
    };
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-1' })),
    };

    const result = await runContinue(missionService, notificationService, { currentPhase: 0 });

    expect(missionService.advanceToNextPhase).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      expect.objectContaining({ job: expect.any(Object) }),
    );
    expect(missionService.completeMission).not.toHaveBeenCalled();
  });

  it('calls completeMission when current phase is the last phase', async () => {
    const missionService: any = {
      advanceToNextPhase: jest.fn(async () => {}),
      completeMission: jest.fn(async () => ({
        missionResult: { success: true, entityIds: [], rewards: [], removedEffectIds: [] },
      })),
    };
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-1' })),
    };

    await runContinue(missionService, notificationService, { currentPhase: 1 });

    expect(missionService.completeMission).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      expect.objectContaining({ job: expect.any(Object) }),
    );
    expect(missionService.advanceToNextPhase).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when jobId is not provided', async () => {
    const { ContinueMissionHandler } = await import('../commands/handlers/continue-mission.handler');
    const fakeDefCache: any = { get: jest.fn(() => null), getAll: jest.fn(() => []), invalidate: jest.fn() };
    const handler = new ContinueMissionHandler({} as any, {} as any, fakeDefCache);

    await expect(
      handler.execute({ userId: 'user-1', tx: {}, commandId: 'cmd-1' } as any, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when no phase_ready job exists with the given id', async () => {
    const { ContinueMissionHandler } = await import('../commands/handlers/continue-mission.handler');
    const tx: any = {
      job: { findFirst: jest.fn(async () => null) },
    };
    const fakeDefCache: any = { get: jest.fn(() => null), getAll: jest.fn(() => []), invalidate: jest.fn() };
    const handler = new ContinueMissionHandler({} as any, {} as any, fakeDefCache);

    await expect(
      handler.execute({ userId: 'user-1', tx, commandId: 'cmd-1' } as any, { jobId: 'job-1' }),
    ).rejects.toThrow(NotFoundException);
  });

});

// ─── AbandonMissionHandler integration ───────────────────────────────────────

describe('AbandonMissionHandler integration', () => {

  function makeAbandonTx(jobStatus = 'abandoned') {
    const job = makeJob({ status: jobStatus });
    return {
      job: {
        findUnique: jest.fn(async () => job),
      },
      userCurrencyBalance: {
        findMany: jest.fn(async () => []),
      },
      itemInstance: {
        findMany: jest.fn(async () => []),
      },
    };
  }

  async function runAbandon(missionService: any, notificationService: any, txOverrides: any = {}) {
    const { AbandonMissionHandler } = await import('../commands/handlers/abandon-mission.handler');
    const handler = new AbandonMissionHandler(missionService, notificationService);

    const tx = { ...makeAbandonTx(), ...txOverrides };

    return handler.execute(
      { userId: 'user-1', tx, commandId: 'cmd-1' } as any,
      { jobId: 'job-1' },
    );
  }

  it('calls abandonMission with the correct userId and jobId', async () => {
    const missionService: any = {
      abandonMission: jest.fn(async () => ({ entityIds: [], removedEffectIds: [] })),
    };
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-1' })),
    };

    await runAbandon(missionService, notificationService);

    expect(missionService.abandonMission).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      expect.objectContaining({ job: expect.any(Object) }),
    );
  });

  it('returns patches that include the abandoned job upsert', async () => {
    const missionService: any = {
      abandonMission: jest.fn(async () => ({ entityIds: [], removedEffectIds: [] })),
    };
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-1' })),
    };

    const result = await runAbandon(missionService, notificationService, {
      job: { findUnique: jest.fn(async () => makeJob({ status: 'abandoned' })) },
    });

    expect(result.patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'job', data: expect.objectContaining({ status: 'abandoned' }) }),
      ]),
    );
  });

  it('throws BadRequestException when jobId is not provided', async () => {
    const { AbandonMissionHandler } = await import('../commands/handlers/abandon-mission.handler');
    const handler = new AbandonMissionHandler({} as any, {} as any);

    await expect(
      handler.execute({ userId: 'user-1', tx: {}, commandId: 'cmd-1' } as any, {}),
    ).rejects.toThrow(BadRequestException);
  });

});
