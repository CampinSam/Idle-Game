import { BadRequestException } from '@nestjs/common';
import { EffectService, ApplyEffectParams } from './effect.service';
import {
  EffectCategory,
  EffectDurationModel,
  EffectStackingRule,
  EffectTargetType,
  EffectSourceType,
  EffectValueMode,
} from '@derp/shared';

function makeMockPrisma() {
  return {
    effectDef: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    activeEffect: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    globalActivePower: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    locationWorkerAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    entityEquipment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    itemInstance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeMockTickService(currentTick = 100) {
  return {
    getCurrentTick: jest.fn().mockResolvedValue(currentTick),
  };
}

function makeEffectDef(overrides: Partial<any> = {}) {
  return {
    id: 'def-1',
    name: 'Test Effect',
    category: EffectCategory.MISSION_POWER,
    durationModel: EffectDurationModel.PERMANENT,
    durationSec: null,
    durationTicks: null,
    valueMode: EffectValueMode.FLAT_ADD,
    value: 10,
    stats: null,
    trait: null,
    targetType: EffectTargetType.ENTITY,
    stackingRule: EffectStackingRule.STACK_ADDITIVE,
    maxStacks: 5,
    maxUses: null,
    sessionType: null,
    enabled: true,
    ...overrides,
  };
}

function makeActiveEffectRecord(overrides: Partial<any> = {}) {
  return {
    id: 'ae-1',
    effectDefId: 'def-1',
    userId: 'user-1',
    targetType: EffectTargetType.ENTITY,
    targetId: 'ent-1',
    sourceType: EffectSourceType.CONSUMABLE,
    sourceId: 'src-1',
    category: EffectCategory.MISSION_POWER,
    valueMode: EffectValueMode.FLAT_ADD,
    value: 10,
    stats: null,
    trait: null,
    currentStacks: 1,
    remainingUses: null,
    sessionType: null,
    sessionId: null,
    expiresAt: null,
    expiresAtTick: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeService(
  prisma?: ReturnType<typeof makeMockPrisma>,
  tickSvc?: ReturnType<typeof makeMockTickService>,
) {
  const p = prisma ?? makeMockPrisma();
  const t = tickSvc ?? makeMockTickService();
  const svc = new EffectService(p as any, t as any);
  return { svc, prisma: p, tickService: t };
}

describe('EffectService.resolveForTarget', () => {
  it('aggregates active effects for an ENTITY target and returns net flat modifier', async () => {
    const prisma = makeMockPrisma();
    const row = makeActiveEffectRecord({
      category: EffectCategory.MISSION_POWER,
      valueMode: EffectValueMode.FLAT_ADD,
      value: 20,
      currentStacks: 1,
    });
    prisma.activeEffect.findMany
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    prisma.globalActivePower.findMany.mockResolvedValue([]);

    const { svc } = makeService(prisma);
    const result = await svc.resolveForTarget(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
      EffectCategory.MISSION_POWER,
    );

    expect(result.flatAdd).toBe(20);
    expect(result.percentAdd).toBe(0);
    expect(result.multiplier).toBe(1);
  });

  it('resolves active effects for a PLAYER target without querying entity effects', async () => {
    const prisma = makeMockPrisma();
    const row = makeActiveEffectRecord({
      targetType: EffectTargetType.PLAYER,
      targetId: 'user-1',
      category: EffectCategory.XP_MULTIPLIER,
      valueMode: EffectValueMode.PERCENT_ADD,
      value: 50,
    });
    prisma.activeEffect.findMany.mockResolvedValueOnce([row]);
    prisma.globalActivePower.findMany.mockResolvedValue([]);

    const { svc } = makeService(prisma);
    const result = await svc.resolveForTarget(
      'user-1',
      EffectTargetType.PLAYER,
      'user-1',
      EffectCategory.XP_MULTIPLIER,
    );

    expect(result.percentAdd).toBe(50);
    expect(prisma.activeEffect.findMany).toHaveBeenCalledTimes(1);
  });

  it('resolves active effects for a LOCATION target', async () => {
    const prisma = makeMockPrisma();
    const row = makeActiveEffectRecord({
      targetType: EffectTargetType.LOCATION,
      targetId: 'loc-1',
      category: EffectCategory.PRODUCTION_RATE,
      valueMode: EffectValueMode.PERCENT_ADD,
      value: 25,
    });
    prisma.activeEffect.findMany
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    prisma.globalActivePower.findMany.mockResolvedValue([]);

    const { svc } = makeService(prisma);
    const result = await svc.resolveForTarget(
      'user-1',
      EffectTargetType.LOCATION,
      'loc-1',
      EffectCategory.PRODUCTION_RATE,
    );

    expect(result.percentAdd).toBe(25);
  });

  it('returns an empty zero modifier when no active effects exist', async () => {
    const prisma = makeMockPrisma();
    prisma.activeEffect.findMany.mockResolvedValue([]);
    prisma.globalActivePower.findMany.mockResolvedValue([]);

    const { svc } = makeService(prisma);
    const result = await svc.resolveForTarget(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
      EffectCategory.MISSION_POWER,
    );

    expect(result.flatAdd).toBe(0);
    expect(result.percentAdd).toBe(0);
    expect(result.multiplier).toBe(1);
    expect(result.grants).toHaveLength(0);
    expect(result.traits).toHaveLength(0);
  });

  it('excludes a global power row whose agg:self check fails for the current user', async () => {
    const prisma = makeMockPrisma();
    prisma.activeEffect.findMany.mockResolvedValue([]);
    prisma.globalActivePower.findMany.mockResolvedValue([
      {
        id: 'gp-1',
        effectDefId: 'def-gp',
        triggeredByUserId: 'user-2',
        status: 'active',
        effectOverrides: null,
        selection: { scope: 'global', agg: 'self' },
        effectDef: {
          category: EffectCategory.MISSION_POWER,
          valueMode: EffectValueMode.FLAT_ADD,
          value: 100,
          stats: null,
          trait: null,
        },
      },
    ]);

    const { svc } = makeService(prisma);
    const result = await svc.resolveForTarget(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
      EffectCategory.MISSION_POWER,
    );

    expect(result.flatAdd).toBe(0);
  });
});

describe('EffectService.getPassiveEffectsFromEquipment', () => {
  it('returns an empty array when targetType is not ENTITY', async () => {
    const prisma = makeMockPrisma();
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.PLAYER,
      'user-1',
    );

    expect(rows).toEqual([]);
    expect(prisma.entityEquipment.findMany).not.toHaveBeenCalled();
    expect(prisma.itemInstance.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty array when the entity has no equipped items', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([]);
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
    );

    expect(rows).toEqual([]);
    expect(prisma.entityEquipment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.itemInstance.findMany).not.toHaveBeenCalled();
  });

  it('synthesises a STAT_BOOST row from equipData.stats', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([
      { itemInstanceId: 'inst-1' },
    ]);
    prisma.itemInstance.findMany.mockResolvedValue([
      {
        id: 'inst-1',
        definition: {
          id: 'item-def-sword',
          passiveEffects: [],
          equipData: { slot: 'weapon', stats: { ATK: 15, SPD: 3 } },
        },
      },
    ]);
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].effectDefId).toBe('equip:item-def-sword:stat_boost');
    expect(rows[0].category).toBe(EffectCategory.STAT_BOOST);
    expect(rows[0].valueMode).toBe(EffectValueMode.FLAT_ADD);
    expect(rows[0].value).toBe(0);
    expect(rows[0].stats).toEqual({ ATK: 15, SPD: 3 });
    expect(rows[0].currentStacks).toBe(1);
  });

  it('returns matching rows for explicit passiveEffects entries', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([
      { itemInstanceId: 'inst-2' },
    ]);
    prisma.itemInstance.findMany.mockResolvedValue([
      {
        id: 'inst-2',
        definition: {
          id: 'item-def-ring',
          passiveEffects: [
            {
              category: EffectCategory.MISSION_POWER,
              valueMode: EffectValueMode.PERCENT_ADD,
              value: 10,
              stats: null,
              trait: null,
            },
            {
              category: EffectCategory.XP_MULTIPLIER,
              valueMode: EffectValueMode.FLAT_ADD,
              value: 5,
              stats: null,
              trait: null,
            },
          ],
          equipData: {},
        },
      },
    ]);
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].effectDefId).toBe('passive:item-def-ring:mission_power');
    expect(rows[0].category).toBe(EffectCategory.MISSION_POWER);
    expect(rows[0].valueMode).toBe(EffectValueMode.PERCENT_ADD);
    expect(rows[0].value).toBe(10);
    expect(rows[1].effectDefId).toBe('passive:item-def-ring:xp_multiplier');
    expect(rows[1].category).toBe(EffectCategory.XP_MULTIPLIER);
    expect(rows[1].value).toBe(5);
  });

  it('combines passiveEffects rows and a STAT_BOOST row when both are present', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([
      { itemInstanceId: 'inst-3' },
    ]);
    prisma.itemInstance.findMany.mockResolvedValue([
      {
        id: 'inst-3',
        definition: {
          id: 'item-def-focus',
          passiveEffects: [
            {
              category: EffectCategory.SUCCESS_CHANCE,
              valueMode: EffectValueMode.FLAT_ADD,
              value: 2,
              stats: null,
              trait: null,
            },
          ],
          equipData: { slot: 'accessory', stats: { INT: 8 } },
        },
      },
    ]);
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
    );

    expect(rows).toHaveLength(2);
    const passiveRow = rows.find((r) => r.category === EffectCategory.SUCCESS_CHANCE);
    const statRow = rows.find((r) => r.category === EffectCategory.STAT_BOOST);
    expect(passiveRow).toBeDefined();
    expect(passiveRow!.value).toBe(2);
    expect(statRow).toBeDefined();
    expect(statRow!.stats).toEqual({ INT: 8 });
  });

  it('skips passiveEffects entries missing category or valueMode', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([
      { itemInstanceId: 'inst-4' },
    ]);
    prisma.itemInstance.findMany.mockResolvedValue([
      {
        id: 'inst-4',
        definition: {
          id: 'item-def-broken',
          passiveEffects: [
            { category: null, valueMode: EffectValueMode.FLAT_ADD, value: 5 },
            { category: EffectCategory.MISSION_POWER, valueMode: null, value: 5 },
            { category: EffectCategory.STAT_BOOST, valueMode: EffectValueMode.FLAT_ADD, value: 7 },
          ],
          equipData: {},
        },
      },
    ]);
    const { svc } = makeService(prisma);

    const rows = await svc.getPassiveEffectsFromEquipment(
      'user-1',
      EffectTargetType.ENTITY,
      'ent-1',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(7);
  });

  it('queries entityEquipment with the correct userId ownership filter', async () => {
    const prisma = makeMockPrisma();
    prisma.entityEquipment.findMany.mockResolvedValue([]);
    const { svc } = makeService(prisma);

    await svc.getPassiveEffectsFromEquipment('user-42', EffectTargetType.ENTITY, 'ent-99');

    expect(prisma.entityEquipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityId: 'ent-99', entity: { ownerUserId: 'user-42' } },
      }),
    );
  });
});

