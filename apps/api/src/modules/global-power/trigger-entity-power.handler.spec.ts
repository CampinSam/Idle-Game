import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TriggerEntityPowerHandler } from '../commands/handlers/trigger-entity-power.handler';

jest.mock('../commands/patch-builder', () => {
  const mockPb = {
    upsert: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue([]),
  };
  return {
    PatchBuilder: jest.fn().mockImplementation(() => mockPb),
    buildEntityPatch: jest.fn().mockResolvedValue(undefined),
  };
});

const TODAY = new Date().toISOString().slice(0, 10);

function makeResolved(overrides: Record<string, any> = {}) {
  return {
    key: 'tick_speed_boost',
    name: 'World Speed Boost',
    powerType: 'tick_speed_boost',
    effectDefId: null,
    effectOverrides: undefined,
    value: 50,
    valueMode: 'percent_add',
    durationMinutes: 30,
    dailyLimit: 1,
    scope: 'global',
    selection: undefined,
    ...overrides,
  };
}

function makeEntity(powerRefs: any[] = [makeDefaultPowerRef()], nftAssetId = 'asset-001') {
  return {
    id: 'entity-1',
    ownerUserId: 'user-1',
    nftAssetId,
    speciesId: 'dragon',
    display: { name: 'Spark' },
    definition: {
      rules: {
        uniques: {
          [nftAssetId]: { powers: powerRefs },
        },
      },
    },
    equipment: [],
  };
}

function makeDefaultPowerRef() {
  return { key: 'tick_speed_boost', name: 'World Speed Boost', powerDefId: undefined };
}

function makeFakes(options: {
  powerRefs?: any[];
  resolvedOverrides?: Record<string, any>;
  existingUsage?: any;
  isAdmin?: boolean;
  nftAssetId?: string;
} = {}) {
  const {
    powerRefs = [makeDefaultPowerRef()],
    resolvedOverrides = {},
    existingUsage = null,
    isAdmin = false,
    nftAssetId = 'asset-001',
  } = options;

  const entity = makeEntity(powerRefs, nftAssetId);
  const resolved = makeResolved(resolvedOverrides);

  const tx: any = {
    entity: { findUnique: jest.fn().mockResolvedValue(entity) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ flags: isAdmin ? { isAdmin: true } : {} }),
    },
  };

  const prisma: any = {
    entityPowerUsage: {
      findUnique: jest.fn().mockResolvedValue(existingUsage),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const globalPowerService: any = {
    triggerPower: jest.fn().mockResolvedValue({ id: 'gap-1', label: 'Spark — World Speed Boost' }),
  };

  const powerDefService: any = {
    resolve: jest.fn().mockResolvedValue(resolved),
  };

  const handler = new TriggerEntityPowerHandler(prisma, globalPowerService, powerDefService);
  const ctx = { userId: 'user-1', tx };

  return { handler, ctx, tx, prisma, globalPowerService, powerDefService, resolved };
}

describe('TriggerEntityPowerHandler — validation', () => {
  it('throws BadRequestException when entityId is missing', async () => {
    const { handler, ctx } = makeFakes();
    await expect(handler.execute(ctx, { powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when powerKey is missing', async () => {
    const { handler, ctx } = makeFakes();
    await expect(handler.execute(ctx, { entityId: 'entity-1' })).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when entity does not exist', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.entity.findUnique.mockResolvedValue(null);
    await expect(handler.execute(ctx, { entityId: 'missing', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when entity is owned by another user', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.entity.findUnique.mockResolvedValue({ ...makeEntity(), ownerUserId: 'other-user' });
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when entity has no NFT asset ID', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.entity.findUnique.mockResolvedValue({ ...makeEntity(), nftAssetId: null });
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when entity has no unique powers defined', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.entity.findUnique.mockResolvedValue({
      ...makeEntity(),
      definition: { rules: { uniques: {} } },
    });
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when the requested power key is not found', async () => {
    const { handler, ctx } = makeFakes({
      powerRefs: [{ key: 'other_power', name: 'Other Power' }],
    });
    await expect(
      handler.execute(ctx, { entityId: 'entity-1', powerKey: 'nonexistent_key' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when non-tick power has no effectDefId', async () => {
    const { handler, ctx } = makeFakes({
      powerRefs: [{ key: 'my_effect_power', name: 'My Effect', powerType: 'effect_backed' }],
      resolvedOverrides: {
        key: 'my_effect_power',
        powerType: 'effect_backed',
        effectDefId: null,
      },
    });
    await expect(
      handler.execute(ctx, { entityId: 'entity-1', powerKey: 'my_effect_power' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TriggerEntityPowerHandler — happy path (PowerRef key format)', () => {
  it('activates a tick_speed_boost power and creates usage record on first use', async () => {
    const { handler, ctx, prisma, globalPowerService } = makeFakes();

    const result = await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { scope: 'global', agg: 'any' },
        durationMinutes: 30,
        triggeredByUserId: 'user-1',
        effectDefId: null,
      }),
    );

    expect(prisma.entityPowerUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'entity-1',
          powerKey: 'tick_speed_boost',
          lastUsedUtcDay: TODAY,
          usageCount: 1,
        }),
      }),
    );

    expect(result.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'toast', tone: 'success' }),
      ]),
    );
    expect(result.patches).toBeDefined();
  });

  it('activates an effect_backed power with effectDefId', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ key: 'xp_boost', name: 'XP Boost', powerDefId: 'pd_xp_boost' }],
      resolvedOverrides: {
        key: 'xp_boost',
        powerType: 'entity_xp_boost',
        effectDefId: 'eff_xp_boost',
        durationMinutes: 60,
        scope: 'entity',
      },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'xp_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalledWith(
      expect.objectContaining({
        effectDefId: 'eff_xp_boost',
        durationMinutes: 60,
        triggeredByUserId: 'user-1',
      }),
    );
  });

  it('resolves the power via PowerDefService using the PowerRef found in definition rules', async () => {
    const { handler, ctx, powerDefService } = makeFakes({
      powerRefs: [{ key: 'tick_speed_boost', name: 'Speed', powerDefId: 'pd_speed' }],
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(powerDefService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tick_speed_boost', powerDefId: 'pd_speed' }),
    );
  });

  it('allows admin to trigger power on an entity they do not own', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({ isAdmin: true });
    ctx.userId = 'admin-user';

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });
});

