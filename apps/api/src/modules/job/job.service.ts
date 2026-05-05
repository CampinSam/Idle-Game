import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityService } from '../entity/entity.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { PatchBuilder } from '../commands/patch-builder';
import { serializeEntityFull } from '../entity/entity-stats.util';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private pubsub: PubSubService,
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
              definition: { include: { equipmentSchema: true } },
            },
          })
        : [];

      const notifWhere = {
        userId,
        sourceType: 'job_ready',
        sourceId: jobId,
        archivedAt: null,
      };
      const stale = await tx.notification.findMany({ where: notifWhere });
      const now = new Date();
      if (stale.length > 0) {
        await tx.notification.updateMany({
          where: notifWhere,
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
}
