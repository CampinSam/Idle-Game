import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { GameRulesService } from '../game-rules/game-rules.service';
import { CurrencyService } from '../currency/currency.service';
import { resolveSpec } from './modal-def-resolver.util';
import { calcXpForLevel, diffLocationLevelUnlocks, type LocationLevelUnlocks } from '../game-rules/level-config.util';
import { DEFAULT_XP_DEPOSIT_COST } from '../location/location-xp.constants';
import type { ModalSpecV1 } from '@derp/shared';
import { RARITY_ORDER as SHARED_RARITY_ORDER } from '@derp/shared';

// Tier fallback order for modal resolution: if the rolled tier has no modal,
// walk down to the next lower tier that does.
const MISSION_TIER_FALLBACK = ['legendary', 'mythic', 'epic', 'rare', 'scare', 'uncommon', 'common'] as const;

function resolveMissionTierModal(
  tiers: Record<string, any> | null | undefined,
  quality: string,
): string | null {
  if (!tiers || typeof tiers !== 'object') return null;
  if (quality === 'failure') {
    return (tiers['failure']?.modalDefId as string) ?? null;
  }
  const startIdx = MISSION_TIER_FALLBACK.indexOf(quality as any);
  const start = startIdx >= 0 ? startIdx : MISSION_TIER_FALLBACK.length - 1;
  for (let i = start; i < MISSION_TIER_FALLBACK.length; i++) {
    const block = tiers[MISSION_TIER_FALLBACK[i]];
    if (block?.modalDefId) return block.modalDefId as string;
  }
  return null;
}

interface RichJobContext {
  job: { id: string; type: string; defId: string; status: string; team: string[] };
  results: Record<string, unknown>;
  data: Record<string, unknown>;
  def: Record<string, unknown>;
  defDisplay: Record<string, unknown> | null;
  timer: Record<string, unknown>;
  team: Array<{ id: string; name: string; level: number; portraitKey?: string }>;
  entityOutcomes: Array<{
    id: string; name: string; level: number; portraitKey?: string;
    outcome?: { injured: boolean; xpGained: number; levelBefore: number; levelAfter: number };
  }>;
  narrativeDoc: any[];
  rewardItems: Array<{ name: string; qty: number; assetKey?: string; rarity?: string }>;
  timerInfo: {
    endsAt: string; startsAt: string; current: number; max: number; isReady: boolean;
  } | null;
  currentPhase: number;
  phaseResults: Array<{ phaseIndex: number; success: boolean }>;
  currentPhaseSuccesses: number;
  phases: Array<{ durationTicks: number; count?: number; label?: string }>;
  tickRate: number;
  defCategory: string | null;
}

interface GiftContext {
  gift: { id: string; status: string };
  snapshot: Record<string, unknown>;
  presentation: Record<string, unknown>;
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
    private currencyService: CurrencyService,
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

    const ctx = await this.buildRichJobContext(job, def, tickInfo);

    const defName = def?.name || job.defId || 'Unknown';
    const typeLabel = this.getJobTypeLabel(job.type);
    const results = job.results as any;

    // --- Resolve specific modal def ID ---
    const quality = (results?.quality ?? 'common') as string;
    let specificDefId: string | null = null;
    switch (job.status) {
      case 'active':
        specificDefId = (def as any)?.activeModalDefId ?? null;
        break;
      case 'ready_notified':
        specificDefId = (def as any)?.readyModalDefId ?? null;
        break;
      case 'phase_ready':
        specificDefId = (def as any)?.phaseDecisionModalDefId ?? null;
        break;
      case 'completed':
        specificDefId = job.type === 'MissionJob'
          ? resolveMissionTierModal((def as any)?.tiers, quality)
          : ((def as any)?.completedModalDefId ?? null);
        break;
      case 'failed':
        specificDefId = job.type === 'MissionJob'
          ? resolveMissionTierModal((def as any)?.tiers, 'failure')
          : ((def as any)?.failedModalDefId ?? null);
        break;
      default:
        specificDefId = job.type === 'MissionJob'
          ? resolveMissionTierModal((def as any)?.tiers, quality)
          : ((def as any)?.completedModalDefId ?? null);
    }

    const stateKey = this.getJobStateKey(job.status);
    const isUpgrade = !!(job.data as any)?.upgradeToLevel;
    const typePrefix: string | null = (() => {
      switch (job.type) {
        case 'MissionJob': return 'default_mission';
        case 'CraftingJob': return 'default_crafting';
        case 'BuildingJob': return isUpgrade ? 'default_building_upgrade' : 'default_building';
        case 'DustingJob': return 'default_dusting';
        default: return null;
      }
    })();

