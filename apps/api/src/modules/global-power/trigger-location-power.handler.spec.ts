import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TriggerLocationPowerHandler } from '../commands/handlers/trigger-location-power.handler';
import { PowerChargeService } from './power-charge.service';

jest.mock('../commands/patch-builder', () => {
  const mockPb = {
    upsert: jest.fn().mockReturnThis(),
    upsertNotification: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue([]),
  };
  return {
    PatchBuilder: jest.fn().mockImplementation(() => mockPb),
    buildLocationPatches: jest.fn().mockResolvedValue(undefined),
  };
});

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
    chargeConfig: { maxChargeUnits: 1, costPerUse: 1, initialChargeUnits: 1, rechargeRules: [] },
    scope: 'global',
    selection: undefined,
    ...overrides,
  };
}

function makeGrant(overrides: Record<string, any> = {}) {
  return {
    id: 'lgrant-1',
    targetType: 'location',
    targetId: 'location-1',
    powerKey: 'tick_speed_boost',
    powerDefId: null,
    overrides: null,
    sourceType: 'nft_unique',
    sourceId: 'loc-asset-001',
    expiresAt: null,
    remainingChargeUnits: null,
    powerDef: null,
    ...overrides,
  };
}

function makeUsage(overrides: Record<string, any> = {}) {
  return {
    id: 'lusage-1',
    chargeUnits: 1,
    lastChargeAppliedAt: null,
    ...overrides,
  };
}

function makeFakes(options: {
  grant?: any;
  usage?: any;
  resolvedOverrides?: Record<string, any>;
  isAdmin?: boolean;
} = {}) {
  const {
    grant = makeGrant(),
    usage = makeUsage(),
    resolvedOverrides = {},
    isAdmin = false,
  } = options;

  const location = {
    id: 'location-1',
    ownerUserId: 'user-1',
    nftAssetId: 'loc-asset-001',
    name: 'Ember Outpost',
    definition: { id: 'outpost_def', rules: {} },
  };
  const resolved = makeResolved(resolvedOverrides);

  const tx: any = {
    locationInstance: { findUnique: jest.fn().mockResolvedValue(location) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ flags: isAdmin ? { isAdmin: true } : {} }),
    },
  };

  const prisma: any = {};

  const globalPowerService: any = {
    triggerPower: jest.fn().mockResolvedValue({ id: 'gap-2', label: 'Ember Outpost — Outpost Speed Boost' }),
  };

  const powerDefService: any = {
    resolve: jest.fn().mockResolvedValue(resolved),
  };

  const powerGrantService: any = {
    findActiveGrant: jest.fn().mockResolvedValue(grant),
  };

  const powerChargeService: any = {
    extractChargeConfig: jest.fn().mockReturnValue(resolved.chargeConfig),
    getOrCreateLocationUsage: jest.fn().mockResolvedValue(usage),
    applyLocationTickDrip: jest.fn().mockResolvedValue(usage.chargeUnits),
    deductLocationCharge: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(PowerChargeService, 'extractChargeConfig').mockReturnValue(resolved.chargeConfig);

  const tickService: any = {
    getCurrentTick: jest.fn().mockResolvedValue(100),
  };

  const notificationService: any = {
    createForCommandSilent: jest.fn().mockResolvedValue({ id: 'notif-1', type: 'power_activated', category: 'system', priority: 'normal', title: '', body: '', readAt: null, dismissedAt: null, createdAt: new Date().toISOString() }),
  };

  const handler = new TriggerLocationPowerHandler(
    prisma,
    globalPowerService,
    powerDefService,
    powerGrantService,
    powerChargeService,
    tickService,
    notificationService,
  );
  const ctx = { userId: 'user-1', tx };

  return { handler, ctx, tx, prisma, globalPowerService, powerDefService, powerGrantService, powerChargeService, resolved };
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
    await expect(handler.execute(ctx, { locationId: 'missing', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when location is owned by another user', async () => {
    const { handler, ctx, tx } = makeFakes();
    tx.locationInstance.findUnique.mockResolvedValue({ id: 'location-1', ownerUserId: 'other-user', nftAssetId: 'a', name: 'X', definition: { rules: {} } });
    await expect(handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when no active grant exists for the power', async () => {
    const { handler, ctx, powerGrantService } = makeFakes();
    powerGrantService.findActiveGrant.mockResolvedValue(null);
    await expect(handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when charge is insufficient', async () => {
    const { handler, ctx, powerChargeService } = makeFakes({
      usage: makeUsage({ chargeUnits: 0 }),
    });
    powerChargeService.applyLocationTickDrip.mockResolvedValue(0);
    await expect(handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });
});

describe('TriggerLocationPowerHandler — happy path', () => {
  it('calls globalPowerService.triggerPower and deducts charge on success', async () => {
    const { handler, ctx, globalPowerService, powerChargeService } = makeFakes();
    const result = await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });
    expect(globalPowerService.triggerPower).toHaveBeenCalledTimes(1);
    expect(powerChargeService.deductLocationCharge).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('patches');
  });

  it('admin user can trigger power on location they do not own', async () => {
    const { handler, ctx, tx, globalPowerService } = makeFakes({ isAdmin: true });
    tx.locationInstance.findUnique.mockResolvedValue({ id: 'location-1', ownerUserId: 'other-user', nftAssetId: 'a', name: 'X', definition: { rules: {} } });
    const result = await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });
    expect(globalPowerService.triggerPower).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('patches');
  });

  it('uses global selection for tick_speed_boost', async () => {
    const { handler, ctx, globalPowerService } = makeFakes();
    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual({ scope: 'global', agg: 'any' });
  });

  it('uses location selection for location-scoped effect_backed power', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      resolvedOverrides: { powerType: 'effect_backed', effectDefId: 'eff-1', scope: 'location', selection: undefined },
    });
    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual({ scope: 'entity', agg: 'any', filter: { locationId: 'location-1' } });
  });

  it('uses explicit selection from PowerDef when present', async () => {
    const customSelection = { scope: 'entity', agg: 'any', filter: { speciesId: 'bird' } };
    const { handler, ctx, globalPowerService } = makeFakes({
      resolvedOverrides: { powerType: 'effect_backed', effectDefId: 'eff-1', scope: 'location', selection: customSelection },
    });
    await handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual(customSelection);
  });
});

describe('TriggerLocationPowerHandler — disabled PowerDef', () => {
  it('propagates NotFoundException from resolve() when PowerDef does not exist', async () => {
    const { handler, ctx, powerDefService } = makeFakes({ grant: makeGrant({ powerDefId: 'p-1' }) });
    powerDefService.resolve.mockRejectedValue(new NotFoundException('PowerDef "p-1" not found'));
    await expect(handler.execute(ctx, { locationId: 'location-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });
});
