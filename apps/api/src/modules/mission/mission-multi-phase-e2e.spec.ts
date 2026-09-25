/**
 * End-to-end integration test: full multi-phase mission lifecycle
 *
 * Exercises the complete handoff chain across all three layers:
 *
 *   1. MissionService.startMission        — creates the job (active, phase 0)
 *   2. processMultiPhaseMissionPhase      — tick fires, phase 0 outcome → phase_ready
 *   3. ContinueMissionHandler.execute     — player continues → advanceToNextPhase (active, phase 1)
 *   4. processMultiPhaseMissionPhase      — tick fires, phase 1 outcome → phase_ready
 *   5. ContinueMissionHandler.execute     — player continues (last phase) → completeMission (completed)
 *
 * Note on status after step 4: ContinueMissionHandler requires the job to be
 * in 'phase_ready' status (it cannot act on 'ready_notified'). Both phases
 * therefore use continueRules.onSuccess = 'wait' so that after each tick the
 * job waits for player confirmation. The last phase's ContinueMission call
 * detects nextPhaseIndex >= phases.length and routes to completeMission.
 *
 * Note on success guarantee: calculateSuccessChance(0, 0, ...) returns NaN
 * (0/0) so difficulty must be ≥ 1. With minSuccessChance = 100 and
 * difficulty = 1, every roll returns 1.0, and rng.chance(1.0) always true.
 *
 * A single shared mutable job state is threaded through every call so each
 * layer reads what the previous layer wrote — matching real DB row semantics.
 */
import { MissionService } from './mission.service';
import { TickEventProcessorService } from '../tick/tick-event-processor.service';
import { ContinueMissionHandler } from '../commands/handlers/continue-mission.handler';

// ─── Shared fixture data ──────────────────────────────────────────────────────

const USER_ID = 'user-e2e';
const JOB_ID = 'job-e2e';
const DEF_ID = 'def-e2e-multi';
const ENTITY_ID = 'entity-e2e';
const CURRENT_TICK = 100;

/**
 * Two-phase mission definition.
 * Both phases use continueRules.onSuccess = 'wait' so the tick processor
 * transitions the job to 'phase_ready' after each phase, requiring the
 * player to call ContinueMission to proceed.
 */
function makeDef() {
  return {
    id: DEF_ID,
    name: 'E2E Multi-Phase',
    difficulty: 1,
    minSuccessChance: 100,
    maxSuccessChance: 100,
    injuryRate: 0,
    injuryRecoveryTicks: 0,
    mode: 'multi_phase',
    rewardsMode: 'per_phase',
    maxFailures: null,
    tiers: {
      common: { rewards: [{ type: 'currency', key: 'gold', min: 10, max: 10 }] },
    },
    phases: [
      {
        name: 'Phase 1',
        duration: 0,
        difficulty: 1,
        continueRules: { onSuccess: 'wait', onFailure: 'end_job' },
        success: { rewards: [{ type: 'currency', key: 'gems', min: 5, max: 5 }] },
      },
      {
        name: 'Phase 2',
        duration: 0,
        difficulty: 1,
        continueRules: { onSuccess: 'wait', onFailure: 'end_job' },
        success: { rewards: [{ type: 'currency', key: 'gems', min: 5, max: 5 }] },
      },
    ],
    timer: { duration: 0, boostable: false },
    enabled: true,
    missionCategoryDefId: null,
    cost: [],
    tags: [],
    data: {},
    visibilityRequirements: [],
    requirements: [],
    launchRequirements: null,
  };
}

function makeEntity() {
  return {
    id: ENTITY_ID,
    name: 'E2E Hero',
    stats: { ATK: 50, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 10 },
    traits: {},
    state: { status: 'idle' },
    progression: { level: 1 },
    equipment: [],
    ownerUserId: USER_ID,
    role: null,
    definitionId: null,
    nftCollectionDefId: null,
  };
}

function makeUser() {
  return {
    id: USER_ID,
    keeperLevel: 1,
    keeperXp: BigInt(0),
    flags: {},
  };
}

// ─── Shared mutable state ─────────────────────────────────────────────────────

/**
 * Build a shared in-memory database mock backed by a mutable jobRow.
 * Every layer reads from and writes to the same object so state flows
 * correctly across service boundaries — as it would with a real DB.
 */