describe('TriggerEntityPowerHandler — daily limit enforcement', () => {
  it('throws BadRequestException when daily limit is reached on the same UTC day', async () => {
    const { handler, ctx } = makeFakes({
      existingUsage: { lastUsedUtcDay: TODAY, usageCount: 1 },
      resolvedOverrides: { dailyLimit: 1 },
    });

    await expect(
      handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows trigger when usageCount is below daily limit on same UTC day', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      existingUsage: { lastUsedUtcDay: TODAY, usageCount: 1 },
      resolvedOverrides: { dailyLimit: 3 },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('resets usage count when existing record is from a previous UTC day', async () => {
    const { handler, ctx, prisma, globalPowerService } = makeFakes({
      existingUsage: { lastUsedUtcDay: '2000-01-01', usageCount: 1 },
      resolvedOverrides: { dailyLimit: 1 },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();

    expect(prisma.entityPowerUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastUsedUtcDay: TODAY, usageCount: 1 }),
      }),
    );
  });

  it('increments usageCount when triggering again on same day within limit', async () => {
    const { handler, ctx, prisma } = makeFakes({
      existingUsage: { lastUsedUtcDay: TODAY, usageCount: 1 },
      resolvedOverrides: { dailyLimit: 5 },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(prisma.entityPowerUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { usageCount: { increment: 1 } },
      }),
    );
  });
});

describe('TriggerEntityPowerHandler — PowerRef alias resolution', () => {
  it('matches a PowerRef by powerType field (legacy inline format) when key is absent', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ powerType: 'tick_speed_boost', name: 'Speed Up' }],
      resolvedOverrides: { key: 'tick_speed_boost' },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('resolves tick_boost alias to tick_speed_boost canonical key', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ key: 'tick_speed_boost', name: 'Speed Up' }],
      resolvedOverrides: { key: 'tick_speed_boost' },
    });

    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });
});
