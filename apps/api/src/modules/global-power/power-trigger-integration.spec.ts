/**
 * Integration tests for the PowerGrant → TriggerEntityPower / TriggerLocationPower pipeline.
 *
 * These tests use real service instances (PowerGrantService, PowerChargeService,
 * PowerDefService, GlobalPowerService) backed by a stateful in-memory Prisma substitute.
 * buildEntityPatch / buildLocationPatches are mocked (deep entity-serialisation DB calls).
 *
 * Scenarios verified:
 *  - Happy path: grant exists → trigger fires → charge deducted → PowerUseEvent created
 *  - No grant: NotFoundException before reaching GlobalPowerService
 *  - Insufficient charges: BadRequestException, GlobalPowerService NOT called
 *  - Grant with powerDefId: resolve() merges PowerDef defaults
 *  - Disabled PowerDef: BadRequestException from resolve()
 *  - Location power happy path
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TriggerEntityPowerHandler } from '../commands/handlers/trigger-entity-power.handler';
import { TriggerLocationPowerHandler } from '../commands/handlers/trigger-location-power.handler';
import { GlobalPowerService } from './global-power.service';
import { PowerDefService } from './power-def.service';
import { PowerGrantService } from './power-grant.service';
import { PowerChargeService } from './power-charge.service';

jest.mock('../commands/patch-builder', () => {
  const mockPb = {
    upsert: jest.fn().mockReturnThis(),
    upsertNotification: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue([]),
  };
  return {
    PatchBuilder: jest.fn().mockImplementation(() => mockPb),
    buildEntityPatch: jest.fn().mockResolvedValue(undefined),
    buildLocationPatches: jest.fn().mockResolvedValue(undefined),
  };
});

// ---------------------------------------------------------------------------
// Stateful in-memory Prisma factory
// ---------------------------------------------------------------------------
function makeInMemoryPrisma() {
  const globalActivePowers = new Map<string, any>();
  const powerGrants = new Map<string, any>();
  const powerDefs = new Map<string, any>();
  const entityPowerUsages = new Map<string, any>();
  const locationPowerUsages = new Map<string, any>();
  const powerUseEvents: any[] = [];
  const boostEvents = new Map<string, any>();
  let seq = 1;
  const nextId = (prefix = 'rec') => `${prefix}-${seq++}`;

  return {
    _tables: { globalActivePowers, powerGrants, powerDefs, entityPowerUsages, locationPowerUsages, powerUseEvents },

    _seedPowerDef: (def: any) => {
      powerDefs.set(def.id, def);
      powerDefs.set(def.key, def);
    },
    _seedPowerGrant: (grant: any) => { powerGrants.set(grant.id, grant); },
    _seedEntityUsage: (usage: any) => { entityPowerUsages.set(usage.powerGrantId, usage); },
    _seedLocationUsage: (usage: any) => { locationPowerUsages.set(usage.powerGrantId, usage); },

    powerDef: {
      findFirst: jest.fn((args: any) => {
        const { where } = args ?? {};
        if (where?.OR) {
          for (const cond of where.OR) {
            if (cond.id && powerDefs.has(cond.id)) return Promise.resolve(powerDefs.get(cond.id));
            if (cond.key && powerDefs.has(cond.key)) return Promise.resolve(powerDefs.get(cond.key));
          }
        }
        return Promise.resolve(null);
      }),
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(powerDefs.get(args.where.id) ?? null);
      }),
    },

    effectDef: {
      findFirst: jest.fn(({ where }: any) => {
        const id = where?.OR?.[0]?.id ?? where?.OR?.[1]?.key;
        return Promise.resolve(id ? { id } : null);
      }),
    },

    powerGrant: {
      findFirst: jest.fn((args: any) => {
        const { where } = args;
        const now = new Date();
        for (const g of powerGrants.values()) {
          let match = true;
          if (where.targetType && g.targetType !== where.targetType) match = false;
          if (where.targetId && g.targetId !== where.targetId) match = false;
          if (where.powerKey && g.powerKey !== where.powerKey) match = false;
          if (where.AND) {
            for (const cond of where.AND) {
              if (cond.OR) {
                const expOk = cond.OR.some((c: any) =>
                  (c.expiresAt === null && g.expiresAt == null) ||
                  (c.expiresAt?.gt && g.expiresAt != null && new Date(g.expiresAt) > now),
                );
                if (!expOk) match = false;
              }
              if (cond.NOT?.remainingChargeUnits !== undefined) {
                if (g.remainingChargeUnits === cond.NOT.remainingChargeUnits) match = false;
              }
            }
          }
          if (match) {
            const result = { ...g };
            if (g.powerDefId) result.powerDef = powerDefs.get(g.powerDefId) ?? null;
            else result.powerDef = null;
            if (args.include?.powerDef !== undefined && !args.include.powerDef) delete result.powerDef;
            return Promise.resolve(result);
          }
        }
        return Promise.resolve(null);
      }),
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(powerGrants.get(args.where.id) ?? null);
      }),
      update: jest.fn((args: any) => {
        const g = powerGrants.get(args.where.id);
        if (g) Object.assign(g, args.data);
        return Promise.resolve(g ?? null);
      }),
    },

    entityPowerUsage: {
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(entityPowerUsages.get(args.where.powerGrantId) ?? null);
      }),
      create: jest.fn((args: any) => {
        const record = { id: nextId('epu'), ...args.data };
        entityPowerUsages.set(record.powerGrantId, record);
        return Promise.resolve(record);
      }),
      update: jest.fn((args: any) => {
        const u = entityPowerUsages.get(args.where.id) ??
          [...entityPowerUsages.values()].find((x) => x.id === args.where.id);
        if (u) Object.assign(u, args.data);
        return Promise.resolve(u ?? null);
      }),
    },

    locationPowerUsage: {
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(locationPowerUsages.get(args.where.powerGrantId) ?? null);
      }),
      create: jest.fn((args: any) => {
        const record = { id: nextId('lpu'), ...args.data };
        locationPowerUsages.set(record.powerGrantId, record);
        return Promise.resolve(record);
      }),
      update: jest.fn((args: any) => {
        const u = locationPowerUsages.get(args.where.id) ??
          [...locationPowerUsages.values()].find((x) => x.id === args.where.id);
        if (u) Object.assign(u, args.data);
        return Promise.resolve(u ?? null);
      }),
    },

    powerUseEvent: {
      create: jest.fn((args: any) => {
        const record = { id: nextId('pue'), ...args.data };
        powerUseEvents.push(record);
        return Promise.resolve(record);
      }),
      // Used by checkCooldown: find most recent event for a grant.
      findFirst: jest.fn((args: any) => {
        const { where, orderBy } = args ?? {};
        let results = [...powerUseEvents];
        if (where?.powerGrantId) {
          results = results.filter((e) => e.powerGrantId === where.powerGrantId);
        }
        if (orderBy?.triggeredAtTick === 'desc') {
          results.sort((a, b) => Number(BigInt(b.triggeredAtTick) - BigInt(a.triggeredAtTick)));
        }
        return Promise.resolve(results[0] ?? null);
      }),
      // Used by checkRateLimits: count events in a sliding window.
      count: jest.fn((args: any) => {
        const { where } = args ?? {};
        let results = [...powerUseEvents];
        if (where?.powerGrantId) {
          results = results.filter((e) => e.powerGrantId === where.powerGrantId);
        }
        if (where?.triggeredAtTick?.gte !== undefined) {
          results = results.filter((e) => BigInt(e.triggeredAtTick) >= BigInt(where.triggeredAtTick.gte));
        }
        return Promise.resolve(results.length);
      }),
    },

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
        return Promise.resolve(results);
      }),
      update: jest.fn((args: any) => {
        const p = globalActivePowers.get(args.where.id);
        if (p) Object.assign(p, args.data);
        return Promise.resolve(p ?? null);
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },

    boostEvent: {
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: any) => {
        const id = nextId('be');
        const record = { id, ...args.data };
        boostEvents.set(id, record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(() => Promise.resolve(null)),
    },

    tickRateInterval: {
      findMany: jest.fn(() => Promise.resolve([])),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: any) => Promise.resolve({ id: nextId('tri'), ...args.data })),
      update: jest.fn((args: any) => Promise.resolve(args.data)),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
}

// ---------------------------------------------------------------------------
// Shared entity / location test fixtures
// ---------------------------------------------------------------------------
const ENTITY_ID = 'entity-1';
const LOCATION_ID = 'loc-1';
const USER_ID = 'user-1';
const NFT_ASSET_ID = 'asset-001';

const BASE_ENTITY = {
  id: ENTITY_ID,
  ownerUserId: USER_ID,
  nftAssetId: NFT_ASSET_ID,
  speciesId: 'dragon',
  display: { name: 'Spark' },
  definition: { rules: {} },
  equipment: [],
};

const BASE_LOCATION = {
  id: LOCATION_ID,
  ownerUserId: USER_ID,
  nftAssetId: NFT_ASSET_ID,
  name: 'Unique Outpost',
  definition: { rules: {}, id: 'outpost_forest' },
};

/**
 * Build the transaction context by spreading the in-memory prisma delegates
 * and then overriding entity/locationInstance/user with per-test mocks.
 * This ensures ctx.tx has all model delegates (powerGrant, entityPowerUsage,
 * powerUseEvent, etc.) that the handlers and services call through ctx.tx.
 */
