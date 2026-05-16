import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NotificationService } from '../notification/notification.service';
import { TickService } from './tick.service';
import { GlobalPowerService } from '../global-power/global-power.service';
import { createJobReadyNotifications } from '../job/job-notification.helper';

const POLL_INTERVAL_MS = 200;
const TICK_SYNC_INTERVAL_MS = 30_000;

/**
 * In-memory set of IDs processed in a recent poll cycle.
 * Protects against double-firing on the same entity/job if the DB write
 * from the previous cycle hasn't committed before the next cycle runs.
 * Each entry expires after DEDUP_TTL_MS.
 */
const DEDUP_TTL_MS = 5_000;

interface DedupEntry {
  expiresAt: number;
}

@Injectable()
export class TickEventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickEventProcessorService.name);
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private tickSyncInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly processedEntityIds = new Map<string, DedupEntry>();
  private readonly processedJobIds = new Map<string, DedupEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickService: TickService,
    private readonly pubsub: PubSubService,
    private readonly notificationService: NotificationService,
    private readonly globalPowerService: GlobalPowerService,
  ) {}

  onModuleInit() {
    this.pollInterval = setInterval(() => {
      if (!this.running) {
        this.running = true;
        this.processTick().catch((err) => {
          this.logger.error('TickEventProcessor error', err);
        }).finally(() => {
          this.running = false;
        });
      }
    }, POLL_INTERVAL_MS);
    this.logger.log(`TickEventProcessor started (interval=${POLL_INTERVAL_MS}ms)`);

    this.tickSyncInterval = setInterval(() => {
      this.broadcastTickSync().catch((err) => {
        this.logger.warn('tick.sync broadcast failed', err);
      });
    }, TICK_SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.tickSyncInterval) {
      clearInterval(this.tickSyncInterval);
      this.tickSyncInterval = null;
    }
  }

  private async broadcastTickSync(): Promise<void> {
    const info = await this.tickService.getTickInfo();
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: info.currentTick,
      tickRate: info.currentRate,
      serverTime: info.serverTime,
      boosts: info.activeBoosts,
    });
  }

  private evictExpiredDedup() {
    const now = Date.now();
    for (const [id, entry] of this.processedEntityIds) {
      if (entry.expiresAt <= now) this.processedEntityIds.delete(id);
    }
    for (const [id, entry] of this.processedJobIds) {
      if (entry.expiresAt <= now) this.processedJobIds.delete(id);
    }
  }

  private markEntityProcessed(id: string) {
    this.processedEntityIds.set(id, { expiresAt: Date.now() + DEDUP_TTL_MS });
  }

  private markJobProcessed(id: string) {
    this.processedJobIds.set(id, { expiresAt: Date.now() + DEDUP_TTL_MS });
  }

  private async processTick(): Promise<void> {
    this.evictExpiredDedup();
    const currentTick = await this.tickService.getCurrentTick();
    await Promise.all([
      this.processInjuryRecovery(currentTick),
      this.processJobReadiness(currentTick),
      this.globalPowerService.expireStale().catch((err) =>
        this.logger.warn('Global power expiry check failed', err),
      ),
    ]);
  }

  private async processInjuryRecovery(currentTick: number): Promise<void> {
    const toRecover = await (this.prisma as any).entity.findMany({
      where: {
        injuredUntilTick: { not: null, lte: currentTick },
        state: { path: ['status'], equals: 'injured' },
      },
      select: { id: true, ownerUserId: true, state: true },
    });

    if (toRecover.length === 0) return;

    const fresh = toRecover.filter((e: any) => !this.processedEntityIds.has(e.id));
    if (fresh.length === 0) return;

    this.logger.log(`Recovering ${fresh.length} injured entities via SSE push`);

    const byUser = new Map<string, Array<{ id: string; state: any }>>();
    for (const ent of fresh) {
      if (!ent.ownerUserId) continue;
      this.markEntityProcessed(ent.id);
      const list = byUser.get(ent.ownerUserId) ?? [];
      list.push({ id: ent.id, state: ent.state });
      byUser.set(ent.ownerUserId, list);
    }

    for (const [userId, entities] of byUser) {
      try {
        await this.recoverEntitiesForUser(userId, entities);
      } catch (err) {
        this.logger.warn(`Injury recovery failed for user ${userId}: ${err}`);
      }
    }
  }

  private async recoverEntitiesForUser(
    userId: string,
    entities: Array<{ id: string; state: any }>,
  ): Promise<void> {
    for (const { id, state } of entities) {
      const existing = (state as any) || {};
      await (this.prisma as any).entity.update({
        where: { id },
        data: {
          state: { ...existing, status: 'idle' },
          injuredUntilTick: null,
        },
      });
    }

    const entityIds = entities.map((e) => e.id);
    const recovered = await (this.prisma as any).entity.findMany({
      where: { id: { in: entityIds }, ownerUserId: userId },
      include: { equipment: true, definition: true },
    });

    const { serializeEntityFull } = await import('../entity/entity-stats.util');

    const patches: any[] = [];
    for (const entity of recovered) {
      try {
        const payload = await serializeEntityFull(this.prisma, entity);
        patches.push({ op: 'upsert', entity: 'entity', id: entity.id, data: payload });
      } catch (err) {
        this.logger.warn(`Failed to serialize entity ${entity.id} for delta: ${err}`);
      }
    }

    if (patches.length === 0) return;

    const delta = await (this.prisma as any).playerDelta.create({
      data: { userId, patches: patches as any, ui: [] as any },
    });

    this.pubsub.publish(`player:${userId}`, {
      userId,
      deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
    });

    this.logger.log(`Pushed injury-recovery delta for user ${userId} (${entityIds.length} entities)`);
  }

  private async processJobReadiness(currentTick: number): Promise<void> {
    const readyJobs = await (this.prisma as any).job.findMany({
      where: {
        readyAtTick: { not: null, lte: currentTick },
        status: 'active',
      },
      select: { id: true, userId: true, type: true, defId: true, timer: true, team: true, data: true, results: true },
    });

    if (readyJobs.length === 0) return;

    const fresh = readyJobs.filter((j: any) => !this.processedJobIds.has(j.id));
    if (fresh.length === 0) return;

    this.logger.log(`Transitioning ${fresh.length} ready jobs to ready_notified via SSE push`);

    const byUser = new Map<string, any[]>();
    for (const job of fresh) {
      this.markJobProcessed(job.id);
      const list = byUser.get(job.userId) ?? [];
      list.push(job);
      byUser.set(job.userId, list);
    }

    for (const [userId, jobs] of byUser) {
      try {
        await this.notifyJobsReadyForUser(userId, jobs);
      } catch (err) {
        this.logger.warn(`Job readiness processing failed for user ${userId}: ${err}`);
      }
    }
  }

  private async notifyJobsReadyForUser(userId: string, jobs: any[]): Promise<void> {
    const jobIds = jobs.map((j) => j.id);

    await (this.prisma as any).job.updateMany({
      where: { id: { in: jobIds }, status: 'active' },
      data: { status: 'ready_notified' },
    });

    const createdNotifs = await createJobReadyNotifications(
      this.prisma,
      this.notificationService,
      this.logger,
      userId,
      jobs,
    );

    const updatedJobs = await (this.prisma as any).job.findMany({
      where: { id: { in: jobIds }, userId },
    });

    const notifPatches = createdNotifs.map((n: any) => ({
      op: 'upsert' as const,
      entity: 'notification',
      id: n.id,
      data: n,
    }));

    const jobPatches = updatedJobs.map((j: any) => {
      const timer = j.timer as any;
      return {
        op: 'upsert' as const,
        entity: 'job',
        id: j.id,
        data: {
          id: j.id,
          type: j.type,
          defId: j.defId,
          status: j.status,
          timer: j.timer,
          team: j.team,
          data: j.data,
          results: j.results,
          startTick: timer?.startTick ?? null,
          durationTicks: timer?.durationTicks ?? null,
        },
      };
    });

    const patches = [...notifPatches, ...jobPatches];
    if (patches.length === 0) return;

    const delta = await (this.prisma as any).playerDelta.create({
      data: { userId, patches: patches as any, ui: [] as any },
    });

    this.pubsub.publish(`player:${userId}`, {
      userId,
      deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
    });

    this.logger.log(`Pushed job-ready delta for user ${userId} (${jobs.length} jobs)`);
  }
}
