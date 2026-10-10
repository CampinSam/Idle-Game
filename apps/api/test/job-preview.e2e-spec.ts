/**
 * JobPreviewService integration tests.
 *
 * Tests the job preview logic using mocked DB/service dependencies.
 * No real database required. Covers:
 *   - Unknown jobType → BadRequestException
 *   - Crafting: 404 on missing recipe, 404 on missing user
 *   - Crafting: happy path returns correct shape (requirements, cost, duration, crafting block)
 *   - Crafting: workshop slot/tier context when locationId provided
 *   - Building: 404 on missing def, 404 on missing user
 *   - Building: happy path returns correct shape (requirements, cost, duration, building block)
 *   - Building: upgrade block present only when building exists, is active, and is below maxLevel
 *   - Building: upgrade block absent when building is currently under construction (status != "active")
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JobPreviewService } from '../src/modules/job/job-preview.service';

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  keeperLevel: 5,
  keeperXp: BigInt(0),
  prestigeTokens: 0,
  ...overrides,
});

const makeRecipeDef = (overrides: Record<string, any> = {}) => ({
  id: 'recipe_sword',
  name: 'Iron Sword',
  cost: [{ type: 'currency', id: 'gold', amount: 50 }],
  timer: { duration: 120, boostable: true },
  requirements: null,
  visibilityRequirements: null,
  rewards: { items: [{ type: 'item', id: 'sword_iron', amount: 1 }] },
  data: { tier: 1 },
  ...overrides,
});

const makeBuildingDef = (overrides: Record<string, any> = {}) => ({
  id: 'forge',
  name: 'Forge',
  description: 'A crafting workshop.',
  category: 'WORKSHOP',
  requirements: null,
  rules: {
    maxLevel: 3,
    level: {
      '1': { constructionCost: [{ type: 'currency', id: 'stone', amount: 100 }], timer: { duration: 60 } },
      '2': { constructionCost: [{ type: 'currency', id: 'stone', amount: 200 }], timer: { duration: 120 } },
    },
  },
  ...overrides,
});

const makeLocationInstance = (overrides: Record<string, any> = {}) => ({
  id: 'loc-1',
  ownerUserId: 'user-1',
  definition: { regionId: 'region-1', rules: {} },
  buildings: [],
  ...overrides,
});

const makeLocationBuildingInstance = (overrides: Record<string, any> = {}) => ({
  id: 'building-instance-1',
  buildingDefId: 'forge',
  locationId: 'loc-1',
  level: 1,
  state: { status: 'active' },
  enabled: true,
  ...overrides,
});

// Empty resolved modifier (mirrors emptyResolvedModifier from @derp/shared)
const emptyMod = () => ({ flatAdd: 0, percentAdd: 0, multiplier: 1 });

// ---------------------------------------------------------------------------
// Build a JobPreviewService with fully mocked dependencies
// ---------------------------------------------------------------------------

function buildService() {
  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    missionDef: { findUnique: jest.fn() },
    recipeDef: { findUnique: jest.fn() },
    buildingDef: { findUnique: jest.fn() },
    locationInstance: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    locationBuildingInstance: { findFirst: jest.fn().mockResolvedValue(null) },
    job: { findMany: jest.fn().mockResolvedValue([]) },
    itemInstance: { findMany: jest.fn().mockResolvedValue([]) },
    entity: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const mockGameRules = {
    buildRequirementContext: jest.fn().mockReturnValue({}),
    checkRequirements: jest.fn().mockReturnValue(true),
  };

  const mockSynergyResolver = {
    resolveRules: jest.fn().mockResolvedValue({
      matchedRules: [],
      totals: { synergyScore: 0, statModifiers: {}, durationModifiers: {} },
    }),
  };

  const mockEffectService = {
    resolveForTarget: jest.fn().mockResolvedValue(emptyMod()),
    getActiveEffectsForUser: jest.fn().mockResolvedValue([]),
    getGlobalPowerRows: jest.fn().mockResolvedValue([]),
    getPassiveEffectsFromEquipment: jest.fn().mockResolvedValue([]),
    resolve: jest.fn().mockReturnValue(emptyMod()),
  };

  const mockCurrencyService = {
    getBalance: jest.fn().mockResolvedValue(9999),
  };

  const service = new JobPreviewService(
    mockPrisma as any,
    mockGameRules as any,
    mockSynergyResolver as any,
    mockEffectService as any,
    mockCurrencyService as any,
  );

  return { service, mockPrisma, mockGameRules, mockEffectService, mockCurrencyService };
}

// ---------------------------------------------------------------------------
// Unknown jobType
// ---------------------------------------------------------------------------

describe('JobPreviewService — unknown jobType', () => {
  it('throws BadRequestException for an unrecognised jobType', async () => {
    const { service } = buildService();
    await expect(
      service.getPreview('user-1', { jobType: 'unknown' as any, defId: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Crafting preview
// ---------------------------------------------------------------------------

describe('JobPreviewService — crafting preview', () => {
  it('throws NotFoundException when recipe does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(null);

    await expect(
      service.getPreview('user-1', { jobType: 'crafting', defId: 'nonexistent' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getPreview('user-1', { jobType: 'crafting', defId: 'recipe_sword' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns correct shape for a basic crafting preview (no locationId)', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getPreview('user-1', { jobType: 'crafting', defId: 'recipe_sword' });

    expect(result.jobType).toBe('crafting');
    expect(result).toHaveProperty('requirements');
    expect(result).toHaveProperty('allRequirementsMet');
    expect(result).toHaveProperty('canAfford');
    expect(result).toHaveProperty('cost');
    expect(result).toHaveProperty('durationSeconds');
    expect(result).toHaveProperty('crafting');
    expect(result.crafting.recipeId).toBe('recipe_sword');
    expect(result.crafting.recipeName).toBe('Iron Sword');
    expect(result.crafting.recipeTier).toBe(1);
    expect(result.crafting.rewards).toBeDefined();
  });

  it('reflects canAfford: false when player cannot afford the cost', async () => {
    const { service, mockPrisma, mockCurrencyService } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(
      makeRecipeDef({ cost: [{ type: 'currency', id: 'gold', amount: 1000 }] }),
    );
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockCurrencyService.getBalance.mockResolvedValue(10);

    const result = await service.getPreview('user-1', { jobType: 'crafting', defId: 'recipe_sword' });

    expect(result.canAfford).toBe(false);
  });

  it('includes workshop context when locationId is provided and workshop exists', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 2 }),
    );
    mockPrisma.job.findMany.mockResolvedValue([]);

    const result = await service.getPreview('user-1', {
      jobType: 'crafting',
      defId: 'recipe_sword',
      locationId: 'loc-1',
    });

    expect(result.crafting.workshopTier).toBe(2);
    expect(result.crafting.slotsTotal).toBeGreaterThan(0);
    expect(result.crafting.slotsUsed).toBe(0);
    expect(typeof result.crafting.recipeTierMet).toBe('boolean');
  });

  it('counts active crafting jobs at the location for slotsUsed', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 2 }),
    );
    mockPrisma.job.findMany.mockResolvedValue([
      { data: { locationId: 'loc-1' } },
      { data: { locationId: 'loc-1' } },
    ]);

    const result = await service.getPreview('user-1', {
      jobType: 'crafting',
      defId: 'recipe_sword',
      locationId: 'loc-1',
    });

    expect(result.crafting.slotsUsed).toBe(2);
    expect(result.crafting.slotsOpen).toBe(Math.max(0, result.crafting.slotsTotal - 2));
  });

  it('returns null recipeTierMet when no locationId given', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(makeRecipeDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getPreview('user-1', { jobType: 'crafting', defId: 'recipe_sword' });

    expect(result.crafting.recipeTierMet).toBeNull();
  });

  it('sets allRequirementsMet to false when recipe tier exceeds workshop cap', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.recipeDef.findUnique.mockResolvedValue(
      makeRecipeDef({ data: { tier: 3 } }),
    );
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    // Tier-1 workshop: recipeTierCap = 1, so tier-3 recipe fails
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 1 }),
    );
    mockPrisma.job.findMany.mockResolvedValue([]);

    const result = await service.getPreview('user-1', {
      jobType: 'crafting',
      defId: 'recipe_sword',
      locationId: 'loc-1',
    });

    expect(result.crafting.recipeTierMet).toBe(false);
    expect(result.allRequirementsMet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Building preview
// ---------------------------------------------------------------------------

describe('JobPreviewService — building preview', () => {
  it('throws NotFoundException when building definition does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(null);

    await expect(
      service.getPreview('user-1', { jobType: 'building', defId: 'nonexistent' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getPreview('user-1', { jobType: 'building', defId: 'forge' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns correct shape for a basic building preview (no locationId)', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getPreview('user-1', { jobType: 'building', defId: 'forge' });

    expect(result.jobType).toBe('building');
    expect(result).toHaveProperty('requirements');
    expect(result).toHaveProperty('allRequirementsMet');
    expect(result).toHaveProperty('canAfford');
    expect(result).toHaveProperty('cost');
    expect(result).toHaveProperty('durationSeconds');
    expect(result).toHaveProperty('building');
    expect(result.building.buildingDefId).toBe('forge');
    expect(result.building.name).toBe('Forge');
    expect(result.building.buildLevel).toBe(1);
    expect(result.building.maxLevel).toBe(3);
    expect(result.building.upgrade).toBeNull();
  });

  it('includes upgrade block when building exists at location, is active, and below maxLevel', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.locationInstance.findFirst.mockResolvedValue(makeLocationInstance());
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 1, state: { status: 'active' } }),
    );

    const result = await service.getPreview('user-1', {
      jobType: 'building',
      defId: 'forge',
      locationId: 'loc-1',
    });

    expect(result.building.upgrade).not.toBeNull();
    expect(result.building.upgrade.toLevel).toBe(2);
    expect(Array.isArray(result.building.upgrade.cost)).toBe(true);
    expect(typeof result.building.upgrade.durationSeconds).toBe('number');
    expect(typeof result.building.upgrade.effectiveDurationTicks).toBe('number');
    expect(typeof result.building.upgrade.canAfford).toBe('boolean');
  });

  it('omits upgrade block when building is currently under construction (status != "active")', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.locationInstance.findFirst.mockResolvedValue(makeLocationInstance());
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 1, state: { status: 'building' } }),
    );

    const result = await service.getPreview('user-1', {
      jobType: 'building',
      defId: 'forge',
      locationId: 'loc-1',
    });

    expect(result.building.upgrade).toBeNull();
  });

  it('omits upgrade block when building is at maxLevel', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.locationInstance.findFirst.mockResolvedValue(makeLocationInstance());
    mockPrisma.locationBuildingInstance.findFirst.mockResolvedValue(
      makeLocationBuildingInstance({ level: 3, state: { status: 'active' } }),
    );

    const result = await service.getPreview('user-1', {
      jobType: 'building',
      defId: 'forge',
      locationId: 'loc-1',
    });

    expect(result.building.upgrade).toBeNull();
  });

  it('omits upgrade block when no locationId provided', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getPreview('user-1', { jobType: 'building', defId: 'forge' });

    expect(result.building.upgrade).toBeNull();
  });

  it('reflects canAfford: false when player cannot afford the build cost', async () => {
    const { service, mockPrisma, mockCurrencyService } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(makeBuildingDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockCurrencyService.getBalance.mockResolvedValue(0);

    const result = await service.getPreview('user-1', { jobType: 'building', defId: 'forge' });

    expect(result.canAfford).toBe(false);
  });

  it('allRequirementsMet is false when gameRules reports requirements not met', async () => {
    const { service, mockPrisma, mockGameRules } = buildService();
    mockPrisma.buildingDef.findUnique.mockResolvedValue(
      makeBuildingDef({ requirements: { op: 'AND', rules: [{ label: 'Outpost Level 5', scope: 'player', field: 'level', operator: 'gte', value: 5 }] } }),
    );
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockGameRules.checkRequirements.mockReturnValue(false);

    const result = await service.getPreview('user-1', { jobType: 'building', defId: 'forge' });

    expect(result.allRequirementsMet).toBe(false);
    expect(result.requirements.some((r: any) => r.met === false)).toBe(true);
  });
});
