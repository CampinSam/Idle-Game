import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityService } from '../entity/entity.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { PatchBuilder } from '../commands/patch-builder';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private pubsub: PubSubService,
  ) {}

  async cancelJob(userId: string, jobId: string) {
    const allowedTypes = new Set(['MissionJob', 'CraftingJob', 'BuildingJob']);

    const { jobType, teamIds, freedEntities, deltaId } = await this.prisma.$transaction(
      async (tx: any) => {
        // Read inside the tx so the type/team data we use to build patches
        // belongs to the same logical attempt as the conditional flip below.
        // (Default Prisma isolation is read-committed; the actual race
        // protection is the atomic updateMany guard a few lines down.)
        const job = await tx.job.findFirst({
          where: { id: jobId, userId, status: 'active' },
        });
        if (!job) {
          throw new NotFoundException('Active job not found');
        }

        if (!allowedTypes.has(job.type)) {
          throw new BadRequestException(`Cannot cancel job of type ${job.type}`);
        }

        const ids: string[] = Array.isArray(job.team) ? job.team : [];

        // Race guard: atomic conditional flip from 'active' → 'cancelled'.
        // If a concurrent transition (complete / collect / skip) already
        // moved the job out of 'active', count will be 0 and we abort
        // (rolling back any other tx writes we were about to make).
        const updated = await tx.job.updateMany({
          where: { id: jobId, userId, status: 'active' },
          data: { status: 'cancelled' },
        });
        if (updated.count === 0) {
          throw new NotFoundException('Active job not found');
        }

        // Atomic: any failure to release an entity rolls back the whole
        // cancellation (job stays 'active', no delta emitted) so we never
        // leave team entities stuck non-idle while the job vanishes.
        for (const entityId of ids) {
          await this.entityService.setEntityStatus(entityId, userId, 'idle', tx);
        }

        const refreshed = ids.length
          ? await tx.entity.findMany({
              where: { id: { in: ids }, ownerUserId: userId },
              include: { equipment: true },
            })
          : [];

        // Notification cleanup: archive any notifications sourced from this
        // job (job_ready, etc.) so they don't linger in the player's inbox
        // pointing at a job that no longer exists. Done in the same tx and
        // mirrored as patches so the client UI updates immediately.
        const stale = await tx.notification.findMany({
          where: { userId, sourceId: jobId, archivedAt: null },
        });
        const now = new Date();
        if (stale.length > 0) {
          await tx.notification.updateMany({
            where: { userId, sourceId: jobId, archivedAt: null },
            data: { archivedAt: now, dismissedAt: now, readAt: now },
          });
        }

        const pb = new PatchBuilder();
        pb.deleteJob(jobId);
        for (const entity of refreshed) {
          pb.upsertEntity(entity);
        }
        // Archived notifications are excluded from bootstrap, so the client
        // should drop them from its store outright — emit a delete patch.
        for (const notif of stale) {
          pb.delete('notification', notif.id);
        }
        const patches = pb.build();

        const delta = await tx.playerDelta.create({
          data: {
            userId,
            patches: patches as any,
            ui: [] as any,
          },
        });

        return {
          jobType: job.type as string,
          teamIds: ids,
          freedEntities: refreshed.length,
          deltaId: typeof delta.id === 'bigint' ? delta.id.toString() : String(delta.id),
        };
      },
    );

    try {
      this.pubsub.publish(`player:${userId}`, { userId, deltaId } as any);
    } catch (err) {
      this.logger.warn(`cancelJob: pubsub publish failed for ${userId}: ${err}`);
    }

    this.logger.log(
      `cancelJob: userId=${userId.slice(0, 8)} jobId=${jobId.slice(0, 8)} type=${jobType} freed=${freedEntities}`,
    );

    return {
      cancelled: true,
      jobId,
      jobType,
      freedEntityIds: teamIds,
      deltaId,
    };
  }
}
