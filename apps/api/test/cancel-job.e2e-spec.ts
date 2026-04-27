import { NotFoundException } from '@nestjs/common';
import { JobService } from '../src/modules/job/job.service';

const makeJob = (overrides: Record<string, any> = {}) => ({
  id: 'job-1',
  userId: 'user-1',
  type: 'MissionJob',
  defId: 'quick_gather',
  status: 'active',
  timer: { startTick: 0, durationTicks: 60 },
  team: ['entity-1', 'entity-2'],
  data: { difficulty: 100, seed: 'seed-1' },
  results: null,
  ...overrides,
});

const makeEntity = (id: string, overrides: Record<string, any> = {}) => ({
  id,
  ownerUserId: 'user-1',
  state: { status: 'idle' },
  equipment: [],
  ...overrides,
});

function buildService() {
  let nextDeltaId = 1n;

  const tx = {
    job: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    entity: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    playerDelta: {
      create: jest.fn().mockImplementation((args: any) => {
        const id = nextDeltaId++;
        return Promise.resolve({ id, ...args.data });
      }),
    },
    currency: { spend: jest.fn(), credit: jest.fn() },
    item: { update: jest.fn() },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    },
  };

  const mockPrisma: any = {
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };

  const mockEntityService: any = {
    setEntityStatus: jest.fn().mockImplementation(
      async (entityId: string, _userId: string, status: string, txArg: any) => {
        await txArg.entity.update({
          where: { id: entityId },
          data: { state: { status } },
        });
        return { id: entityId, status };
      },
    ),
  };

  const mockPubsub: any = { publish: jest.fn() };

  const service = new JobService(mockPrisma, mockEntityService, mockPubsub);

  return { service, mockPrisma, mockEntityService, mockPubsub, tx };
}

