import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TriggerLocationPowerHandler } from '../commands/handlers/trigger-location-power.handler';

jest.mock('../commands/patch-builder', () => {
  const mockPb = {
    upsert: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue([]),
  };
  return {
    PatchBuilder: jest.fn().mockImplementation(() => mockPb),
    buildLocationPatches: jest.fn().mockResolvedValue(undefined),
  };
});

const TODAY = new Date().toISOString().slice(0, 10);

function makeResolved(overrides: Record<string, any> = {}) {
  return {
    key: 'tick_speed_boost',
    name: 'Outpost Speed Boost',
    powerType: 'tick_speed_boost',
    effectDefId: null,
    effectOverrides: undefined,
    value: 25,
    valueMode: 'percent_add',
    durationMinutes: 60,
    dailyLimit: 1,
    scope: 'global',
    selection: undefined,
    ...overrides,
  };
}

function makeLocation(powerRefs: any[] = [makeDefaultPowerRef()], nftAssetId = 'loc-asset-001') {
  return {
    id: 'location-1',
    ownerUserId: 'user-1',
    nftAssetId,
    name: 'Ember Outpost',
    definition: {
      id: 'outpost_def_alpha',
      rules: {
        uniques: {
          [nftAssetId]: { powers: powerRefs },
        },
      },
    },
  };
}

function makeDefaultPowerRef() {
  return { key: 'tick_speed_boost', name: 'Outpost Speed Boost' };
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
    nftAssetId = 'loc-asset-001',
  } = options;

  const location = makeLocation(powerRefs, nftAssetId);
  const resolved = makeResolved(resolvedOverrides);

  const tx: any = {
    locationInstance: { findUnique: jest.fn().mockResolvedValue(location) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ flags: isAdmin ? { isAdmin: true } : {} }),
    },
  };

  const prisma: any = {
    locationPowerUsage: {
      findUnique: jest.fn().mockResolvedValue(existingUsage),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const globalPowerService: any = {
    triggerPower: jest.fn().mockResolvedValue({ id: 'gap-2', label: 'Ember Outpost — Outpost Speed Boost' }),
  };

  const powerDefService: any = {
    resolve: jest.fn().mockResolvedValue(resolved),
  };

  const handler = new TriggerLocationPowerHandler(prisma, globalPowerService, powerDefService);
  const ctx = { userId: 'user-1', tx };

  return { handler, ctx, tx, prisma, globalPowerService, powerDefService, resolved };
}

describe('TriggerLocationPowerHandler — validation', () => {
  it('throws BadRequestException when locationId is missing', async () => {
    const { handler, ctx } = makeFakes();
    await expect(handler.execute(ctx, { powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when powerKey is missing', async () => {
    const { handler, ctx } = makeFakes();
    await expect(handler.execute(ctx, { locationId: 'location-1' })).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when location does not exist', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.locationInstance.findUnique.mockResolvedValue(null);
    await expect(
      handler.execute(ctx, { locationId: 'missing', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when location is owned by another user', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.locationInstance.findUnique.mockResolvedValue({ ...makeLocation(), ownerUserId: 'other-user' });
    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when location has no NFT asset ID', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.locationInstance.findUnique.mockResolvedValue({ ...makeLocation(), nftAssetId: null });
    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when location has no unique powers defined', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.locationInstance.findUnique.mockResolvedValue({
      ...makeLocation(),
      definition: { rules: { uniques: {} } },
    });
    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when the requested power key is not found', async () => {
    const { handler, ctx } = makeFakes({
      powerRefs: [{ key: 'some_other_power', name: 'Other' }],
    });
    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'nonexistent_key' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when non-tick power has no effectDefId', async () => {
    const { handler, ctx } = makeFakes({
      powerRefs: [{ key: 'buff_power', name: 'Buff Power', powerType: 'effect_backed' }],
      resolvedOverrides: {
        key: 'buff_power',
        powerType: 'effect_backed',
        effectDefId: null,
      },
    });
    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'buff_power' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TriggerLocationPowerHandler — happy path (PowerRef key format)', () => {
  it('activates a GlobalActivePower on the happy path', async () => {
    const { handler, ctx, globalPowerService } = makeFakes();

    const result = await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { scope: 'global', agg: 'any' },
        durationMinutes: 60,
        triggeredByUserId: 'user-1',
        effectDefId: null,
      }),
    );

    expect(result.ui).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'toast', tone: 'success' }),
      ]),
    );
    expect(result.patches).toBeDefined();
  });

  it('creates a usage record on first trigger', async () => {
    const { handler, ctx, prisma } = makeFakes();

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(prisma.locationPowerUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationInstanceId: 'location-1',
          powerKey: 'tick_speed_boost',
          lastUsedUtcDay: TODAY,
          usageCount: 1,
        }),
      }),
    );
  });

  it('activates an effect_backed power with effectDefId', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ key: 'production_boost', name: 'Production Boost', powerDefId: 'pd_prod' }],
      resolvedOverrides: {
        key: 'production_boost',
        powerType: 'effect_backed',
        effectDefId: 'eff_production',
        scope: 'location',
        durationMinutes: 120,
      },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'production_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalledWith(
      expect.objectContaining({
        effectDefId: 'eff_production',
        durationMinutes: 120,
        triggeredByUserId: 'user-1',
        selection: { scope: 'entity', agg: 'any', filter: { locationId: 'location-1' } },
      }),
    );
  });

  it('resolves the power via PowerDefService using the PowerRef from definition rules', async () => {
    const { handler, ctx, powerDefService } = makeFakes({
      powerRefs: [{ key: 'tick_speed_boost', name: 'Speed', powerDefId: 'pd_speed' }],
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(powerDefService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tick_speed_boost', powerDefId: 'pd_speed' }),
    );
  });

  it('allows admin to trigger power on a location they do not own', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({ isAdmin: true });
    ctx.userId = 'admin-user';

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('derives player-scoped selection when scope is "player"', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ key: 'player_buff', name: 'Player Buff', powerType: 'effect_backed' }],
      resolvedOverrides: {
        key: 'player_buff',
        powerType: 'effect_backed',
        effectDefId: 'eff_player_buff',
        scope: 'player',
      },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'player_buff' });

    expect(globalPowerService.triggerPower).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { scope: 'entity', agg: 'any', filter: { userId: 'user-1' } },
      }),
    );
  });
});

