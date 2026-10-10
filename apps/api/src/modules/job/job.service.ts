import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityService } from '../entity/entity.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { NotificationService } from '../notification/notification.service';
import { PatchBuilder } from '../commands/patch-builder';
import { serializeEntityFull } from '../entity/entity-stats.util';
import { createJobReadyNotifications } from './job-notification.helper';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private pubsub: PubSubService,
    private notificationService: NotificationService,
  ) {}

  async cancelJob(userId: string, jobId: string) {
    const deltaId = await this.prisma.$transaction(async (tx: any) => {
      const job = await tx.job.findFirst({
        where: { id: jobId, userId, status: 'active' },
      });
      if (!job) throw new NotFoundException('Active job not found');

      const ids: string[] = Array.isArray(job.team) ? job.team : [];

      const updated = await tx.job.updateMany({
        where: { id: jobId, userId, status: 'active' },
        data: { status: 'cancelled' },
      });
      if (updated.count === 0) throw new NotFoundException('Active job not found');

      for (const entityId of ids) {
        await this.entityService.setEntityStatus(entityId, userId, 'idle', tx);
      }

      const refreshed = ids.length
        ? await tx.entity.findMany({
            where: { id: { in: ids }, ownerUserId: userId },
            include: {
              equipment: true,
              definition: true,
            },
          })
        : [];

      const stale = await tx.notification.findMany({
        where: {
          userId,
          sourceId: jobId,
          sourceType: { in: ['job', 'job_ready'] },
          archivedAt: null,
        },
      });
      const now = new Date();
      if (stale.length > 0) {
        await tx.notification.updateMany({
          where: { id: { in: stale.map((n: any) => n.id) } },
          data: { archivedAt: now, dismissedAt: now, readAt: now },
        });
      }

      const pb = new PatchBuilder();
      pb.deleteJob(jobId);
      for (const entity of refreshed) {
        const payload = await serializeEntityFull(tx, entity);
        pb.upsertEntity(payload);
      }
      for (const notif of stale) pb.delete('notification', notif.id);

      const delta = await tx.playerDelta.create({
        data: { userId, patches: pb.build() as any, ui: [] as any },
      });

      return typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id);
    });

    try {
      this.pubsub.publish(`player:${userId}`, { userId, deltaId } as any);
    } catch (err) {
      this.logger.warn(`cancelJob: pubsub publish failed for ${userId}: ${err}`);
    }

    this.logger.log(`Job ${jobId} cancelled by user ${userId}`);

    return { cancelled: true };
  }

  async notifyReadyJobs(userId: string, jobIds: string[]): Promise<{ updated: number; createdNotifs: any[] }> {
    if (!jobIds || jobIds.length === 0) return { updated: 0, createdNotifs: [] };

    const jobs = await (this.prisma as any).job.findMany({
      where: { id: { in: jobIds }, userId, status: 'active' },
    });

    const createdNotifs = jobs.length > 0
      ? await createJobReadyNotifications(this.prisma, this.notificationService, this.logger, userId, jobs)
      : [];

    const result = await (this.prisma as any).job.updateMany({
      where: { id: { in: jobIds }, userId, status: 'active' },
      data: { status: 'ready_notified' },
    });

    return { updated: result.count, createdNotifs };
  }
}
