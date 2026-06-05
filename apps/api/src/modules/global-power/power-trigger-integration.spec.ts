/**
 * Integration tests for the TriggerEntityPower and TriggerLocationPower command handlers.
 *
 * Unlike the handler unit specs, these tests do NOT mock PowerDefService or
 * GlobalPowerService. Instead they use real service instances backed by a
 * stateful in-memory Prisma substitute, so every step in the
 *   PowerRef → PowerDefService.resolve() → GlobalPowerService.triggerPower() → GlobalActivePower persisted
 * pipeline runs as real code. buildEntityPatch / buildLocationPatches are the only
 * things mocked (they make deep entity-serialisation DB calls unrelated to power
 * triggering and would require a much larger test fixture).
 *
 * Scenarios verified:
 *  - Happy path: a GlobalActivePower row is created after the first trigger
 *  - Daily limit: a second trigger on the same UTC day is rejected without a second row
 *  - Non-existent power key: the handler rejects before reaching GlobalPowerService
 *  - PowerRef with powerDefId: resolve() merges PowerDef defaults (duration, etc.)
 *  - Disabled PowerDef: resolve() throws before triggerPower is reached
 */

import { BadRequestException } from '@nestjs/common';
import { TriggerEntityPowerHandler } from '../commands/handlers/trigger-entity-power.handler';
import { TriggerLocationPowerHandler } from '../commands/handlers/trigger-location-power.handler';
import { GlobalPowerService } from './global-power.service';
import { PowerDefService } from './power-def.service';

jest.mock('../commands/patch-builder', () => {
  const mockPb = {
    upsert: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue([]),
  };
  return {
    PatchBuilder: jest.fn().mockImplementation(() => mockPb),
    buildEntityPatch: jest.fn().mockResolvedValue(undefined),
    buildLocationPatches: jest.fn().mockResolvedValue(undefined),
  };
});

