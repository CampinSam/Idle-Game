import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { GameRulesService } from '../game-rules/game-rules.service';

@Injectable()
export class UiService {
  private readonly logger = new Logger(UiService.name);

  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
    private gameRulesService: GameRulesService,
  ) {}

  async buildModalForJob(userId: string, jobId: string): Promise<any> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) throw new NotFoundException('Job not found');

    const defName = await this.resolveDefName(job);
    const tickInfo = await this.tickService.getTickInfo();
    const isFinished = job.status === 'completed' || job.status === 'failed' || job.status === 'collected';
    const isActive = job.status === 'active' || job.status === 'ready_notified';

    const typeLabel = this.getJobTypeLabel(job.type);
    const results = job.results as any;

    if (isFinished) {
      return this.buildCompletedJobModal(job, defName, typeLabel, results);
    }

    if (isActive) {
      return this.buildActiveJobModal(job, defName, typeLabel, tickInfo);
    }

    return this.buildGenericJobModal(job, defName, typeLabel);
  }

  async buildModalForNotification(userId: string, notificationId: string): Promise<any> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    const deepLink = notification.deepLink as any;

    if (deepLink?.jobId || deepLink?.entityId) {
      const jobId = deepLink.jobId || deepLink.entityId;
      try {
        return await this.buildModalForJob(userId, jobId);
      } catch {}
    }

    return {
      version: 1,
      id: `notif_${notificationId}`,
      kind: 'notification',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: notification.title || 'Notification',
        subtitle: notification.body || undefined,
      },
      body: [],
      buttons: [
        {
          id: 'ack',
          label: 'OK',
          variant: 'primary',
          action: { type: 'ACK_NOTIFICATION', notificationId },
        },
      ],
    };
  }

  async buildModalForGift(userId: string, giftId: string): Promise<any> {
    const gift = await this.prisma.giftInstance.findFirst({
      where: { id: giftId, userId },
    });
    if (!gift) throw new NotFoundException('Gift not found');

    const snapshot = gift.snapshot as any;
    const presentation = snapshot?.presentation || {};
    const isClaimed = gift.status === 'CLAIMED';

    const body: any[] = [];
    if (presentation.body) {
      body.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: presentation.body }] }],
      });
    }

    if (isClaimed) {
      body.push({
        type: 'giftReveal',
        gift: {
          giftId: gift.id,
          title: presentation.title || 'Gift',
          image: presentation.iconKey ? { assetKey: `icons/${presentation.iconKey}` } : undefined,
        },
      });
    }

    const buttons: any[] = [];
    if (!isClaimed) {
      buttons.push({
        id: 'claim',
        label: 'Claim Gift',
        variant: 'primary',
        action: { type: 'CLAIM_GIFT', giftId },
      });
    }
    buttons.push({
      id: 'close',
      label: isClaimed ? 'Continue' : 'Close',
      variant: isClaimed ? 'primary' : 'secondary',
      action: { type: 'CLOSE_MODAL' },
    });

    return {
      version: 1,
      id: `gift_${giftId}`,
      kind: 'gift',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: isClaimed ? 'Gift Claimed!' : (presentation.title || 'You received a gift!'),
        icon: presentation.iconKey ? { assetKey: `icons/${presentation.iconKey}` } : undefined,
      },
      body,
      buttons,
    };
  }

  private buildCompletedJobModal(job: any, defName: string, typeLabel: string, results: any): any {
    const isSuccess = job.type === 'MissionJob' ? results?.success !== false : true;
    const rewards: any[] = results?.rewards || [];
    const texts: string[] = results?.texts || [];
    const data = job.data as any;
    const isUpgrade = !!data?.upgradeToLevel;

    let title: string;
    if (job.type === 'MissionJob') {
      title = isSuccess ? 'Mission Complete!' : 'Mission Failed';
    } else if (job.type === 'CraftingJob') {
      title = 'Crafting Complete!';
    } else if (job.type === 'BuildingJob') {
      title = isUpgrade ? 'Upgrade Complete!' : 'Construction Complete!';
    } else {
      title = `${typeLabel} Complete!`;
    }

    const body: any[] = [];

    if (texts.length > 0) {
      body.push({
        type: 'richText',
        doc: texts.map((text: string) => ({
          t: 'p',
          c: [{ t: 'em', c: [{ t: 'text', v: text }] }],
        })),
      });
    }

    if (rewards.length > 0) {
      body.push({
        type: 'rewardsList',
        title: 'Rewards',
        items: rewards.map((r: any) => ({
          name: this.resolveRewardName(r),
          qty: r.amount ?? 1,
          assetKey: r.key ? `icons/${r.key}` : undefined,
        })),
      });
    }

    if (job.type === 'MissionJob' && !isSuccess) {
      body.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: 'Your team was unsuccessful. Try again with a stronger team!' }] }],
      });
    }

    if (job.type === 'CraftingJob' && results?.quality) {
      body.push({
        type: 'metaRows',
        rows: [{ label: 'Quality', value: results.quality.toUpperCase() }],
      });
    }

    const buttons: any[] = [
      {
        id: 'continue',
        label: 'Continue',
        variant: 'primary',
        action: { type: 'CLOSE_MODAL' },
      },
    ];

    if (job.type === 'MissionJob' && isSuccess) {
      buttons.push({
        id: 'repeat',
        label: 'Start Again',
        variant: 'secondary',
        action: { type: 'REPEAT_MISSION', defId: job.defId, entityIds: Array.isArray(job.team) ? job.team : [] },
      });
    } else if (job.type === 'CraftingJob') {
      buttons.push({
        id: 'craft_again',
        label: 'Craft Again',
        variant: 'secondary',
        action: { type: 'CRAFT_AGAIN', recipeDefId: job.defId },
      });
    }

    return {
      version: 1,
      id: `job_${job.id}_result`,
      kind: `${job.type.replace('Job', '').toLowerCase()}_result`,
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title,
        subtitle: defName,
      },
      body,
      buttons,
      telemetry: {
        sourceType: 'job',
        sourceId: job.id,
        jobId: job.id,
      },
    };
  }

  private buildActiveJobModal(job: any, defName: string, typeLabel: string, tickInfo: any): any {
    const timer = job.timer as any;
    const tickRate = tickInfo.currentRate ?? 1;

    let endsAt: string | null = null;
    let progress = { current: 0, max: 1 };

    if (timer?.startTick != null && timer?.durationTicks != null) {
      const remainingTicks = Math.max(0, (timer.startTick + timer.durationTicks) - tickInfo.currentTick);
      const remainingMs = tickRate > 0 ? (remainingTicks / tickRate) * 1000 : 0;
      endsAt = new Date(Date.now() + remainingMs).toISOString();

      const elapsed = Math.max(0, timer.durationTicks - remainingTicks);
      progress = { current: elapsed, max: timer.durationTicks };
    }

    const isReady = progress.current >= progress.max;

    const body: any[] = [];

    if (!isReady && endsAt) {
      body.push({ type: 'timer', endsAt, label: 'Time Remaining' });
      body.push({ type: 'progress', current: progress.current, max: progress.max });
    }

    const buttons: any[] = [];

    if (isReady) {
      buttons.push({
        id: 'complete',
        label: 'Complete',
        variant: 'primary',
        action: { type: 'COMPLETE_JOB', jobId: job.id },
      });
    }

    const skipInfo = this.buildSkipInfo(job);
    if (!isReady && skipInfo) {
      buttons.push({
        id: 'skip',
        label: 'Skip',
        variant: 'secondary',
        action: { type: 'API_CALL', apiKey: 'jobs.skip', payload: { jobId: job.id } },
      });
    }

    buttons.push({
      id: 'close',
      label: 'Close',
      variant: isReady ? 'secondary' : 'ghost',
      action: { type: 'CLOSE_MODAL' },
    });

    return {
      version: 1,
      id: `job_${job.id}_active`,
      kind: `${job.type.replace('Job', '').toLowerCase()}_progress`,
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: isReady ? `${typeLabel} Ready!` : `${typeLabel} In Progress`,
        subtitle: defName,
      },
      body,
      buttons,
      telemetry: {
        sourceType: 'job',
        sourceId: job.id,
        jobId: job.id,
      },
    };
  }

  private buildGenericJobModal(job: any, defName: string, typeLabel: string): any {
    return {
      version: 1,
      id: `job_${job.id}`,
      kind: 'job',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: typeLabel,
        subtitle: defName,
      },
      body: [],
      buttons: [
        { id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } },
      ],
    };
  }

  private resolveRewardName(r: any): string {
    switch (r.type) {
      case 'entity_xp': return 'Entity XP';
      case 'keeper_xp': return 'Keeper XP';
      case 'currency': return r.name || r.key || 'Currency';
      case 'item': return r.name || r.key || 'Item';
      default: return r.type || 'Reward';
    }
  }

  private getJobTypeLabel(type: string): string {
    switch (type) {
      case 'MissionJob': return 'Mission';
      case 'CraftingJob': return 'Crafting';
      case 'BuildingJob': return 'Construction';
      default: return 'Job';
    }
  }

  private async resolveDefName(job: any): Promise<string> {
    const defId = job.defId;
    if (!defId) return 'Unknown';

    try {
      if (job.type === 'MissionJob') {
        const def = await this.prisma.missionDef.findFirst({ where: { id: defId } });
        return def?.name || defId;
      } else if (job.type === 'CraftingJob') {
        const def = await this.prisma.recipeDef.findFirst({ where: { id: defId } });
        return def?.name || defId;
      } else if (job.type === 'BuildingJob') {
        const def = await this.prisma.buildingDef.findFirst({ where: { id: defId } });
        return def?.name || defId;
      }
    } catch {}

    return defId;
  }

  private buildSkipInfo(job: any): any | null {
    const data = job.data as any;
    if (!data?.skipCost) return null;
    return {
      skipable: true,
      skipCost: data.skipCost,
      skipType: data.skipType || 'scaling',
    };
  }
}