function makeTx(prisma: any, entityOverride?: any, locationOverride?: any, isAdmin = false) {
  return {
    ...prisma,
    entity: { findUnique: jest.fn().mockResolvedValue(entityOverride ?? BASE_ENTITY) },
    locationInstance: { findUnique: jest.fn().mockResolvedValue(locationOverride ?? BASE_LOCATION) },
    user: { findUnique: jest.fn().mockResolvedValue({ flags: isAdmin ? { isAdmin: true } : {} }) },
  };
}

function buildEntityHandler(prisma: any) {
  const pubsub: any = { publish: jest.fn(), publishBroadcast: jest.fn() };
  const powerDefService = new PowerDefService(prisma as any);
  const globalPowerService = new GlobalPowerService(prisma as any, pubsub);
  const powerGrantService = new PowerGrantService(prisma as any);
  const powerChargeService: any = new (PowerChargeService as any)();
  const tickService: any = { getCurrentTick: jest.fn().mockResolvedValue(100) };
  const notificationService: any = {
    createForCommandSilent: jest.fn().mockResolvedValue({ id: 'n-1', type: 'power_activated', category: 'system', priority: 'normal', title: '', body: '', readAt: null, dismissedAt: null, createdAt: new Date().toISOString() }),
  };
  return new TriggerEntityPowerHandler(
    prisma as any, globalPowerService, powerDefService, powerGrantService, powerChargeService, tickService, notificationService,
  );
}

