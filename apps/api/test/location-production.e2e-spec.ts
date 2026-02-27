/**
 * Location production (settlement) integration tests.
 *
 * Tests LocationSettlementService.settleLocationTx logic directly with a
 * mocked Prisma transaction client — no database required. Verifies that:
 *   - disabled locations produce nothing but advance lastCollectionTick
 *   - locations with no configured production rates produce nothing
 *   - elapsed ticks are capped at 7 days (604,800 s)
 *   - worker ratio multiplier scales production correctly (50%–100%)
 *   - high threat level reduces production
 *   - storage capacity caps the amount stored
 */

import { LocationSettlementService } from '../src/modules/location/location-settlement.service';

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

function buildTxClient(location: any, locationDef?: any) {
  return {
    locationInstance: {
      findFirst: jest.fn().mockResolvedValue(location),
      update: jest.fn().mockResolvedValue({ ...location }),
    },
    locationDefinition: {
      findUnique: jest.fn().mockResolvedValue(locationDef ?? makeLocationDef()),
    },
  };
}

function buildService() {
  return new LocationSettlementService({ } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  it('produces correct amount for 3600 elapsed ticks at 3600 units/h', async () => {
    const service = buildService();
    // 3600 ticks = 1 hour at rate 3600/h.
    // Worker slots defaults to 2; 0 workers → worker multiplier = 50% (5000 bps).
    // Expected production = 3600 * 0.5 = 1800
    const loc = makeLocation({ lastCollectionTick: BigInt(0) });
    const tx = buildTxClient(loc);

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(result.produced[0].resourceId).toBe('soft_arcanium');
    expect(Number(result.produced[0].amount)).toBe(1800);
  });

  it('produces full amount when worker slots = 0 (no worker requirement)', async () => {
    const service = buildService();
    // When maxWorkers = 0, getWorkerMultBps returns BPS_BASE (10000 = 100%)
    const loc = makeLocation({ lastCollectionTick: BigInt(0) });
    const tx = buildTxClient(loc, makeLocationDef({
      rules: { level: { '1': { workers: { slots: 0 } } } },
    }));

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(3600);
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
    // 3600 ticks → 3600 produced, but capacity is only 100
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

  it('reduces production at high threat level (>80 → 50% threat multiplier)', async () => {
    const service = buildService();
    // Use slots=0 so worker multiplier = 100%, isolating the threat multiplier.
    // threat=90 → 50% threat multiplier. 3600 * 1.0 * 0.5 = 1800
    const loc = makeLocation({ threatLevel: 90 });
    const tx = buildTxClient(loc, makeLocationDef({
      rules: { level: { '1': { workers: { slots: 0 } } } },
    }));

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(1800);
  });

  it('reduces production when no workers are assigned (50% base multiplier)', async () => {
    const service = buildService();
    // No workers assigned; worker multiplier formula = 5000 + (0/slots)*5000 = 5000 bps = 50%
    const loc = makeLocation({ workerAssignments: [] });
    const tx = buildTxClient(loc, makeLocationDef({
      rules: { level: { '1': { workers: { slots: 2 } } } },
    }));

    const result = await service.settleLocationTx(tx as any, 'loc-1', 'user-1', BigInt(3600));

    expect(result.produced).toHaveLength(1);
    expect(Number(result.produced[0].amount)).toBe(1800); // 50% of 3600
  });
});
