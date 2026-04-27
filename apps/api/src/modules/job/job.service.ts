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

        for (const entityId of ids) {
          try {
            await this.entityService.setEntityStatus(entityId, userId, 'idle', tx);
          } catch (err) {
            this.logger.warn(
              `cancelJob: failed to free entity ${entityId} (job ${jobId.slice(0, 8)}): ${err}`,
            );
          }
        }

        const refreshed = ids.length
          ? await tx.entity.findMany({
              where: { id: { in: ids }, ownerUserId: userId },
              include: { equipment: true },
            })
          : [];

        const pb = new PatchBuilder();
        pb.deleteJob(jobId);
        for (const entity of refreshed) {
          pb.upsertEntity(entity);
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