function buildLocationHandler(prisma: any) {
  const pubsub: any = { publish: jest.fn(), publishBroadcast: jest.fn() };
  const powerDefService = new PowerDefService(prisma as any);
  const globalPowerService = new GlobalPowerService(prisma as any, pubsub);
  const powerGrantService = new PowerGrantService(prisma as any);
  const powerChargeService: any = new (PowerChargeService as any)();
  const tickService: any = { getCurrentTick: jest.fn().mockResolvedValue(100) };
  const notificationService: any = {
    createForCommandSilent: jest.fn().mockResolvedValue({ id: 'n-1', type: 'power_activated', category: 'system', priority: 'normal', title: '', body: '', readAt: null, dismissedAt: null, createdAt: new Date().toISOString() }),
  };
  return new TriggerLocationPowerHandler(
    prisma as any, globalPowerService, powerDefService, powerGrantService, powerChargeService, tickService, notificationService,
  );
}

// ---------------------------------------------------------------------------
// Entity power tests
// ---------------------------------------------------------------------------
describe('TriggerEntityPower — integration (real services, in-memory DB)', () => {
  it('happy path: grant active + charge available → GlobalActivePower created + charge deducted', async () => {
    const prisma = makeInMemoryPrisma();
    prisma._seedPowerGrant({
      id: 'grant-1',
      targetType: 'entity',
      targetId: ENTITY_ID,
      powerKey: 'tick_speed_boost',
      powerDefId: null,
      overrides: { name: 'Tick Boost', value: 50, valueMode: 'percent_add', durationMinutes: 30 },
      sourceType: 'nft_unique',
      sourceId: NFT_ASSET_ID,
      expiresAt: null,
      remainingChargeUnits: null,
    });
    prisma._seedEntityUsage({
      id: 'usage-1',
      entityId: ENTITY_ID,
      powerGrantId: 'grant-1',
      chargeUnits: 1,
      lastChargeAppliedAt: null,
    });

    const handler = buildEntityHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    const result = await handler.execute(ctx as any, { entityId: ENTITY_ID, powerKey: 'tick_speed_boost' });

    expect(result.patches).toBeDefined();
    expect(prisma._tables.globalActivePowers.size).toBe(1);
    expect(prisma._tables.powerUseEvents).toHaveLength(1);

    const usage = prisma._tables.entityPowerUsages.get('grant-1');
    expect(usage.chargeUnits).toBe(0);
  });

  it('no grant → NotFoundException before reaching GlobalPowerService', async () => {
    const prisma = makeInMemoryPrisma();
    const handler = buildEntityHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    await expect(
      handler.execute(ctx as any, { entityId: ENTITY_ID, powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma._tables.globalActivePowers.size).toBe(0);
    expect(prisma._tables.powerUseEvents).toHaveLength(0);
  });

  it('charge exhausted → BadRequestException, GlobalPowerService NOT called', async () => {
    const prisma = makeInMemoryPrisma();
    prisma._seedPowerGrant({
      id: 'grant-1',
      targetType: 'entity',
      targetId: ENTITY_ID,
      powerKey: 'tick_speed_boost',
      powerDefId: null,
      overrides: { name: 'Tick Boost', value: 50, valueMode: 'percent_add', durationMinutes: 30 },
      sourceType: 'nft_unique',
      sourceId: NFT_ASSET_ID,
      expiresAt: null,
      remainingChargeUnits: null,
    });
    prisma._seedEntityUsage({
      id: 'usage-1',
      entityId: ENTITY_ID,
      powerGrantId: 'grant-1',
      chargeUnits: 0,
      lastChargeAppliedAt: null,
    });

    const handler = buildEntityHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    await expect(
      handler.execute(ctx as any, { entityId: ENTITY_ID, powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma._tables.globalActivePowers.size).toBe(0);
    expect(prisma._tables.powerUseEvents).toHaveLength(0);
  });

  it('grant with powerDefId → resolves duration from PowerDef', async () => {
    const prisma = makeInMemoryPrisma();
    prisma._seedPowerDef({
      id: 'pd-1',
      key: 'tick_speed_boost',
      name: 'Tick Boost',
      powerType: 'tick_speed_boost',
      effectDefId: null,
      defaultValue: 60,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 45,
      chargeConfig: { maxChargeUnits: 2, costPerUse: 1, initialChargeUnits: 2, rechargeRules: [] },
      defaultScope: 'global',
      selection: null,
      enabled: true,
    });
    prisma._seedPowerGrant({
      id: 'grant-1',
      targetType: 'entity',
      targetId: ENTITY_ID,
      powerKey: 'tick_speed_boost',
      powerDefId: 'pd-1',
      overrides: null,
      sourceType: 'nft_unique',
      sourceId: NFT_ASSET_ID,
      expiresAt: null,
      remainingChargeUnits: null,
    });
    prisma._seedEntityUsage({
      id: 'usage-1',
      entityId: ENTITY_ID,
      powerGrantId: 'grant-1',
      chargeUnits: 2,
      lastChargeAppliedAt: null,
    });

    const handler = buildEntityHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    const result = await handler.execute(ctx as any, { entityId: ENTITY_ID, powerKey: 'tick_speed_boost' });

    expect(result.patches).toBeDefined();
    const gap = [...prisma._tables.globalActivePowers.values()][0];
    expect(gap).toBeDefined();
    // durationMinutes 45 → endTime should be ~45 min from now
    const durationMs = gap.endTime - gap.startTime;
    expect(durationMs).toBeCloseTo(45 * 60 * 1000, -4);
  });

  it('disabled PowerDef → BadRequestException from resolve()', async () => {
    const prisma = makeInMemoryPrisma();
    prisma._seedPowerDef({
      id: 'pd-disabled',
      key: 'disabled_power',
      name: 'Disabled Power',
      powerType: 'tick_speed_boost',
      effectDefId: null,
      defaultValue: 50,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 30,
      chargeConfig: null,
      defaultScope: 'global',
      selection: null,
      enabled: false,
    });
    prisma._seedPowerGrant({
      id: 'grant-disabled',
      targetType: 'entity',
      targetId: ENTITY_ID,
      powerKey: 'disabled_power',
      powerDefId: 'pd-disabled',
      overrides: null,
      sourceType: 'nft_unique',
      sourceId: NFT_ASSET_ID,
      expiresAt: null,
      remainingChargeUnits: null,
    });
    prisma._seedEntityUsage({
      id: 'usage-d',
      entityId: ENTITY_ID,
      powerGrantId: 'grant-disabled',
      chargeUnits: 1,
      lastChargeAppliedAt: null,
    });

    const handler = buildEntityHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    await expect(
      handler.execute(ctx as any, { entityId: ENTITY_ID, powerKey: 'disabled_power' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma._tables.globalActivePowers.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Location power tests
// ---------------------------------------------------------------------------
describe('TriggerLocationPower — integration (real services, in-memory DB)', () => {
  it('happy path: grant active + charge available → GlobalActivePower created + charge deducted', async () => {
    const prisma = makeInMemoryPrisma();
    prisma._seedPowerGrant({
      id: 'lgrant-1',
      targetType: 'location',
      targetId: LOCATION_ID,
      powerKey: 'tick_speed_boost',
      powerDefId: null,
      overrides: { name: 'Location Boost', value: 25, valueMode: 'percent_add', durationMinutes: 20 },
      sourceType: 'nft_unique',
      sourceId: NFT_ASSET_ID,
      expiresAt: null,
      remainingChargeUnits: null,
    });
    prisma._seedLocationUsage({
      id: 'lusage-1',
      locationInstanceId: LOCATION_ID,
      powerGrantId: 'lgrant-1',
      chargeUnits: 1,
      lastChargeAppliedAt: null,
    });

    const handler = buildLocationHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    const result = await handler.execute(ctx as any, { locationId: LOCATION_ID, powerKey: 'tick_speed_boost' });

    expect(result.patches).toBeDefined();
    expect(prisma._tables.globalActivePowers.size).toBe(1);
    expect(prisma._tables.powerUseEvents).toHaveLength(1);

    const usage = prisma._tables.locationPowerUsages.get('lgrant-1');
    expect(usage.chargeUnits).toBe(0);
  });

  it('no grant → NotFoundException', async () => {
    const prisma = makeInMemoryPrisma();
    const handler = buildLocationHandler(prisma);
    const tx = makeTx(prisma);
    const ctx = { userId: USER_ID, tx };

    await expect(
      handler.execute(ctx as any, { locationId: LOCATION_ID, powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(NotFoundException);
  });
});