function buildSharedDb() {
  const defRow = makeDef();
  const entityRow = makeEntity();
  const userRow = makeUser();

  // The job starts empty; startMission populates it via job.create.
  const jobRow: any = {};

  const db: any = {
    // ── Job table ──────────────────────────────────────────────────────────────
    job: {
      create: jest.fn(async ({ data }: any) => {
        Object.assign(jobRow, {
          id: JOB_ID,
          userId: USER_ID,
          type: 'MissionJob',
          createdAt: new Date(),
          updatedAt: new Date(),
          results: null,
          phaseResults: [],
          readyAtTick: null,
          ...data,
        });
        return { ...jobRow };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.id && where.id !== jobRow.id) return null;
        if (where?.userId && where.userId !== jobRow.userId) return null;
        if (where?.status) {
          const allowed: string[] = where.status.in ?? [where.status];
          if (!allowed.includes(jobRow.status)) return null;
        }
        return { ...jobRow };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where?.id !== jobRow.id) return null;
        return { ...jobRow };
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.userId && where.userId !== jobRow.userId) return [];
        if (where?.status) {
          const allowed: string[] = where.status.in ?? [where.status];
          if (!allowed.includes(jobRow.status)) return [];
        }
        if (!jobRow.id) return [];
        return [{ ...jobRow }];
      }),
      update: jest.fn(async ({ where, data }: any) => {
        if (where?.id !== jobRow.id) {
          throw new Error(`job.update: unknown id ${where?.id}`);
        }
        Object.assign(jobRow, data);
        jobRow.updatedAt = new Date();
        return { ...jobRow };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 0),
    },

    // ── MissionDef table ───────────────────────────────────────────────────────
    missionDef: {
      findUnique: jest.fn(async ({ where }: any) => (where?.id === defRow.id ? defRow : null)),
      findFirst: jest.fn(async () => defRow),
      findMany: jest.fn(async () => [defRow]),
    },

    // ── Entity table ───────────────────────────────────────────────────────────
    entity: {
      findFirst: jest.fn(async () => ({ ...entityRow })),
      findMany: jest.fn(async () => [{ ...entityRow }]),
      findUnique: jest.fn(async () => ({ ...entityRow })),
      update: jest.fn(async ({ where, data }: any) => {
        if (where?.id === ENTITY_ID) Object.assign(entityRow, data);
        return { ...entityRow };
      }),
    },

    // ── User table ─────────────────────────────────────────────────────────────
    user: {
      findUnique: jest.fn(async () => ({ ...userRow })),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(userRow, data);
        return { ...userRow };
      }),
    },

    // ── Misc tables ────────────────────────────────────────────────────────────
    activeEffect: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      delete: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    notification: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'notif-e2e', ...args.data })),
      update: jest.fn(async () => ({ id: 'notif-e2e' })),
    },
    playerDelta: {
      create: jest.fn(async () => ({ id: 1 })),
    },
    missionCategoryDef: {
      findUnique: jest.fn(async () => null),
    },
    userCurrencyBalance: {
      findMany: jest.fn(async () => []),
    },
    itemInstance: {
      findMany: jest.fn(async () => []),
    },
    userUnlock: {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
    },
  };

  // $transaction simply calls the callback with the same db (no real DB needed)
  db.$transaction = jest.fn(async (fn: any) => fn(db));

  return { db, jobRow, defRow, entityRow, userRow };
}

// ─── Shared definition cache helper ──────────────────────────────────────────

function createDefCache(defRow: any): any {
  const defMap = new Map<string, any>([
    [defRow.id, defRow],
    ...(defRow.key ? [[defRow.key, defRow] as [string, any]] : []),
  ]);
  return {
    get: jest.fn((_t: string, id: string) => defMap.get(id) ?? null),
    getAll: jest.fn(() => [...defMap.values()]),
    invalidate: jest.fn(),
  };
}

// ─── Dependency factories ─────────────────────────────────────────────────────

const emptyMod = {
  flatAdd: 0,
  percentAdd: 0,
  multiplier: 1,
  statFlatAdds: {},
  statPercentAdds: {},
  statMultipliers: {},
  grants: [],
  traits: [],
  sources: [],
};