const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Stateful in-memory Prisma factory
// All tables are plain Maps; keys follow Prisma's compound-key convention.
// ---------------------------------------------------------------------------
function makeInMemoryPrisma() {
  const globalActivePowers = new Map<string, any>();
  const entityPowerUsages = new Map<string, any>();
  const locationPowerUsages = new Map<string, any>();
  const boostEvents = new Map<string, any>();
  let seq = 1;
  const nextId = (prefix = 'rec') => `${prefix}-${seq++}`;

  // powerDef lookup — seeded per-test via seedPowerDef()
  const powerDefStore = new Map<string, any>();

  return {
    _tables: { globalActivePowers, entityPowerUsages, locationPowerUsages, boostEvents },

    // Helper: seed a PowerDef row for a test that needs one
    _seedPowerDef: (def: any) => powerDefStore.set(def.id, def),

    // PowerDef table
    powerDef: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(powerDefStore.get(where.id) ?? null),
      ),
    },

    // GlobalActivePower table
    globalActivePower: {
      create: jest.fn((args: any) => {
        const id = nextId('gap');
        const record = { id, ...args.data };
        globalActivePowers.set(id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn((args: any) => {
        const { where } = args;
        for (const p of globalActivePowers.values()) {
          let match = true;
          if (where.status && p.status !== where.status) match = false;
          if (where.effectDefId !== undefined && p.effectDefId !== where.effectDefId) match = false;
          if (where.endTime?.gt && !(p.endTime > where.endTime.gt)) match = false;
          if (match) return Promise.resolve(p);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn((args: any) => {
        const { where } = (args as any) ?? {};
        const results = [...globalActivePowers.values()].filter((p) => {
          if (!where) return true;
          if (where.status && p.status !== where.status) return false;
          return true;
        });
        if ((args as any)?.orderBy?.startTime === 'desc') {
          results.sort((a, b) => (b.startTime as any) - (a.startTime as any));
        }
        return Promise.resolve(results);
      }),
      update: jest.fn((args: any) => {
        const p = globalActivePowers.get(args.where.id);
        if (!p) return Promise.resolve(null);
        Object.assign(p, args.data);
        return Promise.resolve(p);
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },

    // EntityPowerUsage table (compound key: entityId_powerKey)
    entityPowerUsage: {
      findUnique: jest.fn((args: any) => {
        const { entityId, powerKey } = args.where.entityId_powerKey;
        return Promise.resolve(entityPowerUsages.get(`${entityId}:${powerKey}`) ?? null);
      }),
      create: jest.fn((args: any) => {
        const { entityId, powerKey } = args.data;
        const record = { ...args.data };
        entityPowerUsages.set(`${entityId}:${powerKey}`, record);
        return Promise.resolve(record);
      }),
      update: jest.fn((args: any) => {
        const { entityId, powerKey } = args.where.entityId_powerKey;
        const key = `${entityId}:${powerKey}`;
        const existing = entityPowerUsages.get(key) ?? {};
        const updated = { ...existing };
        if (typeof args.data.usageCount?.increment === 'number') {
          updated.usageCount = (existing.usageCount ?? 0) + args.data.usageCount.increment;
        }
        if (args.data.lastUsedUtcDay !== undefined) updated.lastUsedUtcDay = args.data.lastUsedUtcDay;
        if (args.data.usageCount !== undefined && typeof args.data.usageCount !== 'object') {
          updated.usageCount = args.data.usageCount;
        }
        entityPowerUsages.set(key, updated);
        return Promise.resolve(updated);
      }),
      findMany: jest.fn((args: any) => {
        const { where } = (args as any) ?? {};
        const results = [...entityPowerUsages.values()].filter((u) => {
          if (where?.entityId && u.entityId !== where.entityId) return false;
          if (where?.lastUsedUtcDay && u.lastUsedUtcDay !== where.lastUsedUtcDay) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
    },

    // LocationPowerUsage table (compound key: locationInstanceId_powerKey)
    locationPowerUsage: {
      findUnique: jest.fn((args: any) => {
        const { locationInstanceId, powerKey } = args.where.locationInstanceId_powerKey;
        return Promise.resolve(locationPowerUsages.get(`${locationInstanceId}:${powerKey}`) ?? null);
      }),
      create: jest.fn((args: any) => {
        const { locationInstanceId, powerKey } = args.data;
        const record = { ...args.data };
        locationPowerUsages.set(`${locationInstanceId}:${powerKey}`, record);
        return Promise.resolve(record);
      }),
      update: jest.fn((args: any) => {
        const { locationInstanceId, powerKey } = args.where.locationInstanceId_powerKey;
        const key = `${locationInstanceId}:${powerKey}`;
        const existing = locationPowerUsages.get(key) ?? {};
        const updated = { ...existing };
        if (typeof args.data.usageCount?.increment === 'number') {
          updated.usageCount = (existing.usageCount ?? 0) + args.data.usageCount.increment;
        }
        if (args.data.lastUsedUtcDay !== undefined) updated.lastUsedUtcDay = args.data.lastUsedUtcDay;
        if (args.data.usageCount !== undefined && typeof args.data.usageCount !== 'object') {
          updated.usageCount = args.data.usageCount;
        }
        locationPowerUsages.set(key, updated);
        return Promise.resolve(updated);
      }),
      findMany: jest.fn((args: any) => {
        const { where } = (args as any) ?? {};
        const results = [...locationPowerUsages.values()].filter((u) => {
          if (where?.locationInstanceId && u.locationInstanceId !== where.locationInstanceId) return false;
          if (where?.lastUsedUtcDay && u.lastUsedUtcDay !== where.lastUsedUtcDay) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
    },

    // BoostEvent table — used by GlobalPowerService for tick_speed_boost
    boostEvent: {
      create: jest.fn((args: any) => {
        const id = nextId('be');
        const record = { id, ...args.data };
        boostEvents.set(id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn(() => Promise.resolve(null)),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(() => Promise.resolve({})),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },

    // TickRateInterval — used when applying tick boost; returning empty set is safe
    tickRateInterval: {
      findFirst: jest.fn(() => Promise.resolve(null)),
      findMany: jest.fn(() => Promise.resolve([])),
      create: jest.fn((args: any) => Promise.resolve({ id: nextId('tri'), ...args.data })),
    },

    // EffectDef — not needed for tick_speed_boost; stub prevents runtime errors
    effectDef: {
      findFirst: jest.fn(() => Promise.resolve(null)),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
  };
}

// ---------------------------------------------------------------------------
// No-op PubSubService stub
// ---------------------------------------------------------------------------
const stubPubSub: any = {
  publishBroadcast: jest.fn(),
  publish: jest.fn(),
};

// ---------------------------------------------------------------------------
// Entity & location fixture builders
// ---------------------------------------------------------------------------
function entityWithPowerRef(powerRefs: any[], nftAssetId = 'nft-001') {
  return {
    id: 'ent-1',
    ownerUserId: 'user-1',
    nftAssetId,
    speciesId: 'phoenix',
    display: { name: 'Ember' },
    definition: {
      rules: { uniques: { [nftAssetId]: { powers: powerRefs } } },
    },
    equipment: [],
  };
}

function locationWithPowerRef(powerRefs: any[], nftAssetId = 'nft-loc-001') {
  return {
    id: 'loc-1',
    ownerUserId: 'user-1',
    nftAssetId,
    name: 'Ember Outpost',
    definition: {
      id: 'outpost_alpha',
      rules: { uniques: { [nftAssetId]: { powers: powerRefs } } },
    },
  };
}

function makeTxForEntity(entity: any): any {
  return {
    entity: { findUnique: jest.fn().mockResolvedValue(entity) },
    user: { findUnique: jest.fn().mockResolvedValue({ flags: {} }) },
  };
}

function makeTxForLocation(location: any): any {
  return {
    locationInstance: { findUnique: jest.fn().mockResolvedValue(location) },
    user: { findUnique: jest.fn().mockResolvedValue({ flags: {} }) },
  };
}

// ---------------------------------------------------------------------------
// Entity power — integration suite
// ---------------------------------------------------------------------------
describe('TriggerEntityPowerHandler — integration (real PowerDefService + GlobalPowerService)', () => {
  function makeEntitySetup(powerRefs: any[] = [{ key: 'tick_speed_boost', name: 'World Speed Boost' }]) {
    const prisma = makeInMemoryPrisma();
    const powerDefService = new PowerDefService(prisma as any);
    const globalPowerService = new GlobalPowerService(prisma as any, stubPubSub);
    const handler = new TriggerEntityPowerHandler(prisma as any, globalPowerService, powerDefService);

    const entity = entityWithPowerRef(powerRefs);
    const tx = makeTxForEntity(entity);
    const ctx: any = { userId: 'user-1', tx };

    return { handler, ctx, prisma };
  }

  it('happy path: creates a GlobalActivePower row on the first trigger', async () => {
    const { handler, ctx, prisma } = makeEntitySetup();

    const result = await handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' });

    // The real GlobalPowerService.createPower() must have persisted a record
    expect(prisma.globalActivePower.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.globalActivePower.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      status: 'active',
      durationMinutes: expect.any(Number),
      triggeredByUserId: 'user-1',
    });

    // In-memory store must contain the record
    expect(prisma._tables.globalActivePowers.size).toBe(1);

    // A usage row must also have been persisted
    expect(prisma.entityPowerUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'ent-1',
          powerKey: 'tick_speed_boost',
          lastUsedUtcDay: TODAY,
          usageCount: 1,
        }),
      }),
    );

    expect(result.ui).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'toast', tone: 'success' })]),
    );
  });

  it('daily limit: second trigger on the same UTC day is rejected; no second GlobalActivePower created', async () => {
    const { handler, ctx, prisma } = makeEntitySetup();

    // First trigger — must succeed and persist one GlobalActivePower row
    await handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' });
    expect(prisma._tables.globalActivePowers.size).toBe(1);

    // Refresh tx so entity lookup succeeds again on the second call
    ctx.tx = makeTxForEntity(entityWithPowerRef([{ key: 'tick_speed_boost', name: 'World Speed Boost' }]));

    // Second trigger on same day — daily limit is 1 → must throw BadRequestException
    await expect(
      handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);

    // Still exactly one GlobalActivePower row — no second activation occurred
    expect(prisma._tables.globalActivePowers.size).toBe(1);
    expect(prisma.globalActivePower.create).toHaveBeenCalledTimes(1);
  });

  it('non-existent power key: rejects before GlobalPowerService is reached', async () => {
    const { handler, ctx, prisma } = makeEntitySetup([{ key: 'some_other_power', name: 'Other' }]);

    await expect(
      handler.execute(ctx, { entityId: 'ent-1', powerKey: 'nonexistent_key' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.globalActivePower.create).not.toHaveBeenCalled();
    expect(prisma._tables.globalActivePowers.size).toBe(0);
  });

  it('PowerRef with powerDefId: resolve() fetches the PowerDef and merges its default durationMinutes', async () => {
    const { handler, ctx, prisma } = makeEntitySetup([
      { key: 'tick_speed_boost', name: 'Boosted Speed', powerDefId: 'pd_tick' },
    ]);

    // Seed the PowerDef so resolve() can look it up
    prisma._seedPowerDef({
      id: 'pd_tick',
      enabled: true,
      powerType: 'tick_speed_boost',
      effectDefId: null,
      defaultValue: 75,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 45,
      defaultDailyLimit: 2,
      defaultScope: 'global',
      selection: null,
    });

    await handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' });

    // The PowerDef's defaultDurationMinutes (45) must flow through to the persisted record
    const createArg = prisma.globalActivePower.create.mock.calls[0][0];
    expect(createArg.data.durationMinutes).toBe(45);
  });

  it('disabled PowerDef: resolve() throws BadRequestException before triggerPower is reached', async () => {
    const { handler, ctx, prisma } = makeEntitySetup([
      { key: 'tick_speed_boost', name: 'Disabled Speed', powerDefId: 'pd_disabled' },
    ]);

    prisma._seedPowerDef({ id: 'pd_disabled', enabled: false, powerType: 'tick_speed_boost' });

    await expect(
      handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.globalActivePower.create).not.toHaveBeenCalled();
  });

  it('missing PowerDef referenced by powerDefId: resolve() throws NotFoundException', async () => {
    const { handler, ctx, prisma } = makeEntitySetup([
      { key: 'tick_speed_boost', name: 'Orphan Power', powerDefId: 'pd_missing' },
    ]);

    // powerDefStore has no record for 'pd_missing'
    await expect(
      handler.execute(ctx, { entityId: 'ent-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow();

    expect(prisma.globalActivePower.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Location power — integration suite
// ---------------------------------------------------------------------------
describe('TriggerLocationPowerHandler — integration (real PowerDefService + GlobalPowerService)', () => {
  function makeLocationSetup(powerRefs: any[] = [{ key: 'tick_speed_boost', name: 'Outpost Boost' }]) {
    const prisma = makeInMemoryPrisma();
    const powerDefService = new PowerDefService(prisma as any);
    const globalPowerService = new GlobalPowerService(prisma as any, stubPubSub);
    const handler = new TriggerLocationPowerHandler(prisma as any, globalPowerService, powerDefService);

    const location = locationWithPowerRef(powerRefs);
    const tx = makeTxForLocation(location);
    const ctx: any = { userId: 'user-1', tx };

    return { handler, ctx, prisma };
  }

  it('happy path: creates a GlobalActivePower row on the first trigger', async () => {
    const { handler, ctx, prisma } = makeLocationSetup();

    const result = await handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' });

    expect(prisma.globalActivePower.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.globalActivePower.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      status: 'active',
      durationMinutes: expect.any(Number),
      triggeredByUserId: 'user-1',
    });

    expect(prisma._tables.globalActivePowers.size).toBe(1);

    expect(prisma.locationPowerUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationInstanceId: 'loc-1',
          powerKey: 'tick_speed_boost',
          lastUsedUtcDay: TODAY,
          usageCount: 1,
        }),
      }),
    );

    expect(result.ui).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'toast', tone: 'success' })]),
    );
  });

  it('daily limit: second trigger on same UTC day is rejected; no second GlobalActivePower created', async () => {
    const { handler, ctx, prisma } = makeLocationSetup();

    await handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' });
    expect(prisma._tables.globalActivePowers.size).toBe(1);

    // Refresh tx for second call
    ctx.tx = makeTxForLocation(
      locationWithPowerRef([{ key: 'tick_speed_boost', name: 'Outpost Boost' }]),
    );

    await expect(
      handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma._tables.globalActivePowers.size).toBe(1);
    expect(prisma.globalActivePower.create).toHaveBeenCalledTimes(1);
  });

  it('non-existent power key: rejects before GlobalPowerService is reached', async () => {
    const { handler, ctx, prisma } = makeLocationSetup([{ key: 'other_power', name: 'Other' }]);

    await expect(
      handler.execute(ctx, { locationId: 'loc-1', powerKey: 'nonexistent_key' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.globalActivePower.create).not.toHaveBeenCalled();
    expect(prisma._tables.globalActivePowers.size).toBe(0);
  });

  it('PowerRef with powerDefId: resolve() fetches the PowerDef and merges its default durationMinutes', async () => {
    const { handler, ctx, prisma } = makeLocationSetup([
      { key: 'tick_speed_boost', name: 'Def-backed Boost', powerDefId: 'pd_loc_tick' },
    ]);

    prisma._seedPowerDef({
      id: 'pd_loc_tick',
      enabled: true,
      powerType: 'tick_speed_boost',
      effectDefId: null,
      defaultValue: 30,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 90,
      defaultDailyLimit: 3,
      defaultScope: 'global',
      selection: null,
    });

    await handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' });

    const createArg = prisma.globalActivePower.create.mock.calls[0][0];
    expect(createArg.data.durationMinutes).toBe(90);
  });

  it('usage counter increments on a second same-day trigger when daily limit allows it', async () => {
    // dailyLimit = 3 inline on the PowerRef
    const powerRefs = [{ key: 'tick_speed_boost', name: 'Multi-use Boost', dailyLimit: 3 }];
    const { handler, ctx, prisma } = makeLocationSetup(powerRefs);

    await handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' });

    // Refresh tx for second call
    ctx.tx = makeTxForLocation(locationWithPowerRef(powerRefs));

    await handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' });

    // tick_speed_boost stacking is allowed, so two GlobalActivePower rows created
    expect(prisma.globalActivePower.create).toHaveBeenCalledTimes(2);

    // Usage counter must have been incremented to 2 in the in-memory store
    const usageRow = prisma._tables.locationPowerUsages.get('loc-1:tick_speed_boost');
    expect(usageRow.usageCount).toBe(2);
    expect(usageRow.lastUsedUtcDay).toBe(TODAY);
  });

  it('disabled PowerDef: resolve() throws before triggerPower is reached', async () => {
    const { handler, ctx, prisma } = makeLocationSetup([
      { key: 'tick_speed_boost', name: 'Disabled', powerDefId: 'pd_off' },
    ]);

    prisma._seedPowerDef({ id: 'pd_off', enabled: false, powerType: 'tick_speed_boost' });

    await expect(
      handler.execute(ctx, { locationId: 'loc-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.globalActivePower.create).not.toHaveBeenCalled();
  });
});
