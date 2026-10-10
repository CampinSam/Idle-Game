import { Controller, Get, Post, Param, Body, UseGuards, NotFoundException, BadRequestException, Logger, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { NotificationService } from '../notification/notification.service';
import { CurrencyService } from '../currency/currency.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import { JobService } from './job.service';
import { JobPreviewService, JobPreviewDto } from './job-preview.service';
import { JOB_TYPE_CONFIG } from './job.constants';
import { fetchCurrencyMap } from '../commands/patch-builder';
import { MissionService } from '../mission/mission.service';
import { CraftingService } from '../crafting/crafting.service';
import { LocationService } from '../location/location.service';
import { DustingService } from '../dusting/dusting.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobController {
  private readonly logger = new Logger(JobController.name);

  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
    private notificationService: NotificationService,
    private currencyService: CurrencyService,
    private pubsub: PubSubService,
    private jobService: JobService,
    private idempotency: IdempotencyService,
    private jobPreviewService: JobPreviewService,
    private missionService: MissionService,
    private craftingService: CraftingService,
    private locationService: LocationService,
    private dustingService: DustingService,
  ) {}

  @Post('preview')
  async getJobPreview(
    @CurrentUser() user: { id: string },
    @Body() dto: JobPreviewDto,
  ) {
    return this.jobPreviewService.getPreview(user.id, dto);
  }

  @Post(':id/cancel')
  async cancelJob(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      'POST:/jobs/:id/cancel',
      idempotencyKey,
      { jobId: id },
      () => this.jobService.cancelJob(user.id, id),
    );
  }

  private async getDefForJob(job: any): Promise<any> {
    const config = JOB_TYPE_CONFIG[job.type];
    if (!config) return null;
    return (this.prisma as any)[config.defTable].findFirst({ where: { OR: [{ id: job.defId }, { key: job.defId }] } });
  }

  private getDefTimer(job: any, def: any): any {
    if (job.type === 'DustingJob') {
      return (def?.dustingData as any)?.timer ?? null;
    }
    return def?.timer ?? null;
  }

  private extractSkipInfo(defTimer: any) {
    if (!defTimer || !defTimer.skipable) return null;
    return {
      skipable: true,
      skipCost: Array.isArray(defTimer.skip_cost) ? defTimer.skip_cost : [],
      skipType: defTimer.skip_type || 'absolute',
      totalDurationSeconds: defTimer.duration || 0,
    };
  }

  @Get(':id')
  async getJob(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const job = await (this.prisma as any).job.findFirst({
      where: { id, userId: user.id },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const def = await this.getDefForJob(job);
    const defName = def?.name || 'Unknown';
    const skipInfo = this.extractSkipInfo(this.getDefTimer(job, def));

    const tickInfo = await this.tickService.getTickInfo();

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      defId: job.defId,
      timer: job.timer,
      team: job.team,
      results: job.results ?? null,
      data: job.data,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      defName,
      skipInfo,
      tickInfo: {
        currentTick: tickInfo.currentTick,
        currentRate: tickInfo.currentRate,
      },
      serverTime: new Date().toISOString(),
    };
  }

  @Post(':id/skip')
  async skipJob(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      'POST:/jobs/:id/skip',
      idempotencyKey,
      { jobId: id },
      () => this._doSkipJob(user, id),
    );
  }

  private async _doSkipJob(user: { id: string }, id: string) {
    const job = await (this.prisma as any).job.findFirst({
      where: { id, userId: user.id, status: { in: ['active', 'ready_notified'] } },
    });
    if (!job) throw new NotFoundException('Active job not found');

    const def = await this.getDefForJob(job);
    if (!def) throw new NotFoundException('Definition not found');

    const defTimer = this.getDefTimer(job, def) as any;
    if (!defTimer?.skipable) throw new BadRequestException('This job cannot be skipped');

    const skipCostEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(defTimer.skip_cost) ? defTimer.skip_cost : [];
    const skipType: string = defTimer.skip_type || 'absolute';

    if (skipCostEntries.length === 0) {
      throw new BadRequestException('No skip cost configured');
    }

    const tickInfo = await this.tickService.getTickInfo();
    const currentTick = tickInfo.currentTick;
    const startTick = job.timer?.startTick ?? 0;
    const durationTicks = job.timer?.durationTicks ?? 0;
    const targetTick = startTick + durationTicks;
    const remainingTicks = Math.max(0, targetTick - currentTick);

    if (remainingTicks <= 0) {
      throw new BadRequestException('Job is already complete, no need to skip');
    }

    let costMultiplier = 1;
    if (skipType === 'scaling') {
      costMultiplier = durationTicks > 0 ? remainingTicks / durationTicks : 0;
    }

    const finalCosts = skipCostEntries.map((entry) => ({
      type: entry.type,
      id: entry.id,
      amount: Math.max(1, Math.ceil((entry.amount ?? 0) * costMultiplier)),
    }));

    await this.prisma.$transaction(async (tx) => {
      for (const cost of finalCosts) {
        if (cost.type === 'currency') {
          await this.currencyService.spendTx(tx as any, {
            userId: user.id,
            currencyId: cost.id,
            amount: cost.amount,
            reason: `Skip ${JOB_TYPE_CONFIG[job.type]?.label || 'Job'}: ${def.name}`,
            sourceType: 'job_skip',
            sourceId: job.id,
          });
        }
      }

      await (tx as any).job.update({
        where: { id: job.id },
        data: {
          timer: { startTick, durationTicks: Math.max(0, currentTick - startTick) },
          readyAtTick: currentTick,
          status: 'skipped',
        },
      });
    }, { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' });

    this.logger.log(`Job ${id} skipped by user ${user.id}. Costs: ${JSON.stringify(finalCosts)}`);

    // Auto-complete immediately — the player paid to skip the wait, so they
    // don't need to press a separate "Complete" button.
    try {
      await this._autoCompleteAfterSkip(user.id, job);
    } catch (err) {
      // Skip cost was already spent; log the failure but don't surface it
      // to the player. The job will remain in skipped state and they
      // can complete it manually.
      this.logger.warn(`Skip auto-complete failed for job ${id}: ${err}`);
    }

    // Return the updated job so the client can apply the patch immediately
    // without waiting for the SSE delta.
    const updatedJob = await (this.prisma as any).job.findUnique({ where: { id: job.id } });

    return {
      skipped: true,
      costs: finalCosts,
      job: updatedJob,
    };
  }

  private async _autoCompleteAfterSkip(userId: string, job: any): Promise<void> {
    switch (job.type) {
      case 'MissionJob':
        await this.missionService.completeMission(userId, job.id);
        break;

      case 'CraftingJob':
        await this.craftingService.collectCrafting(userId, job.id);
        break;

      case 'BuildingJob': {
        const data = job.data as any;
        if (!data?.locationId || !data?.buildingId) {
          throw new Error(`BuildingJob ${job.id} missing locationId or buildingId in data field`);
        }
        await this.locationService.completeBuilding(userId, data.locationId, data.buildingId);
        break;
      }

      case 'DustingJob':
        await this.dustingService.collectDusting(userId, { jobId: job.id });
        break;

      default:
        this.logger.warn(`_autoCompleteAfterSkip: unhandled job type "${job.type}" for job ${job.id}`);
    }

    // Push a delta so SSE subscribers see the updated job state, freed entities,
    // and updated currency balances immediately without waiting for the next tick-sync.
    try {
      const [updatedJob, currencyMap, updatedPlayer] = await Promise.all([
        (this.prisma as any).job.findUnique({ where: { id: job.id } }),
        fetchCurrencyMap(this.prisma, userId),
        (this.prisma as any).user.findUnique({ where: { id: userId } }),
      ]);

      const patches: any[] = [];
      if (updatedJob) {
        patches.push({ op: 'upsert', entity: 'job', id: updatedJob.id, data: updatedJob });
      }

      if (job.type === 'MissionJob') {
        const teamIds: string[] = Array.isArray(job.team) ? job.team : [];
        if (teamIds.length > 0) {
          const entities = await (this.prisma as any).entity.findMany({
            where: { id: { in: teamIds }, ownerUserId: userId },
            include: { equipment: true, definition: true },
          });
          for (const entity of entities) {
            patches.push({ op: 'upsert', entity: 'entity', id: entity.id, data: entity });
          }
        }
      }

      // Always push currency + player so the UI reflects the skip cost and rewards.
      patches.push({ op: 'upsert', entity: 'currencyBalance', id: '_', data: currencyMap });
      if (updatedPlayer) {
        patches.push({ op: 'upsert', entity: 'player', id: updatedPlayer.id, data: updatedPlayer });
      }

      const delta = await (this.prisma as any).playerDelta.create({
        data: { userId, patches: patches as any, ui: [] as any },
      });
      this.pubsub.publish(`player:${userId}`, { userId, deltaId: delta.id.toString() });
    } catch (err) {
      this.logger.warn(`Failed to push post-skip delta for user ${userId}: ${err}`);
    }
  }

  @Post('notify')
  async markJobsNotified(@CurrentUser() user: { id: string }, @Body() dto: { jobIds: string[] }) {
    const { jobIds } = dto;
    if (!jobIds || jobIds.length === 0) return { updated: 0 };

    const { updated, createdNotifs } = await this.jobService.notifyReadyJobs(user.id, jobIds);

    if (createdNotifs.length > 0) {
      try {
        const notifPatches = createdNotifs.map((n: any) => ({
          op: 'upsert' as const,
          entity: 'notification',
          id: n.id,
          data: n,
        }));

        const updatedJobs = await (this.prisma as any).job.findMany({
          where: { id: { in: jobIds }, userId: user.id },
        });
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

        const delta = await (this.prisma as any).playerDelta.create({
          data: {
            userId: user.id,
            patches: [...notifPatches, ...jobPatches] as any,
            ui: [] as any,
          },
        });

        this.pubsub.publish(`player:${user.id}`, {
          userId: user.id,
          deltaId: delta.id.toString(),
        });
      } catch (err) {
        this.logger.warn(`Failed to push notification delta for user ${user.id}: ${err}`);
      }
    }

    return { updated };
  }
}