function buildMissionService(db: any, cache?: any): MissionService {
  const tickService: any = {
    getCurrentTick: jest.fn(async () => CURRENT_TICK),
    getTickInfo: jest.fn(async () => ({ currentTick: CURRENT_TICK, currentRate: 1 })),
  };
  const entityService: any = {
    addEntityXp: jest.fn(async () => ({
      entity: makeEntity(), oldLevel: 1, newLevel: 1, xpGained: 10, leveledUp: false,
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
  const gameRules: any = {
    buildRequirementContext: jest.fn(() => ({ user: makeUser(), userFlags: {}, tempFlags: {} })),
    checkRequirements: jest.fn(() => true),
    checkVisibility: jest.fn(() => true),
    resolveOutcomes: jest.fn(async (items: any[]) => ({
      resolved: items.map((item: any) => ({ entry: item, amount: item.min ?? 1 })),
      texts: [],
      flags: [],
      unlocks: [],
    })),
    resolveName: jest.fn(async (_type: string, key: string) => key),
  };
  const notificationService: any = {
    updateBySource: jest.fn(async () => {}),
    createNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    upsertJobNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    markReadBySource: jest.fn(async () => []),
  };
  const eventService: any = { dispatch: jest.fn(async () => {}) };
  const telemetryService: any = { record: jest.fn(async () => {}) };
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
      totals: { synergyScore: 0, statModifiers: {}, durationModifiers: {} },
    })),
  };
  const telemetryContextBuilder: any = { buildContext: jest.fn(async () => ({})) };

  const gameConstants: any = { get: jest.fn(async () => 300) };

  const fakeDefinitionCache: any = cache ?? { get: jest.fn(() => null), getAll: jest.fn(() => []), invalidate: jest.fn() };
  return new MissionService(
    db,
    entityService,
    currencyService,
    {} as any,
    tickService,
    inventoryService,
    gameRules,
    notificationService,
    eventService,
    telemetryService,
    effectService,
    synergyResolver,
    telemetryContextBuilder,
    gameConstants,
    fakeDefinitionCache,
  );
}

async function buildTickProcessor(db: any, cache?: any): Promise<TickEventProcessorService> {
  const tickService: any = { getCurrentTick: jest.fn(async () => CURRENT_TICK) };
  const pubsub: any = { publish: jest.fn(), publishBroadcast: jest.fn() };
  const notificationService: any = {
    createNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
  };
  const globalPowerService: any = { expireStale: jest.fn(async () => {}) };
  const boostService: any = {};
  const locationService: any = {};

  let definitionCache: any = cache;
  if (!definitionCache) {
    const missionDefs: any[] = await db.missionDef.findMany();
    const defMap = new Map<string, any>();
    for (const d of missionDefs) {
      if (d.id) defMap.set(d.id, d);
      if (d.key) defMap.set(d.key, d);
    }
    definitionCache = {
      get: jest.fn((_t: string, id: string) => defMap.get(id) ?? null),
      getAll: jest.fn(() => [...defMap.values()]),
      invalidate: jest.fn(),
    };
  }

  return new TickEventProcessorService(
    db,
    tickService,
    pubsub,
    notificationService,
    globalPowerService,
    boostService,
    locationService,
    definitionCache,
  );
}

// ─── Helper: get current job snapshot ────────────────────────────────────────

async function getJobSnapshot(db: any): Promise<any> {
  return db.job.findUnique({ where: { id: JOB_ID } });
}

// ─── Full lifecycle test ──────────────────────────────────────────────────────

