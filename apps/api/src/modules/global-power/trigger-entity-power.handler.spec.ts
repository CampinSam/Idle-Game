import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TriggerEntityPowerHandler } from '../commands/handlers/trigger-entity-power.handler';
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
  };
});

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
    chargeConfig: { maxChargeUnits: 1, costPerUse: 1, initialChargeUnits: 1, rechargeRules: [] },
    scope: 'global',
    selection: undefined,
    ...overrides,
  };
}

function makeGrant(overrides: Record<string, any> = {}) {
  return {
    id: 'grant-1',
    targetType: 'entity',
    targetId: 'entity-1',
    powerKey: 'tick_speed_boost',
    powerDefId: null,
    overrides: null,
    sourceType: 'nft_unique',
    sourceId: 'asset-001',
    expiresAt: null,
    remainingChargeUnits: null,
    powerDef: null,
    ...overrides,
  };
}

function makeUsage(overrides: Record<string, any> = {}) {
  return {
    id: 'usage-1',
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

  const entity = {
    id: 'entity-1',
    ownerUserId: 'user-1',
    nftAssetId: 'asset-001',
    speciesId: 'dragon',
    display: { name: 'Spark' },
    definition: { rules: {} },
    equipment: [],
  };
  const resolved = makeResolved(resolvedOverrides);

  const tx: any = {
    entity: { findUnique: jest.fn().mockResolvedValue(entity) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ flags: isAdmin ? { isAdmin: true } : {} }),
    },
  };

  const prisma: any = {};

  const globalPowerService: any = {
    triggerPower: jest.fn().mockResolvedValue({ id: 'gap-1', label: 'Spark — World Speed Boost' }),
  };

  const powerDefService: any = {
    resolve: jest.fn().mockResolvedValue(resolved),
  };

  const powerGrantService: any = {
    findActiveGrant: jest.fn().mockResolvedValue(grant),
  };

  const powerChargeService: any = {
    extractChargeConfig: jest.fn().mockReturnValue(resolved.chargeConfig),
    getOrCreateEntityUsage: jest.fn().mockResolvedValue(usage),
    applyEntityTickDrip: jest.fn().mockResolvedValue(usage.chargeUnits),
    deductEntityCharge: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(PowerChargeService, 'extractChargeConfig').mockReturnValue(resolved.chargeConfig);

  const tickService: any = {
    getCurrentTick: jest.fn().mockResolvedValue(100),
  };

  const notificationService: any = {
    createForCommandSilent: jest.fn().mockResolvedValue({ id: 'notif-1', type: 'power_activated', category: 'system', priority: 'normal', title: '', body: '', readAt: null, dismissedAt: null, createdAt: new Date().toISOString() }),
  };

  const handler = new TriggerEntityPowerHandler(
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
    tx.entity.findUnique.mockResolvedValue({ id: 'entity-1', ownerUserId: 'other-user', nftAssetId: 'a', speciesId: 'x', display: {}, definition: { rules: {} }, equipment: [] });
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when no active grant exists for the power', async () => {
    const { handler, ctx, powerGrantService } = makeFakes();
    powerGrantService.findActiveGrant.mockResolvedValue(null);
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when charge is insufficient', async () => {
    const { handler, ctx, powerChargeService } = makeFakes({
      usage: makeUsage({ chargeUnits: 0 }),
    });
    powerChargeService.applyEntityTickDrip.mockResolvedValue(0);
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(BadRequestException);
  });
});

describe('TriggerEntityPowerHandler — happy path', () => {
  it('calls globalPowerService.triggerPower and deducts charge on success', async () => {
    const { handler, ctx, globalPowerService, powerChargeService } = makeFakes();
    const result = await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });
    expect(globalPowerService.triggerPower).toHaveBeenCalledTimes(1);
    expect(powerChargeService.deductEntityCharge).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('patches');
  });

  it('admin user can trigger power on entity they do not own', async () => {
    const { handler, ctx, tx, globalPowerService } = makeFakes({ isAdmin: true });
    tx.entity.findUnique.mockResolvedValue({ id: 'entity-1', ownerUserId: 'other-user', nftAssetId: 'a', speciesId: 'x', display: {}, definition: { rules: {} }, equipment: [] });
    const result = await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });
    expect(globalPowerService.triggerPower).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('patches');
  });

  it('uses global selection for tick_speed_boost', async () => {
    const { handler, ctx, globalPowerService } = makeFakes();
    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual({ scope: 'global', agg: 'any' });
  });

  it('uses player selection for player-scoped effect_backed power', async () => {
    const { handler, ctx, globalPowerService } = makeFakes({
      resolvedOverrides: { powerType: 'effect_backed', effectDefId: 'eff-1', scope: 'player', selection: undefined },
    });
    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual({ scope: 'player', agg: 'self' });
  });

  it('uses explicit selection from PowerDef when present', async () => {
    const customSelection = { scope: 'entity', agg: 'any', filter: { speciesId: 'dragon' } };
    const { handler, ctx, globalPowerService } = makeFakes({
      resolvedOverrides: { powerType: 'effect_backed', effectDefId: 'eff-1', scope: 'player', selection: customSelection },
    });
    await handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' });
    const call = globalPowerService.triggerPower.mock.calls[0][0];
    expect(call.selection).toEqual(customSelection);
  });
});

describe('TriggerEntityPowerHandler — disabled PowerDef', () => {
  it('propagates NotFoundException from resolve() when PowerDef does not exist', async () => {
    const { handler, ctx, powerDefService } = makeFakes({ grant: makeGrant({ powerDefId: 'p-1' }) });
    powerDefService.resolve.mockRejectedValue(new NotFoundException('PowerDef "p-1" not found'));
    await expect(handler.execute(ctx, { entityId: 'entity-1', powerKey: 'tick_speed_boost' })).rejects.toThrow(NotFoundException);
  });
});
