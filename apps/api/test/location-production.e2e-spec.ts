/**
 * Location production (settlement) integration tests.
 *
 * Tests LocationSettlementService.settleLocationTx logic directly with a
 * mocked Prisma transaction client — no database required. Verifies that:
 *   - disabled locations produce nothing but advance lastCollectionTick
 *   - locations with no configured production rates produce nothing
 *   - elapsed ticks are capped at 7 days (604,800 s)
 *   - the stat-driven worker multiplier scales production and consumption
 *     correctly (sum of FOC/SPD across workers' equipped stats)
 *   - high threat level reduces production
 *   - storage capacity caps the amount stored
 */

import {
  LocationSettlementService,
  getWorkerMultsBps,
} from '../src/modules/location/location-settlement.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RATE_PER_HOUR = 3600; // 3600 units/h → exactly 1 unit/tick (1 tick = 1 s)

function makeLocation(overrides: Record<string, any> = {}) {
  return {
    id: 'loc-1',
    ownerUserId: 'user-1',
    definitionId: 'derp_outpost',
    level: 1,
    enabled: true,
    threatLevel: 0,
    lastCollectionTick: BigInt(0),
    storage: {
      productionRates: { soft_arcanium: RATE_PER_HOUR },
      capacity: { soft_arcanium: 10000 },
      stored: { soft_arcanium: 0 },
    },
    workerAssignments: [],
    ...overrides,
  };
}

function makeLocationDef(overrides: Record<string, any> = {}) {
  return {
    id: 'derp_outpost',
    rules: {},
    ...overrides,
  };
}

/**
 * Builds a mocked Prisma transaction client.
 *
 * `entitiesById` and `itemsById` let tests describe the worker entities and
 * any equipped item instances that drive the new stat-based worker
 * multiplier. Workers with no entry default to a "missing" lookup, which
 * `sumEquippedStatsForEntities` treats as zero.
 */
function buildTxClient(
  location: any,
  locationDef?: any,
  entitiesById: Record<string, any> = {},
  itemsById: Record<string, any> = {},
) {
  return {
    locationInstance: {
      findFirst: jest.fn().mockResolvedValue(location),
      update: jest.fn().mockResolvedValue({ ...location }),
    },
    locationDefinition: {
      findUnique: jest.fn().mockResolvedValue(locationDef ?? makeLocationDef()),
    },
    entity: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return ids.map((id) => entitiesById[id]).filter(Boolean);
      }),
    },
    itemInstance: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return ids.map((id) => itemsById[id]).filter(Boolean);
      }),
    },
  };
}

function buildService() {
  return new LocationSettlementService({} as any, {} as any, {} as any, {} as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWorkerMultsBps (stat-driven worker contribution)', () => {
  it('returns 1.00 / 1.00 when no workers contribute stats', () => {
    const r = getWorkerMultsBps({ ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 });
    expect(Number(r.productionMultBps)).toBe(10000);
    expect(Number(r.consumptionMultBps)).toBe(10000);
  });

  it('10 FOC + 12 SPD → +11% production, +1% consumption', () => {
    const r = getWorkerMultsBps({ ATK: 0, DEF: 0, SPD: 12, FOC: 10, LCK: 0, VIT: 0 });
    expect(Number(r.productionMultBps)).toBe(11100); // 10000 + 50*22
    expect(Number(r.consumptionMultBps)).toBe(10100); // 10000 + 50*(12-10)
  });

  it('floors consumption at 0 when ΣFOC greatly exceeds ΣSPD', () => {
    const r = getWorkerMultsBps({ ATK: 0, DEF: 0, SPD: 0, FOC: 500, LCK: 0, VIT: 0 });
    expect(Number(r.consumptionMultBps)).toBe(0);
    expect(Number(r.productionMultBps)).toBe(35000); // 10000 + 50*500
  });
});