describe('Mission full multi-phase lifecycle (end-to-end)', () => {

  it('completes both phases and transitions through the expected statuses', async () => {
    const { db, jobRow, defRow } = buildSharedDb();
    const sharedCache = createDefCache(defRow);
    const missionService = buildMissionService(db, sharedCache);
    const tickProcessor = await buildTickProcessor(db, sharedCache);
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    };
    const handler = new ContinueMissionHandler(missionService, notificationService, sharedCache);

    // ── Step 1: Start mission ─────────────────────────────────────────────────
    const startResult = await missionService.startMission(USER_ID, DEF_ID, [ENTITY_ID]);

    expect(startResult.status).toBe('active');
    expect(startResult.currentPhase).toBe(0);
    expect(jobRow.status).toBe('active');
    expect(jobRow.currentPhase).toBe(0);
    expect(jobRow.data?.isMultiPhase).toBe(true);

    // Entity must be flagged as on-mission while the expedition runs
    const missionStatusCall = db.entity.update.mock.calls.find(
      (c: any[]) => c[0].data?.state?.status === 'mission',
    );
    expect(missionStatusCall).toBeDefined();

    // ── Step 2: Tick fires — phase 0 processed → phase_ready ─────────────────
    const jobSnap0 = await getJobSnapshot(db);
    const phaseResult0 = await (tickProcessor as any).processMultiPhaseMissionPhase(
      jobSnap0,
      CURRENT_TICK,
    );

    expect(phaseResult0.patches).toHaveLength(1);
    expect(jobRow.status).toBe('phase_ready');
    expect(jobRow.currentPhase).toBe(0);
    expect(Array.isArray(jobRow.phaseResults)).toBe(true);
    expect(jobRow.phaseResults).toHaveLength(1);
    expect(jobRow.phaseResults[0]).toMatchObject({ phaseIndex: 0, success: true });
    // phase_ready is a player-gated transition → shouldNotify is true
    expect(phaseResult0.shouldNotify).toBe(true);

    // ── Step 3: Player continues — advanceToNextPhase → active, phase 1 ──────
    const ctx3: any = { userId: USER_ID, tx: db, commandId: 'cmd-e2e-1' };
    const continue3Result = await handler.execute(ctx3, { jobId: JOB_ID });

    expect(continue3Result.patches.length).toBeGreaterThan(0);
    // After advanceToNextPhase the job must be active and on phase 1
    expect(jobRow.status).toBe('active');
    expect(jobRow.currentPhase).toBe(1);
    // Per-phase counters must be reset for the new phase
    expect(jobRow.accumulatedState.currentPhaseAttempts).toBe(0);
    expect(jobRow.accumulatedState.currentPhaseSuccesses).toBe(0);
    expect(jobRow.accumulatedState.currentPhaseFailures).toBe(0);

    // ── Step 4: Tick fires — phase 1 processed → phase_ready ─────────────────
    // (Both phases use onSuccess: 'wait' so ContinueMissionHandler can act on
    // the result. The last-phase ContinueMission call detects no further phases
    // and routes to completeMission instead of advanceToNextPhase.)
    const jobSnap1 = await getJobSnapshot(db);
    const phaseResult1 = await (tickProcessor as any).processMultiPhaseMissionPhase(
      jobSnap1,
      CURRENT_TICK,
    );

    expect(phaseResult1.patches).toHaveLength(1);
    expect(jobRow.status).toBe('phase_ready');
    expect(jobRow.currentPhase).toBe(1);
    expect(jobRow.phaseResults).toHaveLength(2);
    expect(jobRow.phaseResults[1]).toMatchObject({ phaseIndex: 1, success: true });
    expect(phaseResult1.shouldNotify).toBe(true);

    // ── Step 5: Player continues on last phase → completeMission ─────────────
    // nextPhaseIndex (2) >= phases.length (2) → handler calls completeMission.
    // completeMission accepts phase_ready status (along with active / ready_notified).
    const ctx5: any = { userId: USER_ID, tx: db, commandId: 'cmd-e2e-2' };
    const continue5Result = await handler.execute(ctx5, { jobId: JOB_ID });

    expect(continue5Result.patches.length).toBeGreaterThan(0);
    expect(jobRow.status).toBe('completed');

    const jobPatch: any = (continue5Result.patches as any[]).find(
      (p: any) => p.entity === 'job' && p.id === JOB_ID,
    );
    expect(jobPatch).toBeDefined();
    expect(jobPatch.data.status).toBe('completed');

    // Entities are released back to idle after the mission completes
    const idleUpdate = db.entity.update.mock.calls.find(
      (c: any[]) => c[0].data?.state?.status === 'idle',
    );
    expect(idleUpdate).toBeDefined();
  });

  it('grants per_phase currency rewards for each successful phase', async () => {
    const { db, defRow } = buildSharedDb();
    const sharedCache = createDefCache(defRow);
    const missionService = buildMissionService(db, sharedCache);
    const tickProcessor = await buildTickProcessor(db, sharedCache);
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    };
    const handler = new ContinueMissionHandler(missionService, notificationService, sharedCache);

    await missionService.startMission(USER_ID, DEF_ID, [ENTITY_ID]);

    // Phase 0 tick
    await (tickProcessor as any).processMultiPhaseMissionPhase(
      await getJobSnapshot(db),
      CURRENT_TICK,
    );
    // Continue → phase 1
    await handler.execute({ userId: USER_ID, tx: db, commandId: 'cmd-3' } as any, { jobId: JOB_ID });

    // Phase 1 tick
    await (tickProcessor as any).processMultiPhaseMissionPhase(
      await getJobSnapshot(db),
      CURRENT_TICK,
    );
    // Continue → complete
    await handler.execute({ userId: USER_ID, tx: db, commandId: 'cmd-4' } as any, { jobId: JOB_ID });

    // completeMission calls currencyService.creditTx for per-phase gem rewards
    const creditCalls: any[][] = (missionService as any).currencyService.creditTx.mock.calls;
    expect(creditCalls.length).toBeGreaterThan(0);
    const gemGrant = creditCalls.find((c: any[]) => c[1]?.currencyId === 'gems');
    expect(gemGrant).toBeDefined();
  });

  it('leaves entity in mission status mid-expedition and idle after completion', async () => {
    const { db, defRow } = buildSharedDb();
    const sharedCache = createDefCache(defRow);
    const missionService = buildMissionService(db, sharedCache);
    const tickProcessor = await buildTickProcessor(db, sharedCache);
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    };
    const handler = new ContinueMissionHandler(missionService, notificationService, sharedCache);

    await missionService.startMission(USER_ID, DEF_ID, [ENTITY_ID]);

    // Entity flagged as on-mission
    const onMissionCall = db.entity.update.mock.calls.find(
      (c: any[]) => c[0].data?.state?.status === 'mission',
    );
    expect(onMissionCall).toBeDefined();

    // Run through both phases
    await (tickProcessor as any).processMultiPhaseMissionPhase(await getJobSnapshot(db), CURRENT_TICK);
    await handler.execute({ userId: USER_ID, tx: db, commandId: 'cmd-5' } as any, { jobId: JOB_ID });
    await (tickProcessor as any).processMultiPhaseMissionPhase(await getJobSnapshot(db), CURRENT_TICK);
    await handler.execute({ userId: USER_ID, tx: db, commandId: 'cmd-6' } as any, { jobId: JOB_ID });

    // Entity must be returned to idle after completeMission
    const idleCall = db.entity.update.mock.calls.find(
      (c: any[]) => c[0].data?.state?.status === 'idle',
    );
    expect(idleCall).toBeDefined();
  });

});

