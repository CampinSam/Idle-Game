import { Injectable, Logger } from '@nestjs/common';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TickService } from '../tick/tick.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HomeBannerService, HomeBannerSnapshot } from '../home-banner/home-banner.service';
import { GlobalPowerService } from '../global-power/global-power.service';
import { PowerChargeService } from '../global-power/power-charge.service';
import { QuestService } from '../quest/quest.service';
import { CheckInService } from '../checkin/checkin.service';
import { BootstrapCacheService } from './bootstrap-cache.service';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';
import { Patch, UiIntent } from '../commands/command.types';
import { serializeLocation } from '../commands/location-serializer.util';
import { serializeEntityFull } from '../entity/entity-stats.util';

const MAX_DELTA_AGE = 10000;

export interface ActiveGlobalPowerSummary {
  id: string;
  label: string;
  effectDefId: string | null;
  effectDefName: string | null;
  effectCategory: string | null;
  value: number;
  valueMode: string;
  endTime: string;
  selection: Record<string, any> | null;
}

export interface PowerChargeStatus {
  grantId: string;
  chargeUnits: number;
  maxChargeUnits: number;
  costPerUse: number;
  /** Absolute JS timestamp (ms) when chargeUnits will reach costPerUse via tick drip.
   *  null when there are already enough charges or when there is no TICK recharge rule. */
  readyAtMs: number | null;
}

export interface BootstrapResult {
  serverTime: number;
  tickAnchor: {
    currentTick: number;
    tickRate: number;
    serverTime: string;
    activeBoosts: Array<{ id: string; name: string; multiplier: number; endTime: string }>;
  };
  snapshot: {
    player: any;
    state: any;
    inventory?: any;
    jobs?: any;
    notifications?: any;
    currencies?: any;
    activeEffects?: any;
    homeBanners?: HomeBannerSnapshot[];
    activeSeason?: any;
    activePowers?: ActiveGlobalPowerSummary[];
    entityPowerUsages?: Record<string, Record<string, PowerChargeStatus>>;
    locationPowerUsages?: Record<string, Record<string, PowerChargeStatus>>;
  };
  cursor: { delta: string };
  ui?: UiIntent[];
}

export interface DeltaResult {
  from: string;
  to: string;
  patches: Patch[];
  ui: UiIntent[];
}

/**
 * Best-effort derivation of a representative iconKey from a reward spec
 * (gift / quest / checkin reward). Mirrors the frontend
 * `deriveIconFromRewardSpec` helper so the server can enrich snapshots and
 * the client can fall back to its own derivation.
 */
function deriveIconFromRewardSpec(spec: any): string | null {
  if (!spec || typeof spec !== 'object') return null;
  if (typeof spec.iconKey === 'string' && spec.iconKey.trim()) return spec.iconKey;
  const type = spec.type;
  if (type === 'currency') return spec.key || spec.currencyId || null;
  if (type === 'item') return spec.key || spec.itemDefId || null;
  if (type === 'entity') return spec.definitionId || spec.entityDefId || spec.key || null;
  if (type === 'bundle' && Array.isArray(spec.entries)) {
    for (const e of spec.entries) {
      const sub = deriveIconFromRewardSpec(e);
      if (sub) return sub;
    }
  }
  return spec.currencyId || spec.itemDefId || spec.definitionId || null;
}

/**
 * Mutates each `checkInDef.rewards[i]` entry to include `iconKey` and `name`
 * fields derived from the reward's GiftSpec so the daily-login tracker can show
 * the actual reward icon for each day instead of a generic bow.
 *
 * Supports both GiftDef reference specs (`{ giftDefId }`) and inline specs
 * (`InlineGiftDef` shape with `name`, `presentation`, `rewardSpec`).
 *
 * Pure addition — never overwrites an explicit iconKey already on the entry
 * (lets admins manually override per-day).
 */