describe('TriggerLocationPowerHandler — daily limit enforcement', () => {
  it('throws BadRequestException when daily limit is reached on the same UTC day', async () => {
    const { handler, ctx } = makeFakes({
      existingUsage: { lastUsedUtcDay: TODAY, usageCount: 1 },
      resolvedOverrides: { dailyLimit: 1 },
    });

    await expect(
      handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows trigger when usageCount is below daily limit on same UTC day', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      existingUsage: { lastUsedUtcDay: TODAY, usageCount: 2 },
      resolvedOverrides: { dailyLimit: 5 },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('resets usage count when existing record is from a previous UTC day', async () => {
    const { handler, ctx, prisma, globalPowerService } = makeFakes({
      existingUsage: { lastUsedUtcDay: '2000-01-01', usageCount: 1 },
      resolvedOverrides: { dailyLimit: 1 },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();

    expect(prisma.locationPowerUsage.update).toHaveBeenCalledWith(
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

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(prisma.locationPowerUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { usageCount: { increment: 1 } },
      }),
    );
  });
});

describe('TriggerLocationPowerHandler — PowerRef alias resolution', () => {
  it('matches a PowerRef by powerType field (legacy inline format) when key is absent', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ powerType: 'tick_speed_boost', name: 'Speed Up' }],
      resolvedOverrides: { key: 'tick_speed_boost' },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('resolves tick_boost alias to tick_speed_boost canonical key', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ key: 'tick_speed_boost', name: 'Speed Up' }],
      resolvedOverrides: { key: 'tick_speed_boost' },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_boost' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });

  it('matches a PowerRef by effectDefId field (legacy format) when key and powerType are absent', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      powerRefs: [{ effectDefId: 'eff_legacy', name: 'Legacy Power' }],
      resolvedOverrides: {
        key: 'eff_legacy',
        powerType: 'effect_backed',
        effectDefId: 'eff_legacy',
      },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'eff_legacy' });

    expect(globalPowerService.triggerPower).toHaveBeenCalled();
  });
});

describe('TriggerLocationPowerHandler — canonical key used for usage accounting', () => {
  it('records usage under the canonical key returned by resolve(), not the alias', async () => {
    const { handler, ctx, prisma } = makeFakes({
      powerRefs: [{ key: 'tick_speed_boost', name: 'Speed Up' }],
      resolvedOverrides: { key: 'tick_speed_boost' },
    });

    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_boost' });

    expect(prisma.locationPowerUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ powerKey: 'tick_speed_boost' }),
      }),
    );
  });
});
