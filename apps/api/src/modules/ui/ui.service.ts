import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { resolveSpec } from './modal-def-resolver.util';

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

    const [def, tickInfo] = await Promise.all([
      this.fetchJobDef(job),
      this.tickService.getTickInfo(),
    ]);

    const defName = def?.name || job.defId || 'Unknown';
    const isFinished = job.status === 'completed' || job.status === 'failed' || job.status === 'collected';
    const isActive = job.status === 'active' || job.status === 'ready_notified';

    const typeLabel = this.getJobTypeLabel(job.type);
    const results = job.results as any;

    let generated: any;
    let modalDefId: string | null = null;

    if (isFinished) {
      generated = this.buildCompletedJobModal(job, defName, typeLabel, results);
      modalDefId = def?.completedModalDefId ?? null;
    } else if (isActive) {
      generated = this.buildActiveJobModal(job, defName, typeLabel, tickInfo);
      modalDefId = def?.activeModalDefId ?? null;
    } else {
      generated = this.buildGenericJobModal(job, defName, typeLabel);
    }

    const ctx = this.buildJobContext(job, def);

    if (modalDefId) {
      const spec = await this.resolveModalDef(modalDefId);
      if (spec) return this.mergeModalDefSpec(generated, spec, ctx);
    }

    return generated;
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

    const generated = {
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

    const ctx = this.buildGiftContext(gift, snapshot);

    const giftDefId = snapshot?.giftDefId;
    if (giftDefId) {
      try {
        const giftDef = await (this.prisma as any).giftDef.findUnique({ where: { id: giftDefId }, select: { modalDefId: true } });
        if (giftDef?.modalDefId) {
          const spec = await this.resolveModalDef(giftDef.modalDefId);
          if (spec) return this.mergeModalDefSpec(generated, spec, ctx);
        }
      } catch {}
    }

    return generated;
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

  async buildModalForBuildBuilding(userId: string, locationId: string, buildingDefId: string): Promise<any> {
    const [def, user] = await Promise.all([
      (this.prisma as any).buildingDef.findFirst({ where: { id: buildingDefId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { keeperLevel: true } }),
    ]);
    if (!def) throw new NotFoundException('Building definition not found');

    const levelMap = def.rules?.level || {};
    const level1 = levelMap['1'] || {};
    const constructionCost: any[] = level1.constructionCost || [];
    const timerDuration: number = level1.timer?.duration ?? 0;
    const requirements: any[] = def.requirements || [];
    const keeperLevel = user?.keeperLevel ?? 1;

    const metaRows: { label: string; value: string }[] = [];
    if (timerDuration > 0) {
      metaRows.push({ label: 'Build Time', value: this.formatDuration(timerDuration) });
    }
    for (const cost of constructionCost) {
      metaRows.push({ label: `Cost`, value: `${cost.amount ?? cost.baseAmount ?? 0}× ${cost.id}` });
    }
    for (const req of requirements) {
      if (req.type === 'keeper_level') {
        const met = keeperLevel >= (req.value ?? 0);
        metaRows.push({ label: 'Requires Keeper Lv', value: `${req.value}${met ? ' ✓' : ' ✗'}` });
      }
    }

    const allReqsMet = requirements.every((req: any) => {
      if (req.type === 'keeper_level') return keeperLevel >= (req.value ?? 0);
      return true;
    });

    const body: any[] = [];
    if (def.description) {
      body.push({ type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: def.description }] }] });
    }
    if (metaRows.length > 0) {
      body.push({ type: 'metaRows', rows: metaRows });
    }

    const generated: any = {
      version: 1,
      id: `build_confirm_${buildingDefId}`,
      kind: 'build_confirm',
      dismiss: { backdrop: true, x: true, escape: true },
      header: { title: `Build ${def.name}`, subtitle: 'Construction' },
      body,
      buttons: [
        {
          id: 'build',
          label: 'Build',
          variant: 'primary',
          disabled: !allReqsMet,
          action: { type: 'BUILD_BUILDING', locationId, buildingDefId },
        },
        { id: 'cancel', label: 'Cancel', variant: 'ghost', action: { type: 'CLOSE_MODAL' } },
      ],
    };

    const ctx = this.buildBuildingContext(def, constructionCost, 0, 1, timerDuration);
    const spec = await this.resolveModalDef('modal_build_confirm');
    if (spec) return this.mergeModalDefSpec(generated, spec, ctx);
    return generated;
  }

  async buildModalForUpgradeBuilding(userId: string, locationId: string, buildingId: string, buildingDefId: string): Promise<any> {
    const [def, location] = await Promise.all([
      (this.prisma as any).buildingDef.findFirst({ where: { id: buildingDefId } }),
      this.prisma.locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
        include: { buildings: { where: { id: buildingId } } },
      }),
    ]);
    if (!def) throw new NotFoundException('Building definition not found');

    const buildingInstance = location?.buildings?.[0];
    const currentLevel = buildingInstance?.level ?? 1;
    const nextLevel = currentLevel + 1;
    const maxLevel = 50;
    const isMaxLevel = currentLevel >= maxLevel;

    const levelMap = def.rules?.level || {};
    const nextLevelConfig = levelMap[String(nextLevel)] || levelMap[String(currentLevel)] || {};
    const upgradeCosts: any[] = nextLevelConfig.constructionCost || nextLevelConfig.upgradeCost || [];
    const timerDuration: number = nextLevelConfig.timer?.duration ?? 0;

    const metaRows: { label: string; value: string }[] = [
      { label: 'Current Level', value: String(currentLevel) },
      { label: 'Upgrading To', value: String(nextLevel) },
    ];
    if (timerDuration > 0) {
      metaRows.push({ label: 'Build Time', value: this.formatDuration(timerDuration) });
    }
    for (const cost of upgradeCosts) {
      metaRows.push({ label: 'Cost', value: `${cost.amount ?? cost.baseAmount ?? 0}× ${cost.id}` });
    }

    const body: any[] = [];
    if (isMaxLevel) {
      body.push({ type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: `This building is already at the maximum level (${maxLevel}).` }] }] });
    } else {
      if (metaRows.length > 0) body.push({ type: 'metaRows', rows: metaRows });
    }

    const generated: any = {
      version: 1,
      id: `upgrade_confirm_${buildingId}`,
      kind: 'upgrade_confirm',
      dismiss: { backdrop: true, x: true, escape: true },
      header: { title: `Upgrade ${def.name}`, subtitle: isMaxLevel ? 'Max Level Reached' : `Level ${currentLevel} → ${nextLevel}` },
      body,
      buttons: isMaxLevel
        ? [{ id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } }]
        : [
            {
              id: 'upgrade',
              label: 'Upgrade',
              variant: 'primary',
              action: { type: 'UPGRADE_BUILDING', locationId, buildingId },
            },
            { id: 'cancel', label: 'Cancel', variant: 'ghost', action: { type: 'CLOSE_MODAL' } },
          ],
    };

    const ctx = this.buildBuildingContext(def, upgradeCosts, currentLevel, nextLevel, timerDuration);
    const spec = await this.resolveModalDef('modal_upgrade_confirm');
    if (spec) return this.mergeModalDefSpec(generated, spec, ctx);
    return generated;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
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
    const def = await this.fetchJobDef(job);
    if (def?.name) return def.name;
    return job.defId || 'Unknown';
  }

  private async fetchJobDef(job: any): Promise<any | null> {
    const defId = job.defId;
    if (!defId) return null;
    try {
      if (job.type === 'MissionJob') {
        return await this.prisma.missionDef.findFirst({ where: { id: defId } });
      } else if (job.type === 'CraftingJob') {
        return await this.prisma.recipeDef.findFirst({ where: { id: defId } });
      } else if (job.type === 'BuildingJob') {
        return await (this.prisma as any).buildingDef.findFirst({ where: { id: defId } });
      }
    } catch {}
    return null;
  }

  private async resolveModalDef(id: string | null | undefined): Promise<any | null> {
    if (!id) return null;
    try {
      const modalDef = await (this.prisma as any).modalDef.findUnique({ where: { id } });
      if (!modalDef || !modalDef.enabled) return null;
      return modalDef.spec && typeof modalDef.spec === 'object' ? modalDef.spec : null;
    } catch {}
    return null;
  }

  private mergeModalDefSpec(generated: any, spec: any, ctx?: Record<string, any>): any {
    if (!spec || typeof spec !== 'object') return generated;

    const resolved = ctx ? resolveSpec(spec, ctx) : spec;

    const merged = { ...generated };
    if (resolved.header && typeof resolved.header === 'object') {
      merged.header = { ...generated.header, ...resolved.header };
    }
    if (resolved.replaceBody === true && Array.isArray(resolved.body)) {
      merged.body = resolved.body;
    } else if (Array.isArray(resolved.body) && resolved.body.length > 0) {
      merged.body = [...resolved.body, ...(generated.body || [])];
    }
    if (Array.isArray(resolved.buttons) && resolved.buttons.length > 0) {
      merged.buttons = resolved.buttons;
    }
    return merged;
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

  private buildJobContext(job: any, def: any): Record<string, any> {
    return {
      job: {
        id: job.id,
        type: job.type,
        defId: job.defId,
        status: job.status,
      },
      results: job.results || {},
      data: job.data || {},
      def: def || {},
      timer: job.timer || {},
    };
  }

  private buildGiftContext(gift: any, snapshot: any): Record<string, any> {
    return {
      gift: {
        id: gift.id,
        status: gift.status,
      },
      snapshot: snapshot || {},
      presentation: snapshot?.presentation || {},
    };
  }

  private buildBuildingContext(def: any, costs: any[], currentLevel: number, nextLevel: number, timerDuration: number): Record<string, any> {
    return {
      building: {
        id: def.id,
        name: def.name,
        description: def.description,
      },
      def: def || {},
      costs,
      currentLevel,
      nextLevel,
      timerDuration,
    };
  }
}
