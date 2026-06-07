import { Injectable, Logger } from '@nestjs/common';
import { CheckInService } from '../checkin/checkin.service';
import { TickService } from '../tick/tick.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HomeBannerService, HomeBannerSnapshot } from '../home-banner/home-banner.service';
import { GlobalPowerService } from '../global-power/global-power.service';
import { QuestService } from '../quest/quest.service';
import { Patch, UiIntent } from '../commands/command.types';
import { serializeLocation } from '../commands/location-serializer.util';
import { serializeEntityFull } from '../entity/entity-stats.util';
import {
  adoptLegacyCraftingJobLocations,
  pickFallbackWorkshopLocationId,
} from '../crafting/legacy-job-adoption.util';

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
    entityPowerUsages?: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>>;
    locationPowerUsages?: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>>;
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
async function enrichCheckInRewardIcons(prisma: any, instances: any[]): Promise<void> {
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
    const giftDefs = await prisma.giftDef.findMany({
      where: { id: { in: Array.from(giftDefIds) } },
      select: { id: true, name: true, presentation: true, rewardSpec: true },
    });
    for (const g of giftDefs) byId.set(g.id, g);
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
    private checkInService: CheckInService,
    private tickService: TickService,
    private homeBannerService: HomeBannerService,
    private globalPowerService: GlobalPowerService,
    private questService: QuestService,
  ) {}

  async bootstrap(userId: string): Promise<BootstrapResult> {
    try {
      await this.checkInService.autoCheck(userId);
    } catch (err) {
      this.logger.warn(`Failed to auto check-in on bootstrap for ${userId}: ${err}`);
    }

    const [
      user,
      entities,
      locations,
      buildingJobs,
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
          bonusOutpostSlots: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (this.prisma as any).entity.findMany({
        where: { ownerUserId: userId },
        include: {
          equipment: true,
          // Surface the full definition so the client can render the right
          // equipment slot tiles per species without re-fetching.
          definition: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).locationInstance.findMany({
        where: { ownerUserId: userId },
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
      (this.prisma as any).job.findMany({
        where: {
          userId,
          type: 'BuildingJob',
          status: { in: ['active', 'ready_notified'] },
        },
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
        where: { userId },
        include: { definition: true },
      }),
      this.prisma.playerDelta.findFirst({
        where: { userId },
        orderBy: { id: 'desc' },
        select: { id: true },
      }),
      this.prisma.currency.findMany({ select: { id: true } }),
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
      // Visual tag catalog: small, slow-changing, ships in the bootstrap
      // snapshot so `<Tag tagKey>` renders inline without a second fetch.
      (this.prisma as any).tagDef.findMany({
        where: { enabled: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      }),
      (this.prisma as any).visualEffectDef.findMany({
        where: { enabled: true },
        orderBy: { sortOrder: 'asc' },
      }),
      // System icon registry: maps reward-type strings to icon keys.
      // Ships in the bootstrap so components can resolve system icons
      // without a code change when new types are added via the admin panel.
      (this.prisma as any).systemIconDef.findMany({
        orderBy: { id: 'asc' },
      }),
      this.homeBannerService.listActive(userId),
      this.prisma.season.findFirst({
        where: { status: 'active', startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
        orderBy: { endsAt: 'asc' },
      }),
      this.tickService.getTickInfo(),
      this.globalPowerService.getActivePowers(),
      (this.prisma as any).entityPowerUsage.findMany({
        where: {
          entity: { ownerUserId: userId },
          lastUsedUtcDay: new Date().toISOString().slice(0, 10),
        },
        select: { entityId: true, powerKey: true, usageCount: true, lastUsedUtcDay: true },
      }),
      (this.prisma as any).locationPowerUsage.findMany({
        where: {
          locationInstance: { ownerUserId: userId },
          lastUsedUtcDay: new Date().toISOString().slice(0, 10),
        },
        select: { locationInstanceId: true, powerKey: true, usageCount: true, lastUsedUtcDay: true },
      }),
    ]);

    const cursorId = latestDelta?.id ?? BigInt(0);
    const currencyIds = new Set<string>(currencyDefs.map((c: any) => c.id));

    const entityPowerUsages: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>> = {};
    for (const row of entityPowerUsageRows as any[]) {
      if (!entityPowerUsages[row.entityId]) entityPowerUsages[row.entityId] = {};
      entityPowerUsages[row.entityId][row.powerKey] = {
        usageCount: row.usageCount,
        lastUsedUtcDay: row.lastUsedUtcDay,
      };
    }

    const locationPowerUsages: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>> = {};
    for (const row of locationPowerUsageRows as any[]) {
      if (!locationPowerUsages[row.locationInstanceId]) locationPowerUsages[row.locationInstanceId] = {};
      locationPowerUsages[row.locationInstanceId][row.powerKey] = {
        usageCount: row.usageCount,
        lastUsedUtcDay: row.lastUsedUtcDay,
      };
    }

    // Enrich each check-in def's rewards[] with the linked gift's iconKey so
    // the daily-login tracker shows the actual reward icon per day.
    try {
      await enrichCheckInRewardIcons(this.prisma, checkInInstances as any[]);
    } catch (err) {
      this.logger.warn(`CheckIn reward icon enrichment failed for ${userId}: ${err}`);
    }

    // Backward-compat for The Forge: pre-Forge CraftingJobs were stored without
    // `data.locationId`. Use the shared adoption helper so this path stays in
    // lockstep with `CraftingService.getActiveJobs`.
    try {
      await adoptLegacyCraftingJobLocations(this.prisma, jobs as any[], () =>
        pickFallbackWorkshopLocationId(locations as any[]),
      );
    } catch (err) {
      this.logger.warn(`Forge legacy job backfill failed for ${userId}: ${err}`);
    }

    const serializedEntities = await Promise.all(
      entities.map((e: any) => serializeEntityFull(this.prisma, e)),
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