// ─── Phase transition regression tests ───────────────────────────────────────

describe('Mission lifecycle — phase state transition assertions', () => {

  async function runFullLifecycle() {
    const { db, jobRow, defRow } = buildSharedDb();
    const sharedCache = createDefCache(defRow);
    const missionService = buildMissionService(db, sharedCache);
    const tickProcessor = await buildTickProcessor(db, sharedCache);
    const notificationService: any = {
      upsertJobNotification: jest.fn(async () => ({ id: 'notif-e2e' })),
    };
    const handler = new ContinueMissionHandler(missionService, notificationService, sharedCache);

    const statuses: string[] = [];

    // 1. Start
    await missionService.startMission(USER_ID, DEF_ID, [ENTITY_ID]);
    statuses.push(jobRow.status);

    // 2. Phase 0 tick
    await (tickProcessor as any).processMultiPhaseMissionPhase(
      await getJobSnapshot(db),
      CURRENT_TICK,
    );
    statuses.push(jobRow.status);

    // 3. Continue phase 0 → advance to phase 1
    await handler.execute(
      { userId: USER_ID, tx: db, commandId: 'cmd-e2e-7' } as any,
      { jobId: JOB_ID },
    );
    statuses.push(jobRow.status);

    // 4. Phase 1 tick
    await (tickProcessor as any).processMultiPhaseMissionPhase(
      await getJobSnapshot(db),
      CURRENT_TICK,
    );
    statuses.push(jobRow.status);

    // 5. Continue phase 1 (final) → complete
    await handler.execute(
      { userId: USER_ID, tx: db, commandId: 'cmd-e2e-8' } as any,
      { jobId: JOB_ID },
    );
    statuses.push(jobRow.status);

    return { statuses, jobRow };
  }

  it('cycles through the correct status sequence', async () => {
    const { statuses } = await runFullLifecycle();
    expect(statuses).toEqual([
      'active',       // after startMission
      'phase_ready',  // after phase 0 tick (onSuccess: 'wait' → awaiting player)
      'active',       // after ContinueMission → advanceToNextPhase
      'phase_ready',  // after phase 1 tick (onSuccess: 'wait' → awaiting player)
      'completed',    // after ContinueMission → completeMission (no more phases)
    ]);
  });

  it('accumulates exactly two phaseResult entries by mission end', async () => {
    const { jobRow } = await runFullLifecycle();
    expect(Array.isArray(jobRow.phaseResults)).toBe(true);
    expect(jobRow.phaseResults).toHaveLength(2);
    expect(jobRow.phaseResults[0]).toMatchObject({ phaseIndex: 0, success: true });
    expect(jobRow.phaseResults[1]).toMatchObject({ phaseIndex: 1, success: true });
  });

  it('advances currentPhase from 0 to 1 during advanceToNextPhase', async () => {
    const { jobRow } = await runFullLifecycle();
    // After the full lifecycle, currentPhase reflects the last phase index (1)
    expect(jobRow.currentPhase).toBe(1);
  });

  it('finalises the job as completed (not failed or abandoned)', async () => {
    const { jobRow } = await runFullLifecycle();
    expect(jobRow.status).toBe('completed');
  });

});