describe('JobService — cancelJob', () => {
  it('throws NotFoundException when job does not exist', async () => {
    const { service, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(null);

    await expect(service.cancelJob('user-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(tx.job.updateMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when job belongs to a different user', async () => {
    const { service, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(null);

    await expect(service.cancelJob('user-2', 'job-1')).rejects.toThrow(NotFoundException);
    expect(tx.job.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', userId: 'user-2', status: 'active' },
    });
  });

  it.each(['ready_notified', 'completed', 'failed', 'collected', 'cancelled'])(
    'throws NotFoundException when job is in status %s (only active is cancellable)',
    async (status) => {
      const { service, tx } = buildService();
      tx.job.findFirst.mockResolvedValue(null);

      await expect(service.cancelJob('user-1', 'job-1')).rejects.toThrow(NotFoundException);
      expect(tx.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', userId: 'user-1', status: 'active' },
      });
      void status;
    },
  );

  it('throws NotFoundException when a concurrent transition flips status mid-tx (race guard)', async () => {
    const { service, tx, mockEntityService } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: ['entity-1'] }));
    tx.job.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.cancelJob('user-1', 'job-1')).rejects.toThrow(NotFoundException);
    expect(mockEntityService.setEntityStatus).not.toHaveBeenCalled();
    expect(tx.playerDelta.create).not.toHaveBeenCalled();
  });

  it('frees every team entity to idle, marks job cancelled, and emits a delta — without any currency or item writes', async () => {
    const { service, mockEntityService, mockPubsub, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: ['entity-1', 'entity-2'] }));
    tx.entity.findMany.mockResolvedValue([
      makeEntity('entity-1', { state: { status: 'idle' } }),
      makeEntity('entity-2', { state: { status: 'idle' } }),
    ]);

    const result = await service.cancelJob('user-1', 'job-1');

    expect(result).toEqual({ cancelled: true });

    expect(tx.job.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', userId: 'user-1', status: 'active' },
      data: { status: 'cancelled' },
    });

    expect(mockEntityService.setEntityStatus).toHaveBeenCalledTimes(2);
    expect(mockEntityService.setEntityStatus).toHaveBeenNthCalledWith(1, 'entity-1', 'user-1', 'idle', tx);
    expect(mockEntityService.setEntityStatus).toHaveBeenNthCalledWith(2, 'entity-2', 'user-1', 'idle', tx);

    expect(tx.currency.spend).not.toHaveBeenCalled();
    expect(tx.currency.credit).not.toHaveBeenCalled();
    expect(tx.item.update).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();

    expect(tx.playerDelta.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.playerDelta.create.mock.calls[0][0];
    expect(createArgs.data.userId).toBe('user-1');
    expect(createArgs.data.ui).toEqual([]);
    expect(createArgs.data).not.toHaveProperty('source');
    const patches = createArgs.data.patches as any[];
    expect(patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'delete', entity: 'job', id: 'job-1' }),
      expect.objectContaining({ op: 'upsert', entity: 'entity', id: 'entity-1' }),
      expect.objectContaining({ op: 'upsert', entity: 'entity', id: 'entity-2' }),
    ]));
    expect(patches).toHaveLength(3);

    expect(mockPubsub.publish).toHaveBeenCalledWith(
      'player:user-1',
      expect.objectContaining({ userId: 'user-1', deltaId: expect.stringMatching(/^\d+$/) }),
    );
  });

  it('handles a job with an empty team (no entities to free)', async () => {
    const { service, mockEntityService, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: [] }));

    const result = await service.cancelJob('user-1', 'job-1');

    expect(result).toEqual({ cancelled: true });
    expect(mockEntityService.setEntityStatus).not.toHaveBeenCalled();
    expect(tx.entity.findMany).not.toHaveBeenCalled();
    const patches = tx.playerDelta.create.mock.calls[0][0].data.patches as any[];
    expect(patches).toEqual([
      expect.objectContaining({ op: 'delete', entity: 'job', id: 'job-1' }),
    ]);
  });

  it('rolls back the entire transaction when any team entity cannot be released (atomicity)', async () => {
    const { service, mockEntityService, mockPubsub, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: ['entity-1', 'entity-2'] }));
    mockEntityService.setEntityStatus.mockRejectedValueOnce(new Error('entity-1 missing'));

    await expect(service.cancelJob('user-1', 'job-1')).rejects.toThrow('entity-1 missing');

    expect(tx.entity.findMany).not.toHaveBeenCalled();
    expect(tx.notification.findMany).not.toHaveBeenCalled();
    expect(tx.playerDelta.create).not.toHaveBeenCalled();
    expect(mockPubsub.publish).not.toHaveBeenCalled();
  });

  it('archives notifications sourced from the cancelled job and emits a delete patch', async () => {
    const { service, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: ['entity-1'] }));
    tx.entity.findMany.mockResolvedValue([makeEntity('entity-1')]);
    tx.notification.findMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'job_ready',
        sourceType: 'job_ready',
        sourceId: 'job-1',
        archivedAt: null,
      },
    ]);
    tx.notification.updateMany.mockResolvedValue({ count: 1 });

    await service.cancelJob('user-1', 'job-1');

    const notifWhere = {
      userId: 'user-1',
      sourceType: 'job_ready',
      sourceId: 'job-1',
      archivedAt: null,
    };
    expect(tx.notification.findMany).toHaveBeenCalledWith({ where: notifWhere });
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: notifWhere,
      data: expect.objectContaining({
        archivedAt: expect.any(Date),
        dismissedAt: expect.any(Date),
        readAt: expect.any(Date),
      }),
    });

    const patches = tx.playerDelta.create.mock.calls[0][0].data.patches as any[];
    const notifPatch = patches.find((p) => p.entity === 'notification' && p.id === 'notif-1');
    expect(notifPatch).toBeDefined();
    expect(notifPatch.op).toBe('delete');
  });

  it('skips notification patches when no notifications reference the job', async () => {
    const { service, tx } = buildService();
    tx.job.findFirst.mockResolvedValue(makeJob({ team: ['entity-1'] }));
    tx.entity.findMany.mockResolvedValue([makeEntity('entity-1')]);
    tx.notification.findMany.mockResolvedValue([]);

    await service.cancelJob('user-1', 'job-1');

    expect(tx.notification.findMany).toHaveBeenCalled();
    expect(tx.notification.updateMany).not.toHaveBeenCalled();
    const patches = tx.playerDelta.create.mock.calls[0][0].data.patches as any[];
    expect(patches.find((p) => p.entity === 'notification')).toBeUndefined();
  });

  it('cancels CraftingJob and BuildingJob types', async () => {
    for (const jobType of ['CraftingJob', 'BuildingJob']) {
      const { service, tx } = buildService();
      tx.job.findFirst.mockResolvedValue(makeJob({ type: jobType, team: ['entity-1'] }));
      tx.entity.findMany.mockResolvedValue([makeEntity('entity-1')]);

      const result = await service.cancelJob('user-1', 'job-1');
      expect(result).toEqual({ cancelled: true });
    }
  });
});