    // Short-circuit: active multi-phase missions without a per-def activeModalDefId get the
    // rich inline viewer regardless of any generic default_mission_active DefaultModalDef in the
    // DB. A per-def activeModalDefId always wins (designers can still override per-mission).
    let modal: any = null;
    let isInlineViewer = false;
    if (
      job.type === 'MissionJob' &&
      job.status === 'active' &&
      (def as any)?.mode === 'multi_phase' &&
      ctx.phases.length > 0 &&
      !specificDefId
    ) {
      modal = this.buildMultiPhaseActiveViewerModal(ctx, defName, job.id);
      isInlineViewer = true;
    }

    // Short-circuit: phase_ready multi-phase missions without a per-def phaseDecisionModalDefId
    // get the inline decision modal with phase overview + Continue/Abandon buttons.
    if (
      !modal &&
      job.type === 'MissionJob' &&
      job.status === 'phase_ready' &&
      (def as any)?.mode === 'multi_phase' &&
      ctx.phases.length > 0 &&
      !specificDefId
    ) {
      modal = this.buildMultiPhaseDecisionModal(ctx, defName, job.id);
      isInlineViewer = true;
    }

    // Short-circuit: ready_notified multi-phase missions without a per-def readyModalDefId
    // get the inline collect modal with phase history above the Collect button.
    if (
      !modal &&
      job.type === 'MissionJob' &&
      job.status === 'ready_notified' &&
      (def as any)?.mode === 'multi_phase' &&
      ctx.phases.length > 0 &&
      !specificDefId
    ) {
      modal = this.buildMultiPhaseCollectModal(ctx, defName, job.id);
      isInlineViewer = true;
    }

    // Try modal defs in fallback order (skipped above for multi-phase active viewer).
    if (!modal && specificDefId) modal = await this.buildModal(specificDefId, ctx);
    if (!modal && stateKey && typePrefix) modal = await this.buildModal(`${typePrefix}_${stateKey}`, ctx);
    if (!modal && stateKey) modal = await this.buildModal(`default_job_${stateKey}`, ctx);

