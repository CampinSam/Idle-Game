/**
 * Real-DB integration tests for the busy-entity guards on stat-changing
 * equip/unequip/consumable actions.
 *
 * Stats are read at job-resolution time (outpost production, mission
 * outcomes), so swapping stat-bearing gear or quaffing a stat potion
 * mid-job would silently shift those calculations. These guards live in
 * EquipItemHandler / UnequipItemHandler / UseConsumableHandler.
 */
import { createTestHarness, TestHarness } from './db-harness';
import { EquipItemHandler } from '../../src/modules/commands/handlers/equip-item.handler';
import { UnequipItemHandler } from '../../src/modules/commands/handlers/unequip-item.handler';
import { UseConsumableHandler } from '../../src/modules/commands/handlers/use-consumable.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EffectService } from '../../src/modules/effect/effect.service';

describe('Busy-entity stat-change guards [integration]', () => {
  let h: TestHarness;
  let equipHandler: EquipItemHandler;
  let unequipHandler: UnequipItemHandler;
  let consumableHandler: UseConsumableHandler;
  let prisma: PrismaService;
  let effectService: EffectService;

  beforeAll(async () => {
    h = await createTestHarness();
    equipHandler = h.app.get(EquipItemHandler);
    unequipHandler = h.app.get(UnequipItemHandler);
    consumableHandler = h.app.get(UseConsumableHandler);
    prisma = h.prisma;
    effectService = h.app.get(EffectService);
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  beforeEach(async () => {
    await h.resetDb();
    effectService.invalidateDefCache();
  });

  async function seed() {
    const user = await prisma.user.create({
      data: {
        username: `tester-${Math.random().toString(36).slice(2, 8)}`,
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'x',
        keeperLevel: 1,
        keeperXp: BigInt(0),
        flags: {},
      },
    });

    await (prisma as any).entityDefinition.create({
      data: {
        id: 'edef_test',
        name: 'Test Entity',
        speciesId: 'species_test',
        slots: {},
        equipmentSlots: { weapon: 1, cosmetic: 1 },
        traits: {},
        progression: {
          enabled: true,
          maxLevel: 50,
          xpCurve: { kind: 'geometric', base: 100, ratio: 1.15 },
        },
        ascension: { enabled: false, cap: 5 },
        mastery: { enabled: false },
        init: { scratch: { startingLevel: 1, baseStats: {}, slotFill: { kind: 'singleRandomArchetype' } }, nft: {} },
      },
    });

    async function makeEntity(name: string, status: string) {
      return (prisma as any).entity.create({
        data: {
          ownerUserId: user.id,
          definitionId: 'edef_test',
          speciesId: 'species_test',
          display: { name },
          progression: { level: 1, xp: 0 },
          stats: { ATK: 5, DEF: 5, SPD: 5, FOC: 5, LCK: 5, VIT: 5 },
          traits: {},
          state: { status },
        },
      });
    }

    // Stat-bearing weapon (gear changes stats).
    const swordDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_sword',
        name: 'Iron Sword',
        type: 'GEAR',
        stackable: false,
        equipData: { slot: 'weapon', stats: { ATK: 3 } },
      },
    });
    // Cosmetic gear (no stat contribution).
    const hatDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_hat',
        name: 'Cosmetic Hat',
        type: 'GEAR',
        stackable: false,
        equipData: { slot: 'cosmetic' },
      },
    });

    // Effect defs: stat-boost potion vs heal potion.
    await (prisma as any).effectDef.create({
      data: {
        id: 'eff_atk_boost',
        name: 'ATK Boost',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'entity',
        value: 0,
        stats: { ATK: 5 },
        durationSec: 60,
        meta: {},
        enabled: true,
      },
    });
    await (prisma as any).effectDef.create({
      data: {
        id: 'eff_heal',
        name: 'Heal',
        category: 'protection',
        valueMode: 'flat_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'entity',
        value: 100,
        meta: {},
        enabled: true,
      },
    });
    await (prisma as any).effectDef.create({
      data: {
        id: 'eff_player_xp',
        name: 'Keeper XP',
        category: 'keeper_xp_multiplier',
        valueMode: 'flat_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 100,
        meta: {},
        enabled: true,
      },
    });

    // Consumable items.
    const statPotionDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_stat_potion',
        name: 'ATK Potion',
        type: 'CONSUMABLE',
        stackable: true,
        maxStack: 99,
        consumableData: {
          effects: [{ effectDefId: 'eff_atk_boost', targetType: 'entity' }],
        },
      },
    });
    const healPotionDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_heal_potion',
        name: 'Heal Potion',
        type: 'CONSUMABLE',
        stackable: true,
        maxStack: 99,
        consumableData: {
          effects: [{ effectDefId: 'eff_heal', targetType: 'entity' }],
        },
      },
    });
    const playerPotionDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_player_potion',
        name: 'Player Potion',
        type: 'CONSUMABLE',
        stackable: true,
        maxStack: 99,
        consumableData: {
          effects: [{ effectDefId: 'eff_player_xp', targetType: 'player' }],
        },
      },
    });

    async function makeItem(definitionId: string) {
      return (prisma as any).itemInstance.create({
        data: { userId: user.id, definitionId, quantity: 1 },
      });
    }

    return {
      user,
      makeEntity,
      makeItem,
      swordDef,
      hatDef,
      statPotionDef,
      healPotionDef,
      playerPotionDef,
    };
  }

  function runInTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, {
      maxWait: 10000,
      timeout: 60000,
      isolationLevel: 'ReadCommitted',
    });
  }

  describe('EquipItem', () => {
    it('blocks stat-bearing gear on a working entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Worker', 'working');
      const sword = await makeItem('item_sword');

      await expect(
        runInTx((tx) =>
          equipHandler.execute(
            { userId: user.id, tx },
            { entityId: entity.id, itemInstanceId: sword.id },
          ),
        ),
      ).rejects.toThrow(/currently working/);

      const equip = await (prisma as any).entityEquipment.findFirst({
        where: { entityId: entity.id },
      });
      expect(equip).toBeNull();
    });

    it('allows stat-bearing gear on an idle entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Idler', 'idle');
      const sword = await makeItem('item_sword');

      await runInTx((tx) =>
        equipHandler.execute(
          { userId: user.id, tx },
          { entityId: entity.id, itemInstanceId: sword.id },
        ),
      );

      const equip = await (prisma as any).entityEquipment.findFirst({
        where: { entityId: entity.id, itemInstanceId: sword.id },
      });
      expect(equip).not.toBeNull();
    });

    it('allows cosmetic gear on a working entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Worker', 'working');
      const hat = await makeItem('item_hat');

      await runInTx((tx) =>
        equipHandler.execute(
          { userId: user.id, tx },
          { entityId: entity.id, itemInstanceId: hat.id },
        ),
      );

      const equip = await (prisma as any).entityEquipment.findFirst({
        where: { entityId: entity.id, itemInstanceId: hat.id },
      });
      expect(equip).not.toBeNull();
    });
  });

  describe('UnequipItem', () => {
    it('blocks unequipping stat gear on a missioning entity', async () => {
      const { user, makeEntity, makeItem } = await seed();

      // Equip while idle, then flip to mission, then attempt unequip.
      const entity = await makeEntity('Hero', 'idle');
      const sword = await makeItem('item_sword');
      await runInTx((tx) =>
        equipHandler.execute(
          { userId: user.id, tx },
          { entityId: entity.id, itemInstanceId: sword.id },
        ),
      );
      await (prisma as any).entity.update({
        where: { id: entity.id },
        data: { state: { status: 'mission' } },
      });

      await expect(
        runInTx((tx) =>
          unequipHandler.execute(
            { userId: user.id, tx },
            { entityId: entity.id, itemInstanceId: sword.id },
          ),
        ),
      ).rejects.toThrow(/currently mission/);

      const equip = await (prisma as any).entityEquipment.findFirst({
        where: { entityId: entity.id, itemInstanceId: sword.id },
      });
      expect(equip).not.toBeNull();
    });

    it('allows unequipping cosmetic gear on a missioning entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Hero', 'idle');
      const hat = await makeItem('item_hat');
      await runInTx((tx) =>
        equipHandler.execute(
          { userId: user.id, tx },
          { entityId: entity.id, itemInstanceId: hat.id },
        ),
      );
      await (prisma as any).entity.update({
        where: { id: entity.id },
        data: { state: { status: 'mission' } },
      });

      await runInTx((tx) =>
        unequipHandler.execute(
          { userId: user.id, tx },
          { entityId: entity.id, itemInstanceId: hat.id },
        ),
      );

      const equip = await (prisma as any).entityEquipment.findFirst({
        where: { entityId: entity.id, itemInstanceId: hat.id },
      });
      expect(equip).toBeNull();
    });
  });

  describe('UseConsumable', () => {
    it('blocks stat-boost potion on a working entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Worker', 'working');
      const potion = await makeItem('item_stat_potion');

      await expect(
        runInTx((tx) =>
          consumableHandler.execute(
            { userId: user.id, tx },
            { itemInstanceId: potion.id, targetId: entity.id },
          ),
        ),
      ).rejects.toThrow(/currently working/);

      // Potion not consumed.
      const inst = await (prisma as any).itemInstance.findUnique({
        where: { id: potion.id },
      });
      expect(inst).not.toBeNull();
    });

    it('allows heal potion on a working entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Worker', 'working');
      const potion = await makeItem('item_heal_potion');

      await runInTx((tx) =>
        consumableHandler.execute(
          { userId: user.id, tx },
          { itemInstanceId: potion.id, targetId: entity.id },
        ),
      );

      // Potion was consumed (stackable qty 1 → row removed via removeItemTx).
      const remaining = await (prisma as any).itemInstance.findMany({
        where: { userId: user.id, definitionId: 'item_heal_potion' },
      });
      expect(remaining).toHaveLength(0);
    });

    it('allows player-targeted consumable regardless of any entity status', async () => {
      const { user, makeEntity, makeItem } = await seed();
      // Even with a working entity in the world, a player-targeted
      // consumable doesn't pass an entity targetId at all.
      await makeEntity('Worker', 'working');
      const potion = await makeItem('item_player_potion');

      await runInTx((tx) =>
        consumableHandler.execute(
          { userId: user.id, tx },
          { itemInstanceId: potion.id },
        ),
      );

      const remaining = await (prisma as any).itemInstance.findMany({
        where: { userId: user.id, definitionId: 'item_player_potion' },
      });
      expect(remaining).toHaveLength(0);
    });

    it('allows stat-boost potion on an idle entity', async () => {
      const { user, makeEntity, makeItem } = await seed();
      const entity = await makeEntity('Idler', 'idle');
      const potion = await makeItem('item_stat_potion');

      await runInTx((tx) =>
        consumableHandler.execute(
          { userId: user.id, tx },
          { itemInstanceId: potion.id, targetId: entity.id },
        ),
      );

      const remaining = await (prisma as any).itemInstance.findMany({
        where: { userId: user.id, definitionId: 'item_stat_potion' },
      });
      expect(remaining).toHaveLength(0);
    });
  });
});