describe('LocationSettlementService — settleLocationTx', () => {
  it('produces nothing and advances tick when location is disabled', async () => {
    const service = buildService();
    const loc = makeLocation({ enabled: false });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(100));

    expect(result.produced).toHaveLength(0);
    expect(tx.locationInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastCollectionTick: BigInt(100) }) }),
    );
  });

  it('produces nothing when productionRates is empty', async () => {
    const service = buildService();
    const loc = makeLocation({
      storage: { productionRates: {}, capacity: {}, stored: {} },
    });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(100));

    expect(result.produced).toHaveLength(0);
  });

  it('returns zero production when currentTick equals lastCollectionTick', async () => {
    const service = buildService();
    const loc = makeLocation({ lastCollectionTick: BigInt(500) });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(500));

    expect(result.produced).toHaveLength(0);
    expect(result.elapsedTicks).toBe('0');
  });

  it('produces base rate (×1.00) with zero workers under the stat-driven formula', async () => {
    const service = buildService();
    // No workers → productionMultBps = 10000 (×1.00), threat = 100%.
    // Expected = 3600 ticks × 1 unit/tick = 3600 (no longer 1800).
    const loc = makeLocation({ lastCollectionTick: BigInt(0) });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].resourceId).toBe('soft_arcanium');
    expect(Number(result.produced[0].amount)).toBe(3600);
  });

  it('applies the stat-driven worker multiplier (10 FOC / 12 SPD → +11% production)', async () => {
    const service = buildService();
    // One worker with combined 10 FOC and 12 SPD on the entity itself
    // (no equipment) → productionMultBps = 11100. 3600 * 1.11 = 3996.
    const loc = makeLocation({
      lastCollectionTick: BigInt(0),
      workerAssignments: [{ id: 'wa-1', entityId: 'ent-1' }],
    });
    const tx = buildTxClient(loc, undefined, {
      'ent-1': {
        id: 'ent-1',
        stats: { ATK: 0, DEF: 0, SPD: 12, FOC: 10, LCK: 0, VIT: 0 },
        equipment: [],
      },
    });

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(3996);
  });

  it('includes equipped item stats in the worker multiplier', async () => {
    const service = buildService();
    // Entity has 5 FOC base + a piece of gear that adds 5 FOC → ΣFOC = 10.
    // SPD = 12 base. Combined → +11% production.
    const loc = makeLocation({
      lastCollectionTick: BigInt(0),
      workerAssignments: [{ id: 'wa-1', entityId: 'ent-1' }],
    });
    const tx = buildTxClient(
      loc,
      undefined,
      {
        'ent-1': {
          id: 'ent-1',
          stats: { ATK: 0, DEF: 0, SPD: 12, FOC: 5, LCK: 0, VIT: 0 },
          equipment: [{ itemInstanceId: 'item-1' }],
        },
      },
      {
        'item-1': {
          id: 'item-1',
          definition: { equipData: { stats: { FOC: 5 } } },
        },
      },
    );

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(3996);
  });

  it('caps elapsed ticks at 7 days (604800 s) and sets capped=true', async () => {
    const service = buildService();
    const loc = makeLocation({
      lastCollectionTick: BigInt(0),
      storage: {
        productionRates: { soft_arcanium: 1 }, // tiny rate to avoid capacity cap
        capacity: { soft_arcanium: 999_999_999 },
        stored: { soft_arcanium: 0 },
      },
    });
    const tx = buildTxClient(loc);
    const WAY_TOO_MANY_TICKS = BigInt(7 * 24 * 60 * 60 + 9999); // over 7 days

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', WAY_TOO_MANY_TICKS);

    expect(result.capped).toBe(true);
    expect(Number(result.elapsedTicks)).toBe(7 * 24 * 60 * 60); // exactly 7 days
  });

  it('caps stored amount at storage capacity', async () => {
    const service = buildService();
    // 3600 ticks → 3600 produced at ×1.00 worker mult, but capacity is only 100
    const loc = makeLocation({
      lastCollectionTick: BigInt(0),
      storage: {
        productionRates: { soft_arcanium: RATE_PER_HOUR },
        capacity: { soft_arcanium: 100 },
        stored: { soft_arcanium: 0 },
      },
    });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(100); // capped at capacity
  });

  it('phased settlement clamps consumption to zero when ΣFOC vastly exceeds ΣSPD', async () => {
    const service = buildService();
    // Build a bundle that produces resA (100/h) while consuming resB (100/h).
    // With consumptionMultBps = 0, the consumption term must be skipped — so
    // resB starvation never triggers and the bundle should produce its full
    // 1h output unaffected by lack of resB.
    const bundles = [
      {
        buildingId: 'b1',
        buildingDefId: 'def-1',
        produces: { resA: 100 },
        consumes: { resB: 100 },
        resourceTypes: { resA: 'currency' as const, resB: 'currency' as const },
        onStarve: 'pause' as const,
        status: 'operational' as const,
      },
    ];

    const result = (service as any).runPhasedSettlement(
      bundles,
      { resA: 0 }, // stored amounts
      { resB: 0 }, // wallet balances — no resB available at all
      { resA: 999_999 }, // capacity
      3600, // 1 hour elapsed
      BigInt(35000), // productionMultBps  → ×3.5 (high FOC)
      BigInt(0), // consumptionMultBps → floored to 0
      BigInt(10000), // threat ×1.0
      BigInt(10000), // effect ×1.0
    );

    // Bundle must remain operational (consumption was clamped, no starvation).
    expect(result.bundleStatuses.get('b1')).toBe('operational');
    // No resB should have been consumed.
    expect(result.totalConsumed.resB ?? 0).toBe(0);
    // Full hour was simulated (no early-exit due to starvation).
    expect(result.simulatedSeconds).toBe(3600);
    // Production = 100/h × 1h × 3.5 = 350 units of resA.
    expect(result.totalProduced.resA).toBe(350);
  });

  it('reduces production at high threat level (>80 → 50% threat multiplier)', async () => {
    const service = buildService();
    // No workers → worker mult ×1.00. threat=90 → 50%. 3600 * 1.0 * 0.5 = 1800
    const loc = makeLocation({ threatLevel: 90 });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(1800);
  });
});