describe('EffectService.applyEffect', () => {
  it('creates a new active effect row when no matching active effect exists', async () => {
    const prisma = makeMockPrisma();
    const def = makeEffectDef({ durationModel: EffectDurationModel.PERMANENT });
    prisma.effectDef.findMany.mockResolvedValue([def]);
    prisma.activeEffect.findMany.mockResolvedValue([]);
    const created = makeActiveEffectRecord({ id: 'ae-new', value: 10 });
    prisma.activeEffect.create.mockResolvedValue(created);

    const { svc } = makeService(prisma);
    const result = await svc.applyEffect({
      effectDefId: 'def-1',
      userId: 'user-1',
      targetType: EffectTargetType.ENTITY,
      targetId: 'ent-1',
      sourceType: EffectSourceType.CONSUMABLE,
      sourceId: 'src-1',
    });

    expect(prisma.activeEffect.create).toHaveBeenCalledTimes(1);
    expect('active' in result).toBe(true);
    if ('active' in result) {
      expect(result.active.id).toBe('ae-new');
      expect(result.removedIds).toHaveLength(0);
    }
  });

  it('increments currentStacks for STACK_ADDITIVE when a matching row already exists', async () => {
    const prisma = makeMockPrisma();
    const def = makeEffectDef({
      durationModel: EffectDurationModel.PERMANENT,
      stackingRule: EffectStackingRule.STACK_ADDITIVE,
      maxStacks: 5,
    });
    prisma.effectDef.findMany.mockResolvedValue([def]);
    const existing = makeActiveEffectRecord({ currentStacks: 2 });
    prisma.activeEffect.findMany.mockResolvedValue([existing]);
    const updated = { ...existing, currentStacks: 3 };
    prisma.activeEffect.update.mockResolvedValue(updated);

    const { svc } = makeService(prisma);
    const result = await svc.applyEffect({
      effectDefId: 'def-1',
      userId: 'user-1',
      targetType: EffectTargetType.ENTITY,
      targetId: 'ent-1',
      sourceType: EffectSourceType.CONSUMABLE,
      sourceId: 'src-1',
    });

    expect(prisma.activeEffect.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStacks: 3 } }),
    );
    expect('active' in result).toBe(true);
    if ('active' in result) {
      expect(result.active.currentStacks).toBe(3);
    }
    expect(prisma.activeEffect.create).not.toHaveBeenCalled();
  });

  it('deletes existing rows and creates a fresh row for REPLACE stacking rule', async () => {
    const prisma = makeMockPrisma();
    const def = makeEffectDef({
      durationModel: EffectDurationModel.PERMANENT,
      stackingRule: EffectStackingRule.REPLACE,
    });
    prisma.effectDef.findMany.mockResolvedValue([def]);
    const existing = makeActiveEffectRecord({ id: 'ae-old' });
    prisma.activeEffect.findMany.mockResolvedValue([existing]);
    prisma.activeEffect.deleteMany.mockResolvedValue({ count: 1 });
    const created = makeActiveEffectRecord({ id: 'ae-new' });
    prisma.activeEffect.create.mockResolvedValue(created);

    const { svc } = makeService(prisma);
    const result = await svc.applyEffect({
      effectDefId: 'def-1',
      userId: 'user-1',
      targetType: EffectTargetType.ENTITY,
      targetId: 'ent-1',
      sourceType: EffectSourceType.CONSUMABLE,
      sourceId: 'src-1',
    });

    expect(prisma.activeEffect.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['ae-old'] } } }),
    );
    expect(prisma.activeEffect.create).toHaveBeenCalledTimes(1);
    expect('active' in result).toBe(true);
    if ('active' in result) {
      expect(result.active.id).toBe('ae-new');
      expect(result.removedIds).toEqual(['ae-old']);
    }
  });

  it('sets expiresAt when duration model is TIMED', async () => {
    const prisma = makeMockPrisma();
    const durationSec = 3600;
    const def = makeEffectDef({
      durationModel: EffectDurationModel.TIMED,
      durationSec,
      stackingRule: EffectStackingRule.NO_STACK,
    });
    prisma.effectDef.findMany.mockResolvedValue([def]);
    prisma.activeEffect.findMany.mockResolvedValue([]);
    prisma.activeEffect.create.mockResolvedValue(
      makeActiveEffectRecord({ id: 'ae-timed' }),
    );

    const before = Date.now();
    const { svc } = makeService(prisma);
    await svc.applyEffect({
      effectDefId: 'def-1',
      userId: 'user-1',
      targetType: EffectTargetType.ENTITY,
      targetId: 'ent-1',
      sourceType: EffectSourceType.CONSUMABLE,
      sourceId: 'src-1',
    });
    const after = Date.now();

    const createCall = prisma.activeEffect.create.mock.calls[0][0];
    const expiresAt: Date = createCall.data.expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + durationSec * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + durationSec * 1000 + 100);
    expect(createCall.data.expiresAtTick).toBeNull();
  });

  it('sets expiresAtTick when duration model is TICK_BASED', async () => {
    const currentTick = 50;
    const durationTicks = 10;
    const prisma = makeMockPrisma();
    const tickService = makeMockTickService(currentTick);
    const def = makeEffectDef({
      durationModel: EffectDurationModel.TICK_BASED,
      durationTicks,
      stackingRule: EffectStackingRule.NO_STACK,
    });
    prisma.effectDef.findMany.mockResolvedValue([def]);
    prisma.activeEffect.findMany.mockResolvedValue([]);
    prisma.activeEffect.create.mockResolvedValue(
      makeActiveEffectRecord({ id: 'ae-tick', expiresAtTick: currentTick + durationTicks }),
    );

    const { svc } = makeService(prisma, tickService);
    await svc.applyEffect({
      effectDefId: 'def-1',
      userId: 'user-1',
      targetType: EffectTargetType.ENTITY,
      targetId: 'ent-1',
      sourceType: EffectSourceType.CONSUMABLE,
      sourceId: 'src-1',
    });

    const createCall = prisma.activeEffect.create.mock.calls[0][0];
    expect(createCall.data.expiresAtTick).toBe(currentTick + durationTicks);
    expect(createCall.data.expiresAt).toBeNull();
  });
});
