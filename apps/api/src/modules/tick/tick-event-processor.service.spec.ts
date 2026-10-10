import { Logger } from '@nestjs/common';
import { TickEventProcessorService } from './tick-event-processor.service';

/**
 * Unit tests for the in-memory deduplication guard in TickEventProcessorService.
 *
 * The guard prevents double-notification when a job's DB write (active →
 * ready_notified) hasn't committed before the next poll cycle runs.  The
 * service marks each job ID in an in-memory Map immediately before the async
 * write, so subsequent cycles that see the same stale 'active' row skip it.
 *
 * Tests here drive processJobReadiness directly (via the private accessor)
 * so they don't need real timers or module bootstrapping.
 */

function makeJob(overrides: Partial<any> = {}) {
  return {
    id: 'job-1',
    userId: 'user-1',
    type: 'mission',
    defId: 'def-1',
    timer: { startTick: 1, durationTicks: 10 },
    team: [],
    data: {},
    results: null,
    status: 'active',
    readyAtTick: 5,
    ...overrides,
  };
}

function makeService() {
  let deltaCounter = 0;

  const jobRows = new Map<string, any>();

  const prisma: any = {
    job: {
      findMany: jest.fn(async ({ where }: any) => {
        const results: any[] = [];
        for (const row of jobRows.values()) {
          if (where?.status && row.status !== where.status) continue;
          if (where?.readyAtTick?.lte !== undefined && row.readyAtTick > where.readyAtTick.lte) continue;
          if (where?.readyAtTick?.not === null && row.readyAtTick == null) continue;
          results.push(row);
        }
        return results;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of jobRows.values()) {
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          if (where.status && row.status !== where.status) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      }),
    },
    playerDelta: {
      create: jest.fn(async () => ({ id: ++deltaCounter })),
    },
  };

  const tickService: any = {
    getCurrentTick: jest.fn(async () => 10),
  };

  const pubsub: any = {
    publish: jest.fn(),
    publishBroadcast: jest.fn(),
  };

  const notificationService: any = {
    createNotification: jest.fn(async () => ({ id: `notif-${Math.random()}` })),
  };

  const globalPowerService: any = {
    expireStale: jest.fn(async () => {}),
  };

  const boostService: any = {
    expireStaleBoosts: jest.fn(async () => 0),
  };

  const locationService: any = {
    completeBuilding: jest.fn(async () => ({ id: 'b1', updatedNotification: null })),
  };

  const definitionCache: any = { get: jest.fn(() => null), getAll: jest.fn(() => []), invalidate: jest.fn() };

  const svc = new TickEventProcessorService(
    prisma as any,
    tickService,
    pubsub,
    notificationService,
    globalPowerService,
    boostService,
    locationService,
    definitionCache,
  );

  (svc as any).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;

  return { svc, prisma, pubsub, notificationService, jobRows };
}

describe('TickEventProcessorService — dedup guard (job readiness)', () => {
  it('notifies a ready job exactly once when the same row appears in two consecutive cycles', async () => {
    const { svc, pubsub, prisma, jobRows } = makeService();

    const job = makeJob();
    jobRows.set(job.id, { ...job });

    const runCycle = () => (svc as any).processJobReadiness(10);

    await runCycle();
    expect(pubsub.publish).toHaveBeenCalledTimes(1);
    expect(prisma.job.updateMany).toHaveBeenCalledTimes(1);

    jobRows.set(job.id, { ...job, status: 'active' });

    await runCycle();

    expect(pubsub.publish).toHaveBeenCalledTimes(1);
    expect(prisma.job.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not emit a delta when no ready jobs exist', async () => {
    const { svc, pubsub } = makeService();

    await (svc as any).processJobReadiness(10);

    expect(pubsub.publish).not.toHaveBeenCalled();
  });

  it('processes independent jobs for different users without cross-contamination', async () => {
    const { svc, pubsub, jobRows } = makeService();

    jobRows.set('job-A', makeJob({ id: 'job-A', userId: 'user-1' }));
    jobRows.set('job-B', makeJob({ id: 'job-B', userId: 'user-2' }));

    await (svc as any).processJobReadiness(10);

    expect(pubsub.publish).toHaveBeenCalledTimes(2);
    const targets = pubsub.publish.mock.calls.map((c: any[]) => c[0]);
    expect(targets).toContain('player:user-1');
    expect(pubsub.publish.mock.calls[0][0]).not.toBe(pubsub.publish.mock.calls[1][0]);
  });

  it('re-processes a job after the dedup TTL has expired', async () => {
    const { svc, pubsub, jobRows } = makeService();

    const job = makeJob();
    jobRows.set(job.id, { ...job });

    await (svc as any).processJobReadiness(10);
    expect(pubsub.publish).toHaveBeenCalledTimes(1);

    const dedupMap: Map<string, { expiresAt: number }> = (svc as any).processedJobIds;
    for (const [id, entry] of dedupMap) {
      dedupMap.set(id, { expiresAt: Date.now() - 1 });
    }
    (svc as any).evictExpiredDedup();

    jobRows.set(job.id, { ...job, status: 'active' });

    await (svc as any).processJobReadiness(10);

    expect(pubsub.publish).toHaveBeenCalledTimes(2);
  });

  it('updateMany is always called with status: active guard so a stale second cycle cannot double-update', async () => {
    const { svc, prisma, jobRows } = makeService();

    const job = makeJob();
    jobRows.set(job.id, { ...job });

    await (svc as any).processJobReadiness(10);

    const firstCall = prisma.job.updateMany.mock.calls[0][0];
    expect(firstCall.where).toMatchObject({ status: 'active' });
  });
});
