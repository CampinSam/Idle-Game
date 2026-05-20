/**
 * Crafting flow integration tests.
 *
 * Tests CraftingService business logic using mocked DB/service dependencies.
 * Verifies that:
 *   - startCrafting rejects unknown recipes
 *   - startCrafting rejects non-idle entities
 *   - collectCrafting rejects when the timer has not expired
 *   - collectCrafting rejects when job is not found
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CraftingService } from '../src/modules/crafting/crafting.service';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  keeperLevel: 5,
  keeperXp: BigInt(0),
  prestigeTokens: 0,
  ...overrides,
});

const makeRecipeDef = (overrides: Record<string, any> = {}) => ({
  id: 'potion_heal_small',
  name: 'Minor Healing Potion',
  enabled: true,
  visibilityRequirements: [],
  cost: [],
  timer: { duration: 30, boostable: true },
  outputs: [{ type: 'item', id: 'potion_heal_small', amount: 1 }],
  ...overrides,
});

const makeEntity = (overrides: Record<string, any> = {}) => ({
  id: 'entity-1',
  ownerUserId: 'user-1',
  name: 'Derpy Bird',
  state: { status: 'idle' },
  stats: { ATK: 10, DEF: 10, SPD: 10, FOC: 10, LCK: 10, VIT: 10 },
  traits: { head: 'Dave', ears: 'Dave', beak: 'Dave', eyes: 'Dave', body: 'Dave', back: 'Dave', tail: 'Dave' },
  ...overrides,
});

const makeCraftingJob = (overrides: Record<string, any> = {}) => ({
  id: 'job-1',
  userId: 'user-1',
  type: 'CraftingJob',
  defId: 'potion_heal_small',
  status: 'active',
  timer: { startTick: 0, durationTicks: 30 },
  team: ['entity-1'],
  data: { seed: 'seed-1' },
  results: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Build a CraftingService with fully mocked dependencies
// ---------------------------------------------------------------------------

function buildService(prismaOverrides: Record<string, any> = {}) {
  const mockPrisma = {
    user: { findUnique: jest.fn() },
    recipeDef: { findUnique: jest.fn() },
    job: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    entity: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    ...prismaOverrides,
  };

  const mockEntityService = {
    getEntity: jest.fn(),
    setEntityStatus: jest.fn().mockResolvedValue({}),
    addXp: jest.fn().mockResolvedValue({}),
  };

  const mockCurrencyService = {
    spend: jest.fn().mockResolvedValue({}),
    award: jest.fn().mockResolvedValue({}),
  };

  const mockInventoryService = {
    removeItem: jest.fn().mockResolvedValue({}),
    addItem: jest.fn().mockResolvedValue({}),
  };

  const mockTickService = {
    getCurrentTick: jest.fn().mockResolvedValue(1000),
    getTickInfo: jest.fn().mockResolvedValue({ currentTick: 1000, currentRate: 1 }),
  };

  const mockGameRules = {
    checkVisibility: jest.fn().mockReturnValue(true),
    buildRequirementContext: jest.fn().mockReturnValue({}),
    checkRequirement: jest.fn().mockReturnValue(true),
  };

  const service = new CraftingService(
    mockPrisma as any,
    mockEntityService as any,
    mockCurrencyService as any,
    mockTickService as any,
    { createNotification: jest.fn() } as any,
    mockInventoryService as any,
    {} as any, // playerService
    mockGameRules as any,
    { emit: jest.fn() } as any,
  );

  return { service, mockPrisma, mockEntityService, mockCurrencyService, mockInventoryService, mockTickService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CraftingService — startCrafting', () => {
  it('throws NotFoundException when recipe does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(null);

    await expect(service.startCrafting('user-1', 'nonexistent', 'entity-1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.startCrafting('user-1', 'potion_heal_small', 'entity-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when entity is not idle', async () => {
    const { service, mockPrisma, mockEntityService } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockEntityService.getEntity.mockResolvedValue(makeEntity({ state: { status: 'working' } }));

    await expect(service.startCrafting('user-1', 'potion_heal_small', 'entity-1')).rejects.toThrow(BadRequestException);
  });

  it('creates a job and returns crafting response when all conditions are met', async () => {
    const { service, mockPrisma, mockEntityService } = buildService();
    const job = makeCraftingJob();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockEntityService.getEntity.mockResolvedValue(makeEntity());
    mockPrisma.job.create.mockResolvedValue(job);

    const result = await service.startCrafting('user-1', 'potion_heal_small', 'entity-1');

    expect(mockPrisma.job.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(job.id);
    expect(result.recipeId).toBe('potion_heal_small');
  });

  it('deducts currency costs before creating the job', async () => {
    const { service, mockPrisma, mockEntityService, mockCurrencyService } = buildService();
    const recipe = makeRecipeDef({
      cost: [{ type: 'currency', id: 'soft_arcanium', amount: 50 }],
    });
    const job = makeCraftingJob();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(recipe);
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockEntityService.getEntity.mockResolvedValue(makeEntity());
    mockPrisma.job.create.mockResolvedValue(job);

    await service.startCrafting('user-1', 'potion_heal_small', 'entity-1');

    expect(mockCurrencyService.spend).toHaveBeenCalledWith(
      expect.objectContaining({ currencyId: 'soft_arcanium', amount: 50 }),
    );
  });
});

describe('CraftingService — collectCrafting', () => {
  it('throws NotFoundException when crafting job is not found', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.job.findFirst.mockResolvedValue(null);

    await expect(service.collectCrafting('user-1', 'job-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when crafting timer has not expired', async () => {
    const { service, mockPrisma, mockTickService } = buildService();
    // currentTick = 1000, startTick = 0, durationTicks = 9999 → not complete
    mockPrisma.job.findFirst.mockResolvedValue(makeCraftingJob({ timer: { startTick: 0, durationTicks: 9999 } }));
    mockTickService.getCurrentTick.mockResolvedValue(1000);

    await expect(service.collectCrafting('user-1', 'job-1')).rejects.toThrow(BadRequestException);
  });
});