async function enrichCheckInRewardIcons(cache: DefinitionCacheService, instances: any[]): Promise<void> {
  const giftDefIds = new Set<string>();
  for (const inst of instances) {
    const rewards = inst?.checkInDef?.rewards;
    if (!Array.isArray(rewards)) continue;
    for (const r of rewards) {
      const spec = r?.gift;
      if (spec && typeof spec.giftDefId === 'string') giftDefIds.add(spec.giftDefId);
    }
  }

  const byId = new Map<string, any>();
  if (giftDefIds.size > 0) {
    const allGiftDefs = cache.getAll('giftDef');
    const matchedIds = Array.from(giftDefIds);
    for (const g of allGiftDefs) {
      if (matchedIds.includes(g.id)) byId.set(g.id, g);
    }
  }

  for (const inst of instances) {
    const rewards = inst?.checkInDef?.rewards;
    if (!Array.isArray(rewards)) continue;
    for (const r of rewards) {
      if (!r || typeof r !== 'object') continue;
      if (r.iconKey) continue; // honor explicit override

      const spec = r.gift;
      if (!spec || typeof spec !== 'object') continue;

      let giftData: { name: string; presentation: any; rewardSpec: any } | null = null;
      if (typeof spec.giftDefId === 'string') {
        giftData = byId.get(spec.giftDefId) ?? null;
      } else if (typeof spec.name === 'string') {
        giftData = { name: spec.name, presentation: spec.presentation ?? {}, rewardSpec: spec.rewardSpec ?? {} };
      }

      if (!giftData) continue;

      const rawPresentationIcon = (giftData.presentation as any)?.iconKey;
      const presentationIcon =
        typeof rawPresentationIcon === 'string' && rawPresentationIcon.trim()
          ? rawPresentationIcon.trim()
          : null;
      r.iconKey = presentationIcon || deriveIconFromRewardSpec(giftData.rewardSpec) || null;
      if (!r.name) r.name = (giftData.presentation as any)?.title || giftData.name;
    }
  }
}

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private prisma: PrismaService,
    private telemetryService: TelemetryService,
    private tickService: TickService,
    private homeBannerService: HomeBannerService,
    private globalPowerService: GlobalPowerService,
    private questService: QuestService,
    private checkInService: CheckInService,
    private bootstrapCache: BootstrapCacheService,
    private definitionCache: DefinitionCacheService,
  ) {}

  /**
   * Compute the absolute timestamp (ms) when chargeUnits will reach costPerUse
   * via TICK-based drip. Returns null if already sufficient or no TICK rule exists.
   */
  private computeReadyAtMs(
    chargeUnits: number,
    costPerUse: number,
    rechargeRules: Array<{ type: string; unitsPerTick?: number }>,
    ticksPerSecond: number,
  ): number | null {
    if (chargeUnits >= costPerUse) return null;
    const tickRule = rechargeRules.find((r) => r.type === 'TICK' && (r.unitsPerTick ?? 0) > 0);
    if (!tickRule || !tickRule.unitsPerTick) return null;
    const deficit = costPerUse - chargeUnits;
    const ticksNeeded = Math.ceil(deficit / tickRule.unitsPerTick);
    const secondsNeeded = ticksNeeded / Math.max(0.001, ticksPerSecond);
    return Date.now() + Math.round(secondsNeeded * 1000);
  }

  async bootstrap(userId: string): Promise<BootstrapResult> {
    try {
      await this.telemetryService.record(userId, 'player_login', null, 1, {});
    } catch (err) {
      this.logger.warn(`Failed to record player_login telemetry on bootstrap for ${userId}: ${err}`);
    }

    try {
      await this.checkInService.ensureInstances(userId);
    } catch (err) {
      this.logger.warn(`Failed to ensure check-in instances on bootstrap for ${userId}: ${err}`);
    }

    // Pre-fetch disabled NFT collection IDs so we can gate player game state.
    const disabledCollectionRows = await (this.prisma as any).nftCollectionDef.findMany({
      where: { active: false },
      select: { id: true },
    });
    const disabledCollectionIds: string[] = disabledCollectionRows.map((c: any) => c.id as string);

    // Pre-fetch NFT asset IDs belonging to disabled collections for location filtering.
    let disabledNftAssetIds: string[] = [];
    if (disabledCollectionIds.length > 0) {
      const disabledAssets = await (this.prisma as any).nftAsset.findMany({
        where: { collectionId: { in: disabledCollectionIds } },
        select: { nftAssetId: true },
      });
      disabledNftAssetIds = disabledAssets.map((a: any) => a.nftAssetId as string);
    }

    const [
      user,
      entities,
      locations,
      currencyBalances,
      jobs,
      notifications,
      inventory,
      latestDelta,
      currencyDefs,
      missionHistory,
      mergedQuestView,
      checkInInstances,
      activeEffects,
      unclaimedGifts,
      tagDefs,
      visualEffectDefs,
      systemIconDefs,
      homeBanners,
      activeSeason,
      tickInfo,
      activePowers,
      entityPowerUsageRows,
      locationPowerUsageRows,
      userUnlockRows,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          keeperLevel: true,
          keeperXp: true,
          prestigeTokens: true,
          flags: true,
          primaryLocationId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (this.prisma as any).entity.findMany({
        where: {
          ownerUserId: userId,
          ...(disabledCollectionIds.length > 0 && {
            OR: [
              { nftCollectionDefId: null },
              { nftCollectionDefId: { notIn: disabledCollectionIds } },
            ],
          }),
        },
        include: {
          equipment: true,
          // Surface the full definition so the client can render the right
          // equipment slot tiles per species without re-fetching.
          definition: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).locationInstance.findMany({
        where: {
          ownerUserId: userId,
          ...(disabledNftAssetIds.length > 0 && {
            OR: [
              { nftAssetId: null },
              { nftAssetId: { notIn: disabledNftAssetIds } },
            ],
          }),
        },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: { include: { displayDef: true } },
              rooms: { include: { roomDef: true } },
            },
          },
          workerAssignments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userCurrencyBalance.findMany({
        where: { userId },
      }),
      this.prisma.job.findMany({
        where: { userId, status: { in: ['active', 'ready_notified'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.findMany({
        where: { userId, dismissedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.itemInstance.findMany({
        where: {
          userId,
          ...(disabledCollectionIds.length > 0 && {
            OR: [
              { nftCollectionDefId: null },
              { nftCollectionDefId: { notIn: disabledCollectionIds } },
            ],
          }),
        },
        include: { definition: true },
      }),
      this.prisma.playerDelta.findFirst({
        where: { userId },
        orderBy: { id: 'desc' },
        select: { id: true },
      }),
      this.bootstrapCache.get('currency'),
      this.prisma.job.findMany({
        where: {
          userId,
          type: 'MissionJob',
          status: { in: ['completed', 'failed'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.questService.listMerged(userId, null),
      (this.prisma as any).checkInInstance.findMany({
        where: { userId },
        include: { checkInDef: true },
      }),
      this.findActiveEffectsForUser(userId),
      (this.prisma as any).giftInstance.findMany({
        where: { userId, status: 'UNCLAIMED' },
        orderBy: { createdAt: 'desc' },
      }),
      // Bootstrap catalog: served from process-lifetime cache (BootstrapCacheService).
      // Admin writes to tagDef/visualEffectDef/systemIconDef/currency/season invalidate
      // the cache so the next bootstrap picks up the change without a process restart.
      this.bootstrapCache.get('tagDef'),
      this.bootstrapCache.get('visualEffectDef'),
      this.bootstrapCache.get('systemIconDef'),
      this.homeBannerService.listActive(userId),
      this.bootstrapCache.get('season'),
      this.tickService.getTickInfo(),
      this.globalPowerService.getActivePowers(),
      // EntityPowerUsage: joined with PowerGrant (for powerKey + chargeConfig) via powerGrantId.
      (this.prisma as any).entityPowerUsage.findMany({
        where: { entity: { ownerUserId: userId } },
        select: {
          entityId: true,
          chargeUnits: true,
          lastChargeAppliedAt: true,
          powerGrant: {
            select: {
              id: true,
              powerKey: true,
              overrides: true,
              powerDef: { select: { chargeConfig: true } },
            },
          },
        },
      }),
      // LocationPowerUsage: joined with PowerGrant (for powerKey + chargeConfig) via powerGrantId.
      (this.prisma as any).locationPowerUsage.findMany({
        where: { locationInstance: { ownerUserId: userId } },
        select: {
          locationInstanceId: true,
          chargeUnits: true,
          lastChargeAppliedAt: true,
          powerGrant: {
            select: {
              id: true,
              powerKey: true,
              overrides: true,
              powerDef: { select: { chargeConfig: true } },
            },
          },
        },
      }),
      (this.prisma as any).userUnlock.findMany({ where: { userId }, select: { key: true } }),
    ]);

    const cursorId = latestDelta?.id ?? BigInt(0);
    const currencyIds = new Set<string>(currencyDefs.map((c: any) => c.id));

    // ticksPerSecond used for readyAtMs calculations below.
    const ticksPerSecond = tickInfo.currentRate;
    // currentTick as BigInt for tick-drip projection.
    const currentTickBig = BigInt(Math.floor(tickInfo.currentTick));

    const entityPowerUsages: Record<string, Record<string, PowerChargeStatus>> = {};
    for (const row of entityPowerUsageRows as any[]) {
      if (!row.powerGrant) continue;
      const { id: grantId, powerKey, overrides, powerDef } = row.powerGrant;
      const chargeConfig = PowerChargeService.extractChargeConfig(powerDef, overrides);
      // Project effective charge units at bootstrap time by applying elapsed tick-drip.
      const lastChargeAppliedAt = row.lastChargeAppliedAt != null ? BigInt(row.lastChargeAppliedAt) : null;
      const chargeUnits = PowerChargeService.projectChargeUnits(
        row.chargeUnits as number,
        lastChargeAppliedAt,
        currentTickBig,
        chargeConfig,
      );
      const maxChargeUnits = chargeConfig.maxChargeUnits ?? 1;
      const costPerUse = chargeConfig.costPerUse ?? 1;
      const readyAtMs = this.computeReadyAtMs(chargeUnits, costPerUse, chargeConfig.rechargeRules ?? [], ticksPerSecond);

      if (!entityPowerUsages[row.entityId]) entityPowerUsages[row.entityId] = {};
      entityPowerUsages[row.entityId][powerKey] = { grantId, chargeUnits, maxChargeUnits, costPerUse, readyAtMs };
    }

    const locationPowerUsages: Record<string, Record<string, PowerChargeStatus>> = {};
    for (const row of locationPowerUsageRows as any[]) {
      if (!row.powerGrant) continue;
      const { id: grantId, powerKey, overrides, powerDef } = row.powerGrant;
      const chargeConfig = PowerChargeService.extractChargeConfig(powerDef, overrides);
      // Project effective charge units at bootstrap time by applying elapsed tick-drip.
      const lastChargeAppliedAt = row.lastChargeAppliedAt != null ? BigInt(row.lastChargeAppliedAt) : null;
      const chargeUnits = PowerChargeService.projectChargeUnits(
        row.chargeUnits as number,
        lastChargeAppliedAt,
        currentTickBig,
        chargeConfig,
      );
      const maxChargeUnits = chargeConfig.maxChargeUnits ?? 1;
      const costPerUse = chargeConfig.costPerUse ?? 1;
      const readyAtMs = this.computeReadyAtMs(chargeUnits, costPerUse, chargeConfig.rechargeRules ?? [], ticksPerSecond);

      if (!locationPowerUsages[row.locationInstanceId]) locationPowerUsages[row.locationInstanceId] = {};
      locationPowerUsages[row.locationInstanceId][powerKey] = { grantId, chargeUnits, maxChargeUnits, costPerUse, readyAtMs };
    }

    // Derive building jobs from the unified jobs array — no extra query needed.
    const buildingJobs = jobs.filter((j: any) => j.type === 'BuildingJob');

    // Enrich each check-in def's rewards[] with the linked gift's iconKey so
    // the daily-login tracker shows the actual reward icon per day.
    try {
      await enrichCheckInRewardIcons(this.definitionCache, checkInInstances as any[]);
    } catch (err) {
      this.logger.warn(`CheckIn reward icon enrichment failed for ${userId}: ${err}`);
    }

    // Batch all equipped item instance IDs across all entities into a single
    // query, then pass the resulting map to each serializeEntityFull call so
    // there is at most one itemInstance.findMany regardless of entity count.
    const allEquippedItemIds: string[] = (entities as any[]).flatMap((e: any) =>
      (Array.isArray(e.equipment) ? e.equipment : [])
        .map((eq: any) => eq.itemInstanceId)
        .filter(Boolean),
    );
    const preloadedItems = new Map<string, any>();
    if (allEquippedItemIds.length > 0) {
      const allItems = await (this.prisma as any).itemInstance.findMany({
        where: { id: { in: allEquippedItemIds } },
        include: {
          definition: {
            select: { id: true, name: true, iconKey: true, rarity: true, equipData: true },
          },
        },
      });
      for (const item of allItems) {
        preloadedItems.set(item.id, item);
      }
    }

    const serializedEntities = await Promise.all(
      entities.map((e: any) => serializeEntityFull(this.prisma, e, preloadedItems)),
    );
    const serializedLocations = locations.map((loc: any) =>
      serializeLocation(loc, buildingJobs, currencyIds),
    );

    const currencyMap: Record<string, number> = {};
    for (const row of currencyBalances) {
      currencyMap[row.currencyId] = Number(row.balance);
    }

    // Collect one-time UI intents (welcome modal, season intro).
    // These are shown once per trigger and tracked via user.flags.
    const bootstrapUi: UiIntent[] = [];
    const userFlags = ((user?.flags as Record<string, any>) ?? {});
    const flagUpdates: Record<string, any> = {};

    // Welcome modal — shown exactly once on a user's first bootstrap.
    if (!userFlags.seenWelcomeModal) {
      try {
        const welcomeRow = await (this.prisma as any).defaultModalDef.findUnique({
          where: { id: 'default_welcome' },
        });
        if (welcomeRow?.enabled && welcomeRow.spec) {
          bootstrapUi.push({ type: 'modal', spec: welcomeRow.spec as any });
        }
      } catch (err) {
        this.logger.warn(`Failed to load default_welcome for ${userId}: ${err}`);
      }
      flagUpdates.seenWelcomeModal = true;
    }

    // Season intro — shown once per active season (keyed on season id).
    if (activeSeason && userFlags.seenSeasonIntroFor !== activeSeason.id) {
      try {
        const seasonIntroRow = await (this.prisma as any).defaultModalDef.findUnique({
          where: { id: 'default_season_intro' },
        });
        if (seasonIntroRow?.enabled && seasonIntroRow.spec) {
          bootstrapUi.push({ type: 'modal', spec: seasonIntroRow.spec as any });
        }
      } catch (err) {
        this.logger.warn(`Failed to load default_season_intro for ${userId}: ${err}`);
      }
      flagUpdates.seenSeasonIntroFor = activeSeason.id;
    }

    // Persist flag updates in the background (best-effort, does not block response).
    if (user && Object.keys(flagUpdates).length > 0) {
      this.prisma.user
        .update({
          where: { id: user.id },
          data: { flags: { ...(userFlags as object), ...flagUpdates } },
        })
        .catch((err) => {
          this.logger.warn(`Failed to persist bootstrap modal flags for ${userId}: ${err}`);
        });
    }

    return {
      serverTime: Date.now(),
      tickAnchor: {
        currentTick: tickInfo.currentTick,
        tickRate: tickInfo.currentRate,
        serverTime: tickInfo.serverTime,
        activeBoosts: tickInfo.activeBoosts,
      },
      snapshot: {
        player: user
          ? {
              ...user,
              keeperXp: user.keeperXp.toString(),
              unlocks: (userUnlockRows as { key: string }[]).map(u => u.key),
            }
          : null,
        state: {
          entities: serializedEntities,
          locations: serializedLocations,
          buildings: serializedLocations.flatMap((loc: any) =>
            (loc.buildings || []).map((b: any) => ({ ...b, locationId: loc.id })),
          ),
          rooms: serializedLocations.flatMap((loc: any) =>
            (loc.buildings || []).flatMap((b: any) =>
              (b.rooms || []).map((r: any) => ({ ...r, buildingInstanceId: b.id })),
            ),
          ),
          quests: (mergedQuestView as any[]).filter((q: any) => q.questDef?.category !== 'achievement'),
          achievements: (mergedQuestView as any[]).filter((q: any) => q.questDef?.category === 'achievement'),
          checkins: checkInInstances,
          gifts: unclaimedGifts,
          tagDefs,
          visualEffectDefs,
          systemIconDefs,
          missions: jobs
            .filter((j: any) => j.type === 'MissionJob')
            .map((j: any) => {
              const timer = j.timer as any;
              return {
                id: j.id,
                type: j.type,
                defId: j.defId,
                status: j.status,
                startTick: timer?.startTick ?? null,
                durationTicks: timer?.durationTicks ?? null,
                team: j.team,
                data: j.data,
              };
            }),
        },
        inventory: inventory.map((item: any) => ({
          ...item,
          id: item.id,
          definitionId: item.definitionId,
          quantity: item.quantity,
        })),
        jobs: [...jobs, ...missionHistory].map((j: any) => {
          const timer = j.timer as any;
          return {
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
            updatedAt: j.updatedAt?.toISOString?.() ?? j.updatedAt,
          };
        }),
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          category: n.category,
          priority: n.priority,
          title: n.title,
          body: n.body,
          deepLink: n.deepLink ?? {},
          meta: n.meta ?? {},
          groupKey: n.groupKey ?? null,
          sourceType: n.sourceType ?? null,
          sourceId: n.sourceId ?? null,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt ? n.readAt.toISOString() : null,
          dismissedAt: n.dismissedAt ? n.dismissedAt.toISOString() : null,
        })),
        currencies: currencyMap,
        activeEffects: (activeEffects as any[]).map((e: any) => ({
          id: e.id,
          effectDefId: e.effectDefId,
          targetType: e.targetType,
          targetId: e.targetId,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          category: e.category,
          valueMode: e.valueMode,
          value: e.value,
          stats: e.stats,
          trait: e.trait,
          currentStacks: e.currentStacks,
          remainingUses: e.remainingUses,
          sessionType: e.sessionType,
          sessionId: e.sessionId,
          expiresAt: e.expiresAt?.toISOString?.() ?? null,
          expiresAtTick: e.expiresAtTick,
          createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
        })),
        homeBanners,
        activeSeason: activeSeason
          ? {
              id: activeSeason.id,
              name: activeSeason.name,
              startsAt: activeSeason.startsAt.toISOString(),
              endsAt: activeSeason.endsAt.toISOString(),
              status: activeSeason.status,
              config: activeSeason.config ?? {},
            }
          : null,
        activePowers: await Promise.all(activePowers.map(async (p) => {
          const s = await this.globalPowerService.serializePower(p);
          return {
            id: s.id,
            label: s.label,
            effectDefId: s.effectDefId,
            effectDefName: s.effectDefName,
            effectCategory: s.effectCategory,
            value: s.value,
            valueMode: s.valueMode,
            endTime: s.endTime,
            selection: s.selection,
          };
        })),
        entityPowerUsages,
        locationPowerUsages,
      },
      cursor: { delta: cursorId.toString() },
      ui: bootstrapUi.length > 0 ? bootstrapUi : undefined,
    };
  }

  async getDelta(
    userId: string,
    sinceId: string,
  ): Promise<DeltaResult | { resetRequired: true }> {
    const since = BigInt(sinceId);

    const oldest = await this.prisma.playerDelta.findFirst({
      where: { userId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (oldest && since > BigInt(0) && since < oldest.id) {
      return { resetRequired: true };
    }

    const deltas = await this.prisma.playerDelta.findMany({
      where: {
        userId,
        id: { gt: since },
      },
      orderBy: { id: 'asc' },
      take: MAX_DELTA_AGE,
    });

    const patches: Patch[] = [];
    const ui: UiIntent[] = [];

    for (const delta of deltas) {
      const dp = delta.patches as any;
      const du = delta.ui as any;
      if (Array.isArray(dp)) patches.push(...dp);
      if (Array.isArray(du)) ui.push(...du);
    }

    const lastId =
      deltas.length > 0 ? deltas[deltas.length - 1].id : since;

    return {
      from: since.toString(),
      to: lastId.toString(),
      patches,
      ui,
    };
  }

  private async findActiveEffectsForUser(userId: string) {
    const now = new Date();
    const currentTick = await this.tickService.getCurrentTick(now);
    return (this.prisma as any).activeEffect.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null, expiresAtTick: null },
          { expiresAt: { gt: now } },
          { expiresAtTick: { gt: currentTick } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