    if (!modal) {
      // Final fallback: minimal empty modal used when no modal def is defined at all.
      modal = {
        version: 1,
        id: `job_${job.id}`,
        kind: 'job',
        dismiss: { backdrop: true, x: true, escape: true },
        header: { title: typeLabel, subtitle: defName },
        pages: [{ body: [] }],
        buttons: [{ id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } }],
      };
    }

    // Enrich skip button for active jobs — skip for the inline viewer (close-only modal).
    if (stateKey === 'active' && !isInlineViewer) {
      await this.enrichModalSkipButton(modal, job, def, ctx);
    }

    return { ...modal, telemetry: { sourceType: 'job', sourceId: job.id, jobId: job.id } };
  }

  /**
   * Generic modal builder: looks up a ModalDef (then DefaultModalDef) by ID,
   * resolves all token/from expressions against the provided context, and
   * returns the fully-resolved ModalSpecV1.  Returns null if not found or disabled.
   */
  async buildModal(defId: string, ctx: Record<string, any>): Promise<any | null> {
    const spec = (await this.resolveModalDef(defId)) ?? (await this.resolveDefaultModalDef(defId));
    if (!spec) return null;
    return resolveSpec(spec, ctx);
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
      pages: [{ body: [] }],
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
      const claimTx = await (this.prisma as any).giftClaimTx.findUnique({ where: { giftId: gift.id } });
      const grants: any[] = (claimTx?.grants as any[]) ?? [];
      const rewards = grants
        .filter((g: any) => g.type !== 'bundle_ref' && g.type !== 'unknown')
        .map((g: any) => ({
          name: this.resolveRewardName(g),
          qty: g.amount ?? g.qty ?? 1,
          assetKey: g.key ?? this.resolveSystemRewardAssetKey(g.type),
        }));

      body.push({
        type: 'giftReveal',
        gift: {
          giftId: gift.id,
          title: presentation.title || 'Gift',
          image: presentation.iconKey ? { assetKey: `icons/${presentation.iconKey}` } : undefined,
        },
        rewards: rewards.length > 0 ? rewards : undefined,
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
      pages: [{ body }],
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

    // Fall back to the system default modal for gift claims when no custom modal is assigned.
    const defaultGiftSpec = await this.resolveDefaultModalDef('default_gift_claim');
    if (defaultGiftSpec) return this.mergeModalDefSpec(generated, defaultGiftSpec, ctx);

    return generated;
  }

  /**
   * Builds an enriched context object for a job modal.  All body structure
   * comes from the modal def spec; this method only computes the raw data
   * that `from`-field expressions and `${token}` substitutions reference.
   */
  private async buildRichJobContext(job: any, def: any, tickInfo: any): Promise<RichJobContext> {
    const teamIds: string[] = Array.isArray(job.team) ? job.team : [];
    const results = job.results as any;
    const timer = job.timer as any;

    // --- Active job timer info ---
    let timerInfo: RichJobContext['timerInfo'] = null;
    if (timer?.startTick != null && timer?.durationTicks != null) {
      const tickRate = (tickInfo?.currentRate ?? 1) as number;
      const currentTick = (tickInfo?.currentTick ?? 0) as number;
      const remainingTicks = Math.max(0, (timer.startTick + timer.durationTicks) - currentTick);
      const remainingMs = tickRate > 0 ? (remainingTicks / tickRate) * 1000 : 0;
      const endsAt = new Date(Date.now() + remainingMs).toISOString();
      const elapsed = Math.max(0, timer.durationTicks - remainingTicks);
      const current = elapsed;
      const max = timer.durationTicks as number;
      const durationMs = tickRate > 0 ? (max / tickRate) * 1000 : 0;
      const startsAt = new Date(Date.parse(endsAt) - durationMs).toISOString();
      timerInfo = { endsAt, startsAt, current, max, isReady: current >= max };
    }

    // --- Team roster with portrait keys (for active job display) ---
    let team: RichJobContext['team'] = [];
    if (teamIds.length > 0) {
      try {
        const entityRecords = await (this.prisma as any).entity.findMany({
          where: { id: { in: teamIds }, ownerUserId: job.userId },
          select: { id: true, display: true, speciesId: true, imageUrl: true, progression: true },
        });
        const entityMap = new Map<string, any>(entityRecords.map((e: any) => [e.id, e]));
        team = teamIds
          .map(id => entityMap.get(id))
          .filter(Boolean)
          .map((e: any) => ({
            id: e.id,
            name: (e.display as any)?.name || e.speciesId || 'Entity',
            level: (e.progression as any)?.level ?? 1,
            portraitKey: e.imageUrl ?? undefined,
          }));
      } catch {}
    }

    // --- Entity outcomes with portrait keys (for completed job display) ---
    let entityOutcomes: RichJobContext['entityOutcomes'] = [];
    const entityResults: any[] = (results?.entityResults as any[]) || [];
    if (entityResults.length > 0) {
      const entityIds = entityResults.map((er: any) => er.id);
      const imageUrlMap = new Map<string, string | null>();
      try {
        const entityRecords = await (this.prisma as any).entity.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, imageUrl: true },
        });
        for (const e of entityRecords) imageUrlMap.set(e.id, e.imageUrl ?? null);
      } catch {}
      entityOutcomes = entityResults.map((er: any) => ({
        id: er.id,
        name: er.name ?? 'Entity',
        level: er.newLevel ?? er.level ?? 1,
        portraitKey: imageUrlMap.get(er.id) ?? undefined,
        outcome: {
          injured: er.injured ?? false,
          xpGained: er.xpGained ?? 0,
          levelBefore: er.oldLevel ?? er.level ?? 1,
          levelAfter: er.newLevel ?? er.level ?? 1,
        },
      }));
    }

    // --- Narrative text as RichTextDoc array ---
    const texts: string[] = results?.texts || [];
    const narrativeDoc = texts.map((text: string) => ({
      t: 'p',
      c: [{ t: 'em', c: [{ t: 'text', v: text }] }],
    }));

    // --- Pre-processed reward items (merged, sorted, XP total fixed) ---
    let rewardItems: RichJobContext['rewardItems'] = [];
    const rawRewards: any[] = results?.rewards || [];
    if (rawRewards.length > 0) {
      const mergedMap = new Map<string, any>();
      for (const r of rawRewards) {
        const key = `${r.type}::${r.key ?? r.type}`;
        const existing = mergedMap.get(key);
        if (existing) {
          existing.amount = (existing.amount ?? 0) + (r.amount ?? 1);
        } else {
          mergedMap.set(key, { ...r, amount: r.amount ?? 1 });
        }
      }
      const merged = Array.from(mergedMap.values());

      const XP_TYPES = new Set(['entity_xp', 'keeper_xp']);
      const RARITY_ORDER: Record<string, number> = Object.fromEntries(
        Object.entries(SHARED_RARITY_ORDER).map(([k, v]) => [k.toUpperCase(), v]),
      );

      const currencyKeys = merged.filter(r => r.type === 'currency' && r.key).map(r => r.key as string);
      const itemKeys = merged.filter(r => r.type === 'item' && r.key).map(r => r.key as string);

      const [currencyDefs, itemDefs] = await Promise.all([
        currencyKeys.length > 0
          ? (this.prisma as any).currencyDef.findMany({ where: { id: { in: currencyKeys } }, select: { id: true, sortOrder: true } })
          : Promise.resolve([]),
        itemKeys.length > 0
          ? (this.prisma as any).itemDefinition.findMany({ where: { key: { in: itemKeys } }, select: { key: true, rarity: true } })
          : Promise.resolve([]),
      ]);

      const currencySortOrder = new Map<string, number>((currencyDefs as any[]).map((c: any) => [c.id, c.sortOrder ?? 0]));
      const itemRarityOrder = new Map<string, number>((itemDefs as any[]).map((d: any) => [d.key, RARITY_ORDER[d.rarity] ?? 0]));
      const itemRarityStr = new Map<string, string>((itemDefs as any[]).map((d: any) => [d.key, d.rarity]));

      const sorted = merged.sort((a: any, b: any) => {
        const ga = XP_TYPES.has(a.type) ? 0 : a.type === 'currency' ? 1 : 2;
        const gb = XP_TYPES.has(b.type) ? 0 : b.type === 'currency' ? 1 : 2;
        if (ga !== gb) return ga - gb;
        if (a.type === 'currency') return (currencySortOrder.get(a.key) ?? 0) - (currencySortOrder.get(b.key) ?? 0);
        if (a.type === 'item') return (itemRarityOrder.get(a.key) ?? 0) - (itemRarityOrder.get(b.key) ?? 0);
        return 0;
      });

      // Entity XP total: sum actual xpGained from outcomes (fixes the stored
      // per-entity amount being shown instead of the total across all entities).
      const totalEntityXp = entityOutcomes.reduce((sum, eo) => sum + (eo.outcome?.xpGained ?? 0), 0);

      rewardItems = sorted.map((r: any) => ({
        name: this.resolveRewardName(r),
        qty: (r.type === 'entity_xp' && totalEntityXp > 0) ? totalEntityXp : (r.amount ?? 1),
        assetKey: r.key ?? this.resolveSystemRewardAssetKey(r.type),
        rarity: r.type === 'item' ? itemRarityStr.get(r.key) : undefined,
      }));
    }

    // --- Multi-phase job state ---
    const currentPhase: number = (job.currentPhase as number) ?? 0;
    const phaseResults: Array<{ phaseIndex: number; success: boolean }> =
      Array.isArray(job.phaseResults) ? (job.phaseResults as any[]) : [];
    const accumulatedState: any = job.accumulatedState ?? {};
    const currentPhaseSuccesses: number = accumulatedState?.currentPhaseSuccesses ?? 0;

    const tickRate = (tickInfo?.currentRate ?? 1) as number;

    // Map def phases — phase.duration is in seconds; convert to ticks for the block contract.
    const rawDefPhases: any[] = Array.isArray((def as any)?.phases) ? (def as any).phases : [];
    const phases = rawDefPhases.map((p: any) => ({
      durationTicks: typeof p.duration === 'number' ? Math.round(p.duration * tickRate) : 0,
      count: typeof p.count === 'number' && p.count > 1 ? p.count : undefined,
      label: typeof p.label === 'string' ? p.label : undefined,
    }));

    // Resolve mission category name for header display.
    let defCategory: string | null = null;
    const categoryDefId = (def as any)?.missionCategoryDefId;
    if (categoryDefId) {
      try {
        const cat = await (this.prisma as any).missionCategoryDef.findUnique({
          where: { id: categoryDefId },
          select: { name: true },
        });
        defCategory = cat?.name ?? null;
      } catch {}
    }

    return {
      job: {
        id: job.id,
        type: job.type,
        defId: job.defId,
        status: job.status,
        team: teamIds,
      },
      results: (results as Record<string, unknown>) || {},
      data: (job.data as Record<string, unknown>) || {},
      def: def || {},
      defDisplay: (def as any)?.displayDef ?? null,
      timer: (job.timer as Record<string, unknown>) || {},
      team,
      entityOutcomes,
      narrativeDoc,
      rewardItems,
      timerInfo,
      currentPhase,
      phaseResults,
      currentPhaseSuccesses,
      phases,
      tickRate,
      defCategory,
    };
  }

  /**
   * Builds the rich inline viewer modal for an active multi-phase mission.
   * Called before any DefaultModalDef lookup so it always takes priority over
   * generic default_mission_active records in the DB.
   */
  private buildMultiPhaseActiveViewerModal(ctx: RichJobContext, defName: string, jobId: string): any {
    const body: any[] = [];

    if (ctx.team.length > 0) {
      body.push({
        type: 'entityRoster',
        editable: false,
        entities: ctx.team.map(e => ({
          id: e.id,
          name: e.name,
          level: e.level,
          portraitKey: e.portraitKey,
        })),
      });
    }

    if (ctx.timerInfo && !ctx.timerInfo.isReady) {
      body.push({
        type: 'timer',
        endsAt: ctx.timerInfo.endsAt,
        wallClock: true,
        label: `Phase ${ctx.currentPhase + 1} of ${ctx.phases.length}`,
      });
    }

    body.push({
      type: 'mission_phases',
      currentPhaseIndex: ctx.currentPhase,
      totalPhases: ctx.phases.length,
      phaseResults: ctx.phaseResults,
      currentPhaseSuccesses: ctx.currentPhaseSuccesses,
      phases: ctx.phases,
      tickRate: ctx.tickRate,
      timerEndsAt: ctx.timerInfo?.endsAt,
    });

    return {
      version: 1,
      id: `job_${jobId}_viewer`,
      kind: 'job',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: defName,
        subtitle: ctx.defCategory ?? 'Active Expedition',
      },
      pages: [{ body }],
      buttons: [{ id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } }],
    };
  }

  /**
   * Builds the inline decision modal for a multi-phase mission in phase_ready status.
   * Shows the entity roster, phase overview, and Continue/Abandon action buttons.
   */
  private buildMultiPhaseDecisionModal(ctx: RichJobContext, defName: string, jobId: string): any {
    const body: any[] = [];

    if (ctx.team.length > 0) {
      body.push({
        type: 'entityRoster',
        editable: false,
        entities: ctx.team.map(e => ({
          id: e.id,
          name: e.name,
          level: e.level,
          portraitKey: e.portraitKey,
        })),
      });
    }

    body.push({
      type: 'mission_phases',
      currentPhaseIndex: ctx.currentPhase,
      totalPhases: ctx.phases.length,
      phaseResults: ctx.phaseResults,
      currentPhaseSuccesses: ctx.currentPhaseSuccesses,
      phases: ctx.phases,
      tickRate: ctx.tickRate,
    });

    const completedPhases = ctx.phaseResults.length;
    const remainingPhases = ctx.phases.length - completedPhases;
    const subtitle = ctx.defCategory ?? 'Expedition Decision';

    return {
      version: 1,
      id: `job_${jobId}_decision`,
      kind: 'job',
      dismiss: { backdrop: false, x: false, escape: false },
      header: {
        title: defName,
        subtitle,
      },
      pages: [{ body }],
      buttons: [
        {
          id: 'continue',
          label: remainingPhases > 1 ? `Continue (${remainingPhases} phases left)` : 'Continue to Final Phase',
          variant: 'primary',
          action: {
            type: 'EXECUTE_COMMAND',
            command: 'ContinueMission',
            payload: { jobId },
          },
        },
        {
          id: 'abandon',
          label: 'Abandon Expedition',
          variant: 'danger',
          requiresConfirm: {
            title: 'Abandon Expedition?',
            confirmLabel: 'Abandon',
            cancelLabel: 'Keep Going',
          },
          action: {
            type: 'EXECUTE_COMMAND',
            command: 'AbandonMission',
            payload: { jobId },
          },
        },
      ],
    };
  }

  /**
   * Builds the inline collect modal for a multi-phase mission in ready_notified status.
   * Shows the entity roster, full phase history, rewards, and a Collect button.
   */
  private buildMultiPhaseCollectModal(ctx: RichJobContext, defName: string, jobId: string): any {
    const body: any[] = [];

    if (ctx.team.length > 0) {
      body.push({
        type: 'entityRoster',
        editable: false,
        entities: ctx.team.map(e => ({
          id: e.id,
          name: e.name,
          level: e.level,
          portraitKey: e.portraitKey,
        })),
      });
    }

    body.push({
      type: 'mission_phases',
      currentPhaseIndex: ctx.currentPhase,
      totalPhases: ctx.phases.length,
      phaseResults: ctx.phaseResults,
      currentPhaseSuccesses: ctx.currentPhaseSuccesses,
      phases: ctx.phases,
      tickRate: ctx.tickRate,
    });

    if (ctx.narrativeDoc.length > 0) {
      body.push({ type: 'richText', doc: ctx.narrativeDoc });
    }

    if (ctx.rewardItems.length > 0) {
      body.push({ type: 'rewardsList', items: ctx.rewardItems });
    }

    if (ctx.entityOutcomes.length > 0) {
      body.push({
        type: 'entityRoster',
        editable: false,
        entities: ctx.entityOutcomes.map(e => ({
          id: e.id,
          name: e.name,
          level: e.level,
          portraitKey: e.portraitKey,
          outcome: e.outcome,
        })),
      });
    }

    const subtitle = ctx.defCategory ?? 'Expedition Complete';

    return {
      version: 1,
      id: `job_${jobId}_collect`,
      kind: 'job',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: defName,
        subtitle,
      },
      pages: [{ body }],
      buttons: [
        {
          id: 'collect',
          label: 'Collect Rewards',
          variant: 'primary',
          action: {
            type: 'EXECUTE_COMMAND',
            command: 'CompleteMission',
            payload: { jobId },
          },
        },
      ],
    };
  }

  /**
   * Enriches the skip button in an active-job modal with server-computed cost
   * metadata (affordability, scaled costs).  If the job is not skippable,
   * removes any SKIP button from the modal entirely.
   */
  private async enrichModalSkipButton(modal: any, job: any, def: any, ctx: RichJobContext): Promise<void> {
    const skipInfo = this.buildSkipInfo(job, def);
    if (!skipInfo) {
      if (Array.isArray(modal.buttons)) {
        modal.buttons = modal.buttons.filter((b: any) => b.id !== 'skip' && b.action?.type !== 'SKIP');
      }
      return;
    }

    const timerInfo = ctx.timerInfo;
    const progress = timerInfo
      ? { current: timerInfo.current, max: timerInfo.max }
      : { current: 0, max: 1 };

    // Don't show skip button when the job is already ready.
    if (timerInfo?.isReady) {
      if (Array.isArray(modal.buttons)) {
        modal.buttons = modal.buttons.filter((b: any) => b.id !== 'skip' && b.action?.type !== 'SKIP');
      }
      return;
    }

    const computedCosts = this.computeSkipCosts(skipInfo, progress);
    const currencyIds = skipInfo.skipCost
      .filter((c: any) => c.type === 'currency')
      .map((c: any) => c.id as string);

    const [currencyDefs, balances] = await Promise.all([
      currencyIds.length > 0
        ? (this.prisma as any).currency.findMany({
            where: { key: { in: currencyIds } },
            select: { id: true, key: true, name: true, iconKey: true },
          })
        : Promise.resolve([]),
      job.userId ? this.currencyService.getBalances(job.userId) : Promise.resolve({}),
    ]);

    const currencyDefMap = new Map<string, { name: string; iconKey?: string }>(
      (currencyDefs as any[]).map((c: any) => [c.key, { name: c.name, iconKey: c.iconKey ?? undefined }]),
    );

    const canAfford = computedCosts.every((c: any) => {
      if (c.type !== 'currency') return true;
      return ((balances as Record<string, number>)[c.id as string] ?? 0) >= c.amount;
    });

    const baseCosts = skipInfo.skipCost.map((c: any) => {
      const cdef = currencyDefMap.get(c.id);
      return {
        assetKey: cdef?.iconKey ?? c.id,
        label: cdef?.name ?? c.id,
        amount: c.amount,
        ...(c.type === 'currency' ? { currencyId: c.id } : {}),
      };
    });

    const skipMeta = {
      baseCosts,
      skipType: (skipInfo.skipType === 'absolute' ? 'absolute' : 'scaling') as 'absolute' | 'scaling',
    };

    if (Array.isArray(modal.buttons)) {
      const skipBtn = modal.buttons.find((b: any) => b.id === 'skip' || b.action?.type === 'SKIP');
      if (skipBtn) {
        skipBtn.skipMeta = skipMeta;
        skipBtn.disabled = !canAfford;
      } else {
        // Skip button not in spec — add it dynamically.
        modal.buttons.push({
          id: 'skip',
          label: 'Skip',
          variant: 'secondary',
          disabled: !canAfford,
          action: { type: 'SKIP', targetType: 'job', targetId: job.id },
          skipMeta,
        });
      }
    }
  }

  private getJobStateKey(status: string): string | null {
    switch (status) {
      case 'active': return 'active';
      case 'ready_notified': return 'ready';
      case 'phase_ready': return 'phase_ready';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'abandoned': return 'failed';
      default: return (status as string) === 'collected' ? 'completed' : null;
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  }

  /**
   * Returns a bare-name icon key for system reward types that carry no r.key.
   * Bare names resolve via resolveAssetUrl to /media/images/icons/<name>.png,
   * matching the static fallback served from apps/api/static/images/icons/.
   * This also makes icons discoverable from any frontend call-site that passes
   * r.type directly as an icon src (QuestCard, MissionsPage, etc.).
   */
  private resolveSystemRewardAssetKey(type: string | undefined): string | undefined {
    const map: Record<string, string> = {
      entity_xp: 'entity_xp',
      keeper_xp: 'keeper_xp',
    };
    return type ? map[type] : undefined;
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
      case 'DustingJob': return 'Dusting';
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
        return await (this.prisma as any).missionDef.findFirst({ where: { OR: [{ id: defId }, { key: defId }] }, include: { displayDef: true } });
      } else if (job.type === 'CraftingJob') {
        return await (this.prisma as any).recipeDef.findFirst({ where: { OR: [{ id: defId }, { key: defId }] }, include: { displayDef: true } });
      } else if (job.type === 'BuildingJob') {
        return await (this.prisma as any).buildingDef.findFirst({ where: { OR: [{ id: defId }, { key: defId }] }, include: { displayDef: true } });
      } else if (job.type === 'DustingJob') {
        return await (this.prisma as any).itemDefinition.findFirst({ where: { OR: [{ id: defId }, { key: defId }] } });
      }
    } catch {}
    return null;
  }

  private async resolveModalDef(id: string | null | undefined): Promise<ModalSpecV1 | null> {
    if (!id) return null;
    try {
      const modalDef = await (this.prisma as any).modalDef.findFirst({ where: { OR: [{ id }, { key: id }] } });
      if (!modalDef || !modalDef.enabled) return null;
      return modalDef.spec && typeof modalDef.spec === 'object' ? (modalDef.spec as ModalSpecV1) : null;
    } catch {}
    return null;
  }

  private async resolveDefaultModalDef(systemId: string): Promise<ModalSpecV1 | null> {
    try {
      const row = await (this.prisma as any).defaultModalDef.findFirst({ where: { OR: [{ id: systemId }, { key: systemId }] } });
      if (!row) {
        this.logger.warn(`DefaultModalDef missing for system ID "${systemId}" — no fallback spec available`);
        return null;
      }
      if (!row.enabled) {
        this.logger.warn(`DefaultModalDef "${systemId}" is disabled — fallback spec will not be applied`);
        return null;
      }
      return row.spec && typeof row.spec === 'object' ? (row.spec as ModalSpecV1) : null;
    } catch (err) {
      this.logger.warn(`Failed to resolve DefaultModalDef "${systemId}": ${(err as Error)?.message}`);
      return null;
    }
  }

  private mergeModalDefSpec(generated: any, spec: ModalSpecV1, ctx?: GiftContext | LocationContext | Record<string, any>): any {
    if (!spec || typeof spec !== 'object') return generated;

    const resolved = ctx ? resolveSpec(spec, ctx as Record<string, any>) : spec;

    const merged = { ...generated };
    if (resolved.header && typeof resolved.header === 'object') {
      merged.header = { ...generated.header, ...resolved.header };
    }
    if (Array.isArray(resolved.pages) && resolved.pages.length > 0) {
      merged.pages = resolved.pages;
    }
    if (Array.isArray(resolved.buttons) && resolved.buttons.length > 0) {
      // Preserve skipMeta and disabled (affordability) from generated skip buttons.
      // These are server-computed at request time and cannot be embedded in a static spec.
      const generatedSkipBtn = (generated.buttons as any[] | undefined)?.find(
        (b: any) => b.id === 'skip' || b.action?.type === 'SKIP',
      );
      merged.buttons = resolved.buttons.map((btn: any) => {
        const isSkipBtn = btn.id === 'skip' || btn.action?.type === 'SKIP';
        if (isSkipBtn && generatedSkipBtn) {
          return { ...btn, skipMeta: generatedSkipBtn.skipMeta, disabled: generatedSkipBtn.disabled };
        }
        if (isSkipBtn && !generatedSkipBtn) {
          this.logger.warn(
            `Modal spec introduced a skip button (id="${btn.id}") but the generated modal has no computed skipMeta. ` +
            `Skip button will be rendered without cost metadata. Modal id: ${generated.id ?? 'unknown'}`,
          );
        }
        return btn;
      });
    }
    return merged;
  }

  private getDefTimer(job: any, def: any): any {
    if (job.type === 'DustingJob') {
      return (def?.dustingData as any)?.timer ?? null;
    }
    return def?.timer ?? null;
  }

  private buildSkipInfo(job: any, def?: any): any | null {
    const defTimer = this.getDefTimer(job, def);
    if (!defTimer?.skipable) return null;
    return {
      skipable: true,
      skipCost: Array.isArray(defTimer.skip_cost) ? defTimer.skip_cost : [],
      skipType: defTimer.skip_type || 'absolute',
    };
  }

  private computeSkipCosts(
    skipInfo: { skipCost: Array<{ type: string; id: string; amount: number }>; skipType: string },
    progress: { current: number; max: number },
  ): Array<{ type: string; id: string; amount: number }> {
    const { skipCost, skipType } = skipInfo;
    let multiplier = 1;
    if (skipType === 'scaling' && progress.max > 0) {
      const remaining = Math.max(0, progress.max - progress.current);
      multiplier = remaining / progress.max;
    }
    return skipCost.map((entry) => ({
      ...entry,
      amount: multiplier < 1
        ? Math.max(1, Math.ceil(entry.amount * multiplier))
        : entry.amount,
    }));
  }

  private buildSkipConfirmBody(costs: Array<{ type: string; id: string; amount: number }>): any[] {
    const blocks: any[] = [];
    if (costs.length > 0) {
      blocks.push({
        type: 'rewardsPreview',
        items: costs.map((c) => ({
          assetKey: c.id,
          name: c.id,
          qty: c.amount,
        })),
      });
    }
    return blocks;
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
      const curDefs = await (this.prisma as any).currency.findMany({
        where: { OR: currencyIds.flatMap((s: string) => [{ id: s }, { key: s }]) },
        select: { id: true, key: true },
      });
      const uuidToSlug = new Map<string, string>(curDefs.map((c: any) => [c.id, c.key]));
      const curUuids: string[] = curDefs.map((c: any) => c.id);
      const rows = await this.prisma.userCurrencyBalance.findMany({
        where: { userId, currencyId: { in: curUuids } },
      });
      for (const r of rows) {
        const slug = uuidToSlug.get(r.currencyId) ?? r.currencyId;
        balances.currency[slug] = Number(r.balance ?? 0);
      }
    }
    if (itemIds.length > 0) {
      // Sum across stacks per definition — a player may hold multiple
      // ItemInstance rows for the same item, so taking just one would
      // wrongly mark options as unaffordable.
      const itemDefRows = await (this.prisma as any).itemDefinition.findMany({
        where: { OR: itemIds.flatMap((s: string) => [{ id: s }, { key: s }]) },
        select: { id: true, key: true },
      });
      const uuidToSlug = new Map<string, string>(itemDefRows.map((d: any) => [d.id, d.key]));
      const itemUuids: string[] = itemDefRows.map((d: any) => d.id);
      const rows = await (this.prisma as any).itemInstance.findMany({
        where: { userId, definitionId: { in: itemUuids } },
      });
      for (const r of rows) {
        const slug = uuidToSlug.get(r.definitionId) ?? r.definitionId;
        balances.item[slug] = (balances.item[slug] ?? 0) + Number(r.quantity ?? 0);
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
        doc: [{ t: 'p', c: [{ t: 'text', v: 'Choose how many charges to deposit. Each charge costs the listed resource amount.' }] }],
      });

      // Per-option quantity picker block — carries all data the frontend needs
      // to render the −/input/+ row and compute the live preview text without
      // a round-trip.
      for (const opt of options) {
        const have = balances[opt.type]?.[opt.id] ?? 0;
        const maxCharges = Math.max(0, Math.floor(have / opt.amount));
        if (maxCharges === 0) continue;
        const pickerId = `qty_${opt.type}_${opt.id}`;
        body.push({
          type: 'quantityInput',
          id: pickerId,
          min: 1,
          max: maxCharges,
          defaultValue: 1,
          resourceId: opt.id,
          costAmount: opt.amount,
          xpPerCharge: opt.xpPerCharge,
        });
      }
    }

    const buttons: any[] = [];
    if (!isMaxLevel) {
      for (const opt of options) {
        const have = balances[opt.type]?.[opt.id] ?? 0;
        const maxCharges = Math.max(0, Math.floor(have / opt.amount));
        const canAfford = maxCharges > 0;
        const pickerId = `qty_${opt.type}_${opt.id}`;
        buttons.push({
          id: `deposit_${opt.type}_${opt.id}`,
          label: `Deposit ${opt.id} (+${opt.xpPerCharge} XP/charge)`,
          variant: 'primary',
          disabled: !canAfford,
          action: {
            type: 'DEPOSIT_LOCATION_XP',
            locationId,
            costOption: { type: opt.type, id: opt.id, amount: opt.amount },
            charges: 1,
            chargesBindingId: pickerId,
          },
        });
      }
    }
    buttons.push({ id: 'close', label: 'Close', variant: 'ghost', action: { type: 'CLOSE_MODAL' } });

    const generated = {
      version: 1,
      id: `location_deposit_xp_${locationId}`,
      kind: 'location_deposit_xp',
      dismiss: { backdrop: true, x: true, escape: true },
      header: {
        title: isMaxLevel ? 'Outpost at Max Level' : 'Deposit XP',
        subtitle: location.definitionId || 'Outpost',
      },
      pages: [{ body }],
      buttons,
    };

    // Fall back to the system default modal for the XP deposit panel when no custom modal is assigned.
    // The default can only override the header framing — generated pages (balance rows, affordability
    // previews) and action buttons are preserved because the default has empty body/buttons.
    const defaultSpec = await this.resolveDefaultModalDef('default_location_deposit_xp');
    if (defaultSpec) return this.mergeModalDefSpec(generated, defaultSpec);

    return generated;
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
            where: { key: { in: buildingIds } },
            select: { key: true, name: true },
          })
        : Promise.resolve([] as any[]),
      roomIds.length > 0
        ? (this.prisma as any).roomDef.findMany({
            where: { key: { in: roomIds } },
            select: { key: true, name: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    const buildingNameById = new Map<string, string>(
      (buildingDefs as any[]).map((b) => [b.key, b.name || b.key]),
    );
    const roomNameById = new Map<string, string>(
      (roomDefs as any[]).map((r) => [r.key, r.name || r.key]),
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
      pages: [{ body }],
      buttons: [
        { id: 'continue', label: 'Continue', variant: 'primary', action: { type: 'CLOSE_MODAL' } },
      ],
    };

    const locationCtx: LocationContext = {
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

    const modalDefId = def?.levelUpModalDefId;
    if (modalDefId) {
      const spec = await this.resolveModalDef(modalDefId);
      if (spec) return this.mergeModalDefSpec(generated, spec, locationCtx);
    }

    // Fall back to the system default modal for location level-ups when no custom modal is assigned.
    const defaultSpec = await this.resolveDefaultModalDef('default_location_levelup');
    if (defaultSpec) return this.mergeModalDefSpec(generated, defaultSpec, locationCtx);

    return generated;
  }

  async buildLeadInModalForMission(userId: string, missionDefId: string): Promise<ModalSpecV1> {
    const def = await (this.prisma as any).missionDef.findFirst({ where: { OR: [{ id: missionDefId }, { key: missionDefId }] } });
    if (!def) throw new NotFoundException('Mission definition not found');

    const leadInModalDefId = (def as any).leadInModalDefId as string | null | undefined;
    if (!leadInModalDefId) throw new NotFoundException('This mission has no narrative lead-in');

    const spec = await this.resolveModalDef(leadInModalDefId);
    if (!spec) throw new NotFoundException('Lead-in modal definition not found or disabled');

    const ctx = { mission: def };
    return resolveSpec(spec, ctx as Record<string, any>);
  }
}
