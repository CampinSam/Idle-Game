/**
 * End-to-end integration test for the PowerGrant / PowerCharge system.
 *
 * Verifies the full pipeline against a real Postgres DB:
 *   1. A PowerDef with chargeConfig { maxChargeUnits: 3 } is seeded.
 *   2. A PowerGrant links an Entity to that PowerDef.
 *   3. TriggerEntityPowerHandler is fired up to the charge limit (3 uses).
 *   4. The 4th trigger is rejected with BadRequestException (Insufficient charges).
 *   5. PowerUseEvent rows exist for every successful use.
 *
 * GlobalPowerService.triggerPower is overridden because setting up
 * BoostEvents + TickRateIntervals for the power-activation side-effect is
 * out of scope here — what we are testing is the grant/charge/deduction
 * pipeline, not the downstream boost scheduler.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GlobalPowerService } from '../../src/modules/global-power/global-power.service';
import { TriggerEntityPowerHandler } from '../../src/modules/commands/handlers/trigger-entity-power.handler';
import { resetDb } from './db-harness';

// ---------------------------------------------------------------------------
// Test harness factory (local — overrides GlobalPowerService)
// ---------------------------------------------------------------------------

interface PowerTestHarness {
  app: INestApplication;
  prisma: PrismaService;
  handler: TriggerEntityPowerHandler;
  resetDb: () => Promise<void>;
  close: () => Promise<void>;
}

async function createPowerHarness(): Promise<PowerTestHarness> {
  const mockGlobalPowerService = {
    triggerPower: jest.fn().mockResolvedValue({ id: 'gap-test-001', label: 'Test Power' }),
    getActivePowers: jest.fn().mockResolvedValue([]),
    getActiveAndScheduledPowers: jest.fn().mockResolvedValue([]),
    getAllPowers: jest.fn().mockResolvedValue([]),
    createPower: jest.fn().mockResolvedValue({ id: 'gap-test-001', label: 'Test Power' }),
    cancelPower: jest.fn().mockResolvedValue({}),
    expireStale: jest.fn().mockResolvedValue(0),
    serializePower: jest.fn().mockResolvedValue({}),
    serialize: jest.fn().mockReturnValue([]),
  };

  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(GlobalPowerService)
    .useValue(mockGlobalPowerService)
    .compile();

  const app = module.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  const handler = app.get(TriggerEntityPowerHandler);

  return {
    app,
    prisma,
    handler,
    resetDb: () => resetDb(prisma),
    close: async () => { await app.close(); },
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedPowerWorld(prisma: PrismaService) {
  // Tick history entry so TickService.getCurrentTick() returns a real number.
  await (prisma as any).tickRateInterval.create({
    data: {
      ticksPerSecond: 1.0,
      effectiveFromTime: new Date('2020-01-01T00:00:00Z'),
      effectiveFromTick: 0,
    },
  });

  // User
  const user = await prisma.user.create({
    data: {
      username: `power-tester-${Math.random().toString(36).slice(2, 8)}`,
      email: `power-${Date.now()}@test.example`,
      passwordHash: 'x',
      keeperLevel: 1,
      keeperXp: BigInt(0),
      flags: {},
    },
  });

  // EntityDefinition (minimal required fields)
  const entityDef = await (prisma as any).entityDefinition.create({
    data: {
      key: `test_species_${Date.now()}`,
      name: 'Test Species',
      speciesId: 'test_species',
      slots: {},
      equipmentSlots: {},
      traits: {},
      rules: {},
      data: {},
      init: { level: 1, stats: {} },
      progression: {},
      ascension: {},
      mastery: {},
    },
  });

  // Entity owned by user
  const entity = await (prisma as any).entity.create({
    data: {
      ownerUserId: user.id,
      definitionId: entityDef.id,
      speciesId: 'test_species',
      display: { name: 'Test Bird' },
      progression: { level: 1, xp: 0 },
      stats: {},
      traits: {},
      archetypeVector: {},
      affinities: {},
      state: { status: 'idle' },
    },
  });

  // PowerDef with 3 charges, cost 1 per use, no recharge
  const powerDef = await (prisma as any).powerDef.create({
    data: {
      key: `test_speed_boost_${Date.now()}`,
      name: 'Test Speed Boost',
      powerType: 'tick_speed_boost',
      defaultValue: 50,
      defaultValueMode: 'percent_add',
      defaultDurationMinutes: 30,
      defaultScope: 'global',
      enabled: true,
      chargeConfig: {
        maxChargeUnits: 3,
        costPerUse: 1,
        initialChargeUnits: 3,
        rechargeRules: [],
      },
    },
  });

  // PowerGrant: links entity to the PowerDef
  const grant = await (prisma as any).powerGrant.create({
    data: {
      targetType: 'entity',
      targetId: entity.id,
      powerKey: powerDef.key,
      powerDefId: powerDef.id,
      overrides: null,
      sourceType: 'admin',
      sourceId: null,
      expiresAt: null,
      remainingChargeUnits: null,
    },
  });

  return { user, entityDef, entity, powerDef, grant };
}

// ---------------------------------------------------------------------------
// Convenience: run handler in its own transaction (mirrors command.service)
// ---------------------------------------------------------------------------

async function fireEntityPower(
  prisma: PrismaService,
  handler: TriggerEntityPowerHandler,
  userId: string,
  entityId: string,
  powerKey: string,
) {
  await prisma.$transaction(
    async (tx) => {
      await handler.execute(
        { userId, tx: tx as any },
        { entityId, powerKey },
      );
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: 'ReadCommitted' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TriggerEntityPowerHandler [integration] — charge system', () => {
  let h: PowerTestHarness;

  beforeAll(async () => {
    h = await createPowerHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  beforeEach(async () => {
    await h.resetDb();
  });

  it('succeeds up to the charge limit and records a PowerUseEvent per use', async () => {
    const { user, entity, powerDef, grant } = await seedPowerWorld(h.prisma);

    // Fire 3 times — should all succeed
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);

    // Exactly 3 PowerUseEvent rows must exist for this grant
    const events = await (h.prisma as any).powerUseEvent.findMany({
      where: { powerGrantId: grant.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(3);
    for (const ev of events) {
      expect(Number(ev.spentUnits)).toBe(1);
      expect(ev.triggerSourceType).toBe('entity');
      expect(ev.triggerSourceId).toBe(entity.id);
      expect(ev.triggeredByUserId).toBe(user.id);
    }
  });

  it('rejects the trigger when charges are exhausted', async () => {
    const { user, entity, powerDef } = await seedPowerWorld(h.prisma);

    // Exhaust all 3 charges
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);

    // 4th attempt must throw BadRequestException (Insufficient charges)
    await expect(
      fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key),
    ).rejects.toThrow(BadRequestException);

    await expect(
      fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key),
    ).rejects.toThrow(/Insufficient charges/i);
  });

  it('charge pool reaches zero after exhaustion and no new events are written', async () => {
    const { user, entity, powerDef, grant } = await seedPowerWorld(h.prisma);

    // Exhaust charges
    for (let i = 0; i < 3; i++) {
      await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    }

    // Attempt one more — should fail
    try {
      await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    } catch {
      // expected
    }

    // Still exactly 3 events — the failed attempt must NOT have written one
    const events = await (h.prisma as any).powerUseEvent.findMany({
      where: { powerGrantId: grant.id },
    });
    expect(events).toHaveLength(3);

    // Charge pool row reflects 0 remaining units
    const usage = await (h.prisma as any).entityPowerUsage.findUnique({
      where: { powerGrantId: grant.id },
    });
    expect(usage).not.toBeNull();
    expect(Number(usage.chargeUnits)).toBe(0);
  });

  it('grant with remainingChargeUnits null (infinite) does not block repeated firing', async () => {
    const { user, entity, powerDef, grant } = await seedPowerWorld(h.prisma);

    // Confirm grant has null remainingChargeUnits (infinite)
    expect(grant.remainingChargeUnits).toBeNull();

    // Fire 3 times without exhaustion issues (limited only by charge pool)
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, powerDef.key);

    // grant.remainingChargeUnits remains null (not decremented when null)
    const updatedGrant = await (h.prisma as any).powerGrant.findUnique({
      where: { id: grant.id },
    });
    expect(updatedGrant.remainingChargeUnits).toBeNull();
  });

  it('grant with finite remainingChargeUnits is decremented on each use', async () => {
    const { user, entity, powerDef } = await seedPowerWorld(h.prisma);

    // Create a separate grant with remainingChargeUnits = 2
    const limitedGrant = await (h.prisma as any).powerGrant.create({
      data: {
        targetType: 'entity',
        targetId: entity.id,
        powerKey: `${powerDef.key}_limited`,
        powerDefId: powerDef.id,
        overrides: { maxChargeUnits: 3, initialChargeUnits: 3 },
        sourceType: 'admin',
        sourceId: null,
        expiresAt: null,
        remainingChargeUnits: 2,
      },
    });

    // Two successful fires
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, `${powerDef.key}_limited`);
    await fireEntityPower(h.prisma, h.handler, user.id, entity.id, `${powerDef.key}_limited`);

    // Grant remainingChargeUnits should now be 0 → grant becomes inactive
    const after = await (h.prisma as any).powerGrant.findUnique({
      where: { id: limitedGrant.id },
    });
    expect(Number(after.remainingChargeUnits)).toBe(0);

    // 3rd attempt: grant is now exhausted (remainingChargeUnits = 0) so
    // findActiveGrant returns null → NotFoundException
    const { NotFoundException } = await import('@nestjs/common');
    await expect(
      fireEntityPower(h.prisma, h.handler, user.id, entity.id, `${powerDef.key}_limited`),
    ).rejects.toThrow(NotFoundException);
  });
});
