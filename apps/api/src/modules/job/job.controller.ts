import { Controller, Get, Post, Param, Body, UseGuards, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { NotificationService } from '../notification/notification.service';
import { CurrencyService } from '../currency/currency.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { JobService } from './job.service';

const JOB_TYPE_CONFIG: Record<string, { defTable: string; category: string; label: string; screen: string }> = {
  MissionJob: { defTable: 'missionDef', category: 'missions', label: 'Mission', screen: '/missions' },
  CraftingJob: { defTable: 'recipeDef', category: 'crafting', label: 'Crafting', screen: '/crafting' },
  BuildingJob: { defTable: 'buildingDef', category: 'buildings', label: 'Building', screen: '/locations' },
};

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
  ) {}

  @Post(':id/cancel')
  async cancelJob(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.jobService.cancelJob(user.id, id);
  }

  private async getDefForJob(job: any): Promise<any> {
    const config = JOB_TYPE_CONFIG[job.type];
    if (!config) return null;
    return (this.prisma as any)[config.defTable].findFirst({ where: { id: job.defId } });
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
    const skipInfo = this.extractSkipInfo(def?.timer);

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
  async skipJob(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const job = await (this.prisma as any).job.findFirst({
      where: { id, userId: user.id, status: { in: ['active', 'ready_notified'] } },
    });
    if (!job) throw new NotFoundException('Active job not found');

    const def = await this.getDefForJob(job);
    if (!def) throw new NotFoundException('Definition not found');

    const defTimer = def.timer as any;
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

    for (const cost of finalCosts) {
      if (cost.type === 'currency') {
        const balance = await this.currencyService.getBalance(user.id, cost.id);
        if (balance < cost.amount) {
          const currency = await (this.prisma as any).currency.findUnique({ where: { id: cost.id } });
          const name = currency?.name || cost.id;
          throw new BadRequestException(`Not enough ${name} (need ${cost.amount}, have ${balance})`);
        }
      }
    }

    for (const cost of finalCosts) {
      if (cost.type === 'currency') {
        await this.currencyService.spend({
          userId: user.id,
          currencyId: cost.id,
          amount: cost.amount,
          reason: `Skip ${JOB_TYPE_CONFIG[job.type]?.label || 'Job'}: ${def.name}`,
          sourceType: 'job_skip',
          sourceId: job.id,
        });
      }
    }

    await (this.prisma as any).job.update({
      where: { id: job.id },
      data: {
        timer: { startTick, durationTicks: Math.max(0, currentTick - startTick) },
      },
    });

    this.logger.log(`Job ${id} skipped by user ${user.id}. Costs: ${JSON.stringify(finalCosts)}`);

    return {
      skipped: true,
      costs: finalCosts,
    };
  }

  @Post('notify')
  async markJobsNotified(@CurrentUser() user: { id: string }, @Body() dto: { jobIds: string[] }) {
    const { jobIds } = dto;
    if (!jobIds || jobIds.length === 0) return { updated: 0 };

    const jobs = await (this.prisma as any).job.findMany({
      where: { id: { in: jobIds }, userId: user.id, status: 'active' },
    });

    const createdNotifs: any[] = [];

    if (jobs.length > 0) {
      const byType = new Map<string, any[]>();
      for (const job of jobs) {
        const list = byType.get(job.type) || [];
        list.push(job);
        byType.set(job.type, list);
      }

      for (const [type, typeJobs] of byType) {
        const config = JOB_TYPE_CONFIG[type];
        if (!config) continue;

        const defIds = [...new Set(typeJobs.map((j: any) => j.defId).filter(Boolean))];
        const defs = defIds.length > 0
          ? await (this.prisma as any)[config.defTable].findMany({ where: { id: { in: defIds } } })
          : [];
        const defMap = new Map<string, any>(defs.map((d: any) => [d.id, d]));

        for (const job of typeJobs) {
          try {
            const def = defMap.get(job.defId);
            const defName = def?.name || config.label;
            const notif = await this.notificationService.createNotification({
              userId: user.id,
              type: 'job_ready',
              category: config.category,
              priority: 'high',
              title: `${config.label} Ready!`,
              body: `${defName} is ready to collect`,
              deepLink: { screen: config.screen, jobId: job.id, defId: job.defId },
              sourceType: 'job_ready',
              sourceId: job.id,
            });
            if (notif) createdNotifs.push(notif);
          } catch (err) {
            this.logger.warn(`Failed to create job_ready notification for ${job.id}: ${err}`);
          }
        }
      }
    }

    const result = await (this.prisma as any).job.updateMany({
      where: {
        id: { in: jobIds },
        userId: user.id,
        status: 'active',
      },
      data: { status: 'ready_notified' },
    });

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

    return { updated: result.count };
  }
}
