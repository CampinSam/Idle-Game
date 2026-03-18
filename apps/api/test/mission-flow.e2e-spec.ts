/**
 * Mission flow integration tests.
 *
 * These tests cover the MissionService business logic using mocked DB/service
 * dependencies — no real database required. They verify that:
 *   - startMission rejects unknown mission defs
 *   - startMission rejects disabled missions
 *   - startMission enforces the anti-whale active-mission cap
 *   - startMission rejects non-idle entities
 *   - completeMission rejects when the timer has not expired
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MissionService } from '../src/modules/mission/mission.service';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  keeperLevel: 1,
  keeperXp: BigInt(0),
  prestigeTokens: 0,
  ...overrides,
});

const makeMissionDef = (overrides: Record<string, any> = {}) => ({
  id: 'quick_gather',
  name: 'Quick Gather',
  enabled: true,
  missionCategoryDefId: null,
  requirements: [],
  visibilityRequirements: [],
  difficulty: 100,
  timer: { duration: 60, boostable: true },
  ...overrides,
});

const makeEntity = (overrides: Record<string, any> = {}) => ({
  id: 'entity-1',
  ownerUserId: 'user-1',
  name: 'Derpy Bird',
  state: { status: 'idle' },
  equipment: [],
  stats: { ATK: 10, DEF: 10, SPD: 10, FOC: 10, LCK: 10, VIT: 10 },
  traits: { head: 'Dave', ears: 'Dave', beak: 'Dave', eyes: 'Dave', body: 'Dave', back: 'Dave', tail: 'Dave' },
  ...overrides,
});

const makeJob = (overrides: Record<string, any> = {}) => ({
  id: 'job-1',
  userId: 'user-1',
  type: 'MissionJob',
  defId: 'quick_gather',
  status: 'active',
  timer: { startTick: 0, durationTicks: 60 },
  team: ['entity-1'],
  data: { difficulty: 100, seed: 'seed-1' },
  results: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Build a MissionService instance with fully mocked dependencies
// ---------------------------------------------------------------------------

function buildService(prismaOverrides: Record<string, any> = {}) {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    missionDef: {
      findUnique: jest.fn(),
    },
    missionCategoryDef: {
      findUnique: jest.fn(),
    },
    job: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    entity: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    ...prismaOverrides,
  };

  const mockGameRules = {
    checkVisibility: jest.fn().mockReturnValue(true),
    buildRequirementContext: jest.fn().mockReturnValue({}),
    checkRequirement: jest.fn().mockReturnValue(true),
    compareValues: jest.fn((a: number, b: number, op: string) => {
      if (op === 'gte') return a >= b;
      if (op === 'lte') return a <= b;
      if (op === 'eq') return a === b;
      return true;
    }),
    countTeamTraits: jest.fn().mockReturnValue(0),
  };

  const mockTickService = {
    getCurrentTick: jest.fn().mockResolvedValue(1000),
    getTickInfo: jest.fn().mockResolvedValue({ currentTick: 1000, currentRate: 1 }),
  };

  const service = new MissionService(
    mockPrisma as any,
    {} as any, // entityService
    {} as any, // currencyService
    {} as any, // playerService
    mockTickService as any,
    {} as any, // inventoryService
    mockGameRules as any,
    { createNotification: jest.fn() } as any,
    { emit: jest.fn() } as any,
  );

  return { service, mockPrisma, mockGameRules, mockTickService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MissionService — startMission', () => {
  it('throws NotFoundException when mission def does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.missionDef.findUnique.mockResolvedValue(null);

    await expect(service.startMission('user-1', 'nonexistent', [])).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when mission is disabled', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.missionDef.findUnique.mockResolvedValue(makeMissionDef({ enabled: false }));
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());

    await expect(service.startMission('user-1', 'quick_gather', [])).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.missionDef.findUnique.mockResolvedValue(makeMissionDef());
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.startMission('user-1', 'quick_gather', [])).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when anti-whale active mission cap is reached', async () => {
    const { service, mockPrisma } = buildService();
    const user = makeUser({ keeperLevel: 1 });
    mockPrisma.missionDef.findUnique.mockResolvedValue(makeMissionDef());
    mockPrisma.user.findUnique.mockResolvedValue(user);
    // At keeper level 1, maxActiveMissions = floor(1/20) + 2 = 2
    mockPrisma.job.count.mockResolvedValue(2);

    await expect(service.startMission('user-1', 'quick_gather', [])).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when assigned entity is not idle', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.missionDef.findUnique.mockResolvedValue(makeMissionDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.entity.findFirst.mockResolvedValue(makeEntity({ state: { status: 'mission' } }));

    await expect(service.startMission('user-1', 'quick_gather', ['entity-1'])).rejects.toThrow(BadRequestException);
  });

  it('creates a job and returns mission response when all conditions are met', async () => {
    const { service, mockPrisma } = buildService();
    const job = makeJob();
    mockPrisma.missionDef.findUnique.mockResolvedValue(makeMissionDef());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.entity.findFirst.mockResolvedValue(makeEntity());
    mockPrisma.job.create.mockResolvedValue(job);

    const result = await service.startMission('user-1', 'quick_gather', ['entity-1']);

    expect(mockPrisma.job.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(job.id);
    expect(result.defId).toBe('quick_gather');
  });
});

describe('MissionService — completeMission', () => {
  it('throws NotFoundException when no active mission is found', async () => {
    const { service, mockPrisma } = buildService();
    mockPrisma.job.findFirst.mockResolvedValue(null);

    await expect(service.completeMission('user-1', 'job-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when mission timer has not expired', async () => {
    const { service, mockPrisma, mockTickService } = buildService();
    // currentTick = 1000, startTick = 0, durationTicks = 9999 → not complete
    mockPrisma.job.findFirst.mockResolvedValue(makeJob({ timer: { startTick: 0, durationTicks: 9999 } }));
    mockTickService.getCurrentTick.mockResolvedValue(1000);

    await expect(service.completeMission('user-1', 'job-1')).rejects.toThrow(BadRequestException);
  });
});
