import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { resolveSpec } from './modal-def-resolver.util';
import { calcXpForLevel, diffLocationLevelUnlocks, type LocationLevelUnlocks } from '../game-rules/level-config.util';
import { DEFAULT_XP_DEPOSIT_COST } from '../location/location-xp.constants';
import type { ModalSpecV1 } from '@derp/shared';

interface TeamEntitySnapshot {
  id: string;
  name: string;
  level: number;
  xp: number;
  stats: Record<string, unknown>;
  traits: Record<string, unknown>;
}

interface JobContext {
  job: { id: string; type: string; defId: string; status: string };
  results: Record<string, unknown>;
  data: Record<string, unknown>;
  def: Record<string, unknown>;
  timer: Record<string, unknown>;
  team: TeamEntitySnapshot[];
}

interface GiftContext {
  gift: { id: string; status: string };
  snapshot: Record<string, unknown>;
  presentation: Record<string, unknown>;
}

interface BuildingContext {
  building: { id: string; name: string; description: string };
  def: Record<string, unknown>;
  costs: Array<{ id?: string; amount?: number; baseAmount?: number }>;
  currentLevel: number;
  nextLevel: number;
  timerDuration: number;
}

interface LocationContext {
  location: { id: string; name: string; level: number; xp: number; xpToNext: number; maxLevel: number };
  def: Record<string, unknown>;
  fromLevel: number;
  toLevel: number;
  options: Array<{ type: string; id: string; amount: number; xpPerCharge: number }>;
  unlocks?: Record<string, unknown>;
}

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
    const typeLabel = this.getJobTypeLabel(job.type);
    const results = job.results as any;

    let generated: any;
    let modalDefId: string | null = null;

    switch (job.status) {
      case 'active':
        generated = this.buildActiveJobModal(job, defName, typeLabel, tickInfo);
        modalDefId = def?.activeModalDefId ?? null;
        break;
      case 'ready_notified':
        generated = this.buildActiveJobModal(job, defName, typeLabel, tickInfo);
        modalDefId = def?.readyModalDefId ?? def?.activeModalDefId ?? null;
        break;
      case 'completed':
        generated = this.buildCompletedJobModal(job, defName, typeLabel, results);
        modalDefId = def?.completedModalDefId ?? null;
        break;
      case 'failed':
        generated = this.buildCompletedJobModal(job, defName, typeLabel, results);
        modalDefId = def?.failedModalDefId ?? def?.completedModalDefId ?? null;
        break;
      default:
        generated = job.status === 'collected'
          ? this.buildCompletedJobModal(job, defName, typeLabel, results)
          : this.buildGenericJobModal(job, defName, typeLabel);
        modalDefId = def?.completedModalDefId ?? null;
    }

    const ctx = await this.buildJobContext(job, def);

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
    const [def, user, location, allLocations] = await Promise.all([
      (this.prisma as any).buildingDef.findFirst({ where: { id: buildingDefId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
      (this.prisma as any).locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
        include: {
          definition: true,
          buildings: { include: { rooms: true } },
        },
      }),
      (this.prisma as any).locationInstance.findMany({
        where: { ownerUserId: userId },
        include: {
          definition: true,
          buildings: { include: { rooms: true } },
        },
      }),
    ]);
    if (!def) throw new NotFoundException('Building definition not found');
    if (!location) throw new NotFoundException('Location not found');

    const levelMap = def.rules?.level || {};
    const level1 = levelMap['1'] || {};
    const constructionCost: any[] = level1.constructionCost || [];
    const timerDuration: number = level1.timer?.duration ?? 0;
    const requirements: any[] = def.requirements || [];

    const allPlayerLocations = (allLocations as any[]).map((loc: any) => ({
      buildings: (loc.buildings ?? []).map((b: any) => ({
        buildingDefId: b.buildingDefId,
        rooms: (b.rooms ?? []).map((r: any) => ({ roomDefId: r.roomDefId })),
      })),
      regionId: loc.definition?.regionId ?? null,
    }));
    const currentLocationCtx = {
      buildings: (location.buildings ?? []).map((b: any) => ({
        buildingDefId: b.buildingDefId,
        rooms: (b.rooms ?? []).map((r: any) => ({ roomDefId: r.roomDefId })),
      })),
      regionId: location.definition?.regionId ?? null,
    };
    const reqContext = this.gameRulesService.buildRequirementContext(user as any, {
      allPlayerLocations,
      currentLocation: currentLocationCtx,
    });

    const allReqsMet = this.gameRulesService.checkRequirements(requirements, reqContext);

    const metaRows: { label: string; value: string }[] = [];
    if (timerDuration > 0) {
      metaRows.push({ label: 'Build Time', value: this.formatDuration(timerDuration) });
    }
    for (const cost of constructionCost) {
      metaRows.push({ label: `Cost`, value: `${cost.amount ?? cost.baseAmount ?? 0}× ${cost.id}` });
    }
    for (const req of requirements) {
      const met = this.gameRulesService.checkRequirement(req, reqContext);
      const status = met ? ' ✓' : ' ✗';
      if (req.type === 'keeper_level') {
        metaRows.push({ label: 'Requires Keeper Lv', value: `${req.value}${status}` });
      } else if (req.type === 'has_building') {
        metaRows.push({ label: 'Requires Building', value: `${(req.ids as string[])?.join(' or ') ?? '?'}${status}` });
      } else if (req.type === 'in_region') {
        metaRows.push({ label: 'Region Required', value: `${(req.ids as string[])?.join(' or ') ?? '?'}${status}` });
      } else if (req.type === 'flag') {
        metaRows.push({ label: `Requires ${req.key}`, value: `${req.value ?? ''}${status}` });
      }
    }

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

  private async resolveModalDef(id: string | null | undefined): Promise<ModalSpecV1 | null> {
    if (!id) return null;
    try {
      const modalDef = await (this.prisma as any).modalDef.findUnique({ where: { id } });
      if (!modalDef || !modalDef.enabled) return null;
      return modalDef.spec && typeof modalDef.spec === 'object' ? (modalDef.spec as ModalSpecV1) : null;
    } catch {}
    return null;
  }

  private mergeModalDefSpec(generated: any, spec: ModalSpecV1, ctx?: JobContext | GiftContext | BuildingContext | LocationContext): any {
    if (!spec || typeof spec !== 'object') return generated;

    const resolved = ctx ? resolveSpec(spec, ctx as Record<string, any>) : spec;

    const merged = { ...generated };
    if (resolved.header && typeof resolved.header === 'object') {
      merged.header = { ...generated.header, ...resolved.header };
    }
    if ((resolved as any).replaceBody === true && Array.isArray(resolved.body)) {
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

  private async buildJobContext(job: any, def: any): Promise<JobContext> {
    const teamIds: string[] = Array.isArray(job.team) ? job.team : [];
    let team: TeamEntitySnapshot[] = [];

    if (teamIds.length > 0) {
      try {
        const entities = await (this.prisma as any).entity.findMany({
          where: { id: { in: teamIds }, ownerUserId: job.userId },
        });
        const entityMap = new Map<string, any>();
        for (const e of entities) {
          entityMap.set(e.id, e);
        }
        for (const id of teamIds) {
          const e = entityMap.get(id);
          if (!e) continue;
          const progression = (e.progression as any) || {};
          team.push({
            id: e.id,
            name: (e.display as any)?.name || e.speciesId || 'Entity',
            level: progression.level || 1,
            xp: Number(progression.xp || 0),
            stats: (e.stats as Record<string, unknown>) || {},
            traits: (e.traits as Record<string, unknown>) || {},
          });
        }
      } catch {}
    }

    return {
      job: {
        id: job.id,
        type: job.type,
        defId: job.defId,
        status: job.status,
      },
      results: (job.results as Record<string, unknown>) || {},
      data: (job.data as Record<string, unknown>) || {},
      def: def || {},
      timer: (job.timer as Record<string, unknown>) || {},
      team,
    };
  }

  private buildGiftContext(gift: any, snapshot: any): GiftContext {
    return {
      gift: {
        id: gift.id,
        status: gift.status,
      },
      snapshot: snapshot || {},
      presentation: snapshot?.presentation || {},
    };
  }

  private buildBuildingContext(def: any, costs: Array<{ id?: string; amount?: number; baseAmount?: number }>, currentLevel: number, nextLevel: number, timerDuration: number): BuildingContext {
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

  /**
   * Builds the deposit-XP modal for an outpost. Renders one button per
   * configured cost option (`rules.xpDepositCosts`) so players choose
   * which currency/item to spend; defaults to a single `1× hard_essence`
   * option when nothing is configured.
   */
  async buildModalForLocationDepositXp(userId: string, locationId: string): Promise<any> {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: { definition: true },
    });
    if (!location) throw new NotFoundException('Location not found');

    const rules = (location.definition?.rules as any) || {};
    const maxLevel = rules.maxLevel ?? 50;
    const isMaxLevel = location.level >= maxLevel;
    const xp = Number(location.xp ?? 0);

    // Mirrors LocationService.resolveXpDepositCosts — the validation logic
    // is duplicated here (rather than importing the service) to keep the UI
    // module independent, but the fallback default is pulled from the shared
    // `location-xp.constants` module so the two paths can never silently
    // drift apart.
    const rawOptions = Array.isArray(rules.xpDepositCosts) && rules.xpDepositCosts.length > 0
      ? rules.xpDepositCosts
      : [{ ...DEFAULT_XP_DEPOSIT_COST }];
    const options = rawOptions
      .filter((c: any) => c && (c.type === 'currency' || c.type === 'item') && typeof c.id === 'string' && typeof c.amount === 'number' && c.amount > 0)
      .map((c: any) => ({
        type: c.type,
        id: c.id,
        amount: c.amount,
        xpPerCharge: typeof c.xpPerCharge === 'number' && c.xpPerCharge > 0 ? c.xpPerCharge : 1,
      }));

    const xpToNext = isMaxLevel ? 0 : calcXpForLevel(rules, location.level + 1);

    // Resolve current player balances per option so the modal can preview
    // affordability and disable any option the player can't pay for. We
    // batch by type rather than per-option so a 10-option modal is still
    // 2 round-trips at most.
    const currencyIds: string[] = Array.from(
      new Set(options.filter((o: any) => o.type === 'currency').map((o: any) => String(o.id))),
    );
    const itemIds: string[] = Array.from(
      new Set(options.filter((o: any) => o.type === 'item').map((o: any) => String(o.id))),
    );
    const balances: Record<string, Record<string, number>> = { currency: {}, item: {} };
    if (currencyIds.length > 0) {
      // NOTE: schema model is `UserCurrencyBalance` — accessed via
      // `prisma.userCurrencyBalance` (matches CurrencyService usage).
      const rows = await this.prisma.userCurrencyBalance.findMany({
        where: { userId, currencyId: { in: currencyIds } },
      });
      for (const r of rows) balances.currency[r.currencyId] = Number(r.balance ?? 0);
    }
    if (itemIds.length > 0) {
      // Sum across stacks per definition — a player may hold multiple
      // ItemInstance rows for the same item, so taking just one would
      // wrongly mark options as unaffordable.
      const rows = await (this.prisma as any).itemInstance.findMany({
        where: { userId, definitionId: { in: itemIds } },
      });
      for (const r of rows) {
        balances.item[r.definitionId] = (balances.item[r.definitionId] ?? 0) + Number(r.quantity ?? 0);
      }
    }

    const body: any[] = [];
    body.push({
      type: 'metaRows',
      rows: [
        { label: 'Current Level', value: String(location.level) },
        { label: 'XP', value: isMaxLevel ? 'MAX' : `${xp} / ${xpToNext}` },
      ],
    });
    if (isMaxLevel) {
      body.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: `This outpost has reached the maximum level (${maxLevel}). XP deposits are disabled.` }] }],
      });
    } else {
      body.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: 'Spend resources to grant XP. Each click below spends one charge.' }] }],
      });

      // Per-option preview row: shows current balance + XP gained + projected
      // post-deposit XP / level so the player can see the result before
      // committing.
      const previewRows: Array<{ label: string; value: string }> = [];
      for (const opt of options) {
        const have = balances[opt.type]?.[opt.id] ?? 0;
        const projectedXp = xp + opt.xpPerCharge;
        const wouldLevel = projectedXp >= xpToNext;
        previewRows.push({
          label: `${opt.amount}× ${opt.id}`,
          value: `Have ${have} • +${opt.xpPerCharge} XP${wouldLevel ? ' (Level Up!)' : ` → ${projectedXp}/${xpToNext}`}`,
        });
      }
      if (previewRows.length > 0) body.push({ type: 'metaRows', rows: previewRows });
    }

    const buttons: any[] = [];
    if (!isMaxLevel) {
      for (const opt of options) {
        const have = balances[opt.type]?.[opt.id] ?? 0;
        const canAfford = have >= opt.amount;
        buttons.push({
          id: `deposit_${opt.type}_${opt.id}`,
          label: `Spend ${opt.amount}× ${opt.id} (+${opt.xpPerCharge} XP)`,
          variant: 'primary',
          disabled: !canAfford,
          action: {
            type: 'DEPOSIT_LOCATION_XP',
            locationId,
            costOption: { type: opt.type, id: opt.id, amount: opt.amount },
            charges: 1,
          },
        });
      }
    }
    buttons.push({ id: 'close', label: 'Close', variant: 'ghost', action: { type: 'CLOSE_MODAL' } });

    return {
      version: 1,
      id: `location_deposit_xp_${locationId}`,
      kind: 'location_deposit_xp',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: isMaxLevel ? 'Outpost at Max Level' : 'Deposit XP',
        subtitle: location.definitionId || 'Outpost',
      },
      body,
      buttons,
    };
  }

  /**
   * Builds a level-up celebration modal for an outpost. If the
   * LocationDefinition has `levelUpModalDefId` configured, the matching
   * ModalDef.spec is merged in as the override layer. Marks the
   * triggering notification as read on serve so taps don't re-fire it.
   */
  async buildModalForLocationLevelUp(userId: string, locationId: string, notificationId?: string): Promise<any> {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: { definition: true },
    });
    if (!location) throw new NotFoundException('Location not found');

    let fromLevel = location.level;
    let toLevel = location.level;

    if (notificationId) {
      const notif = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId },
      });
      if (notif) {
        const meta = (notif.meta as any) || {};
        if (typeof meta.fromLevel === 'number') fromLevel = meta.fromLevel;
        if (typeof meta.toLevel === 'number') toLevel = meta.toLevel;
        if (!notif.readAt) {
          try {
            await this.prisma.notification.update({
              where: { id: notif.id },
              data: { readAt: new Date() },
            });
          } catch (err) {
            this.logger.warn(`Failed to mark location_level_up notification ${notif.id} read: ${err}`);
          }
        }
      }
    }

    const def = location.definition as any;
    const rules = (def?.rules as any) || {};

    let unlocks: LocationLevelUnlocks = {
      workerSlotsAdded: 0,
      buildingSlotsAdded: 0,
      newAllowedBuildings: [],
      newAllowedRooms: [],
      storageAdded: [],
      productionAdded: [],
    };
    if (toLevel > fromLevel) {
      try {
        unlocks = diffLocationLevelUnlocks(rules, fromLevel, toLevel);
      } catch (err) {
        this.logger.warn(`Failed to diff location level unlocks for ${locationId}: ${err}`);
      }
    }

    const buildingIds = unlocks.newAllowedBuildings;
    const roomIds = unlocks.newAllowedRooms;
    const [buildingDefs, roomDefs] = await Promise.all([
      buildingIds.length > 0
        ? (this.prisma as any).buildingDef.findMany({
            where: { id: { in: buildingIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
      roomIds.length > 0
        ? (this.prisma as any).roomDef.findMany({
            where: { id: { in: roomIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    const buildingNameById = new Map<string, string>(
      (buildingDefs as any[]).map((b) => [b.id, b.name || b.id]),
    );
    const roomNameById = new Map<string, string>(
      (roomDefs as any[]).map((r) => [r.id, r.name || r.id]),
    );

    const bullets: string[] = [];
    if (unlocks.workerSlotsAdded > 0) {
      bullets.push(
        `+${unlocks.workerSlotsAdded} worker slot${unlocks.workerSlotsAdded === 1 ? '' : 's'}`,
      );
    }
    if (unlocks.buildingSlotsAdded > 0) {
      bullets.push(
        `+${unlocks.buildingSlotsAdded} building slot${unlocks.buildingSlotsAdded === 1 ? '' : 's'}`,
      );
    }
    for (const id of buildingIds) {
      bullets.push(`Unlocked: ${buildingNameById.get(id) ?? id}`);
    }
    for (const id of roomIds) {
      bullets.push(`Unlocked room: ${roomNameById.get(id) ?? id}`);
    }
    for (const s of unlocks.storageAdded) {
      bullets.push(`+${s.addedCapacity} ${s.id} storage`);
    }
    for (const p of unlocks.productionAdded) {
      bullets.push(`+${p.addedRate}/hr ${p.id} production`);
    }

    const headline = `${def?.name || location.definitionId || 'Your outpost'} reached Level ${toLevel}!`;

    const body: any[] = [
      {
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: headline }] }],
      },
      {
        type: 'metaRows',
        rows: [
          { label: 'Previous Level', value: String(fromLevel) },
          { label: 'New Level', value: String(toLevel) },
        ],
      },
    ];
    if (bullets.length > 0) {
      body.push({
        type: 'richText',
        doc: [
          { t: 'p', c: [{ t: 'strong', c: [{ t: 'text', v: 'Unlocks' }] }] },
          {
            t: 'ul',
            c: bullets.map((line) => ({
              t: 'li',
              c: [{ t: 'text', v: line }],
            })),
          },
        ],
      });
    }

    const generated: any = {
      version: 1,
      id: `location_level_up_${locationId}`,
      kind: 'location_level_up',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: 'Outpost Level Up!',
        subtitle: `Level ${fromLevel} → ${toLevel}`,
      },
      body,
      buttons: [
        { id: 'continue', label: 'Continue', variant: 'primary', action: { type: 'CLOSE_MODAL' } },
      ],
    };

    const modalDefId = def?.levelUpModalDefId;
    if (modalDefId) {
      const spec = await this.resolveModalDef(modalDefId);
      if (spec) {
        const ctx: LocationContext = {
          location: {
            id: location.id,
            name: location.definitionId || 'Outpost',
            level: location.level,
            xp: Number(location.xp ?? 0),
            xpToNext: 0,
            maxLevel: ((def?.rules as any)?.maxLevel) ?? 50,
          },
          def: def || {},
          fromLevel,
          toLevel,
          options: [],
          unlocks: unlocks as unknown as Record<string, unknown>,
        };
        return this.mergeModalDefSpec(generated, spec, ctx);
      }
    }

    return generated;
  }
}
