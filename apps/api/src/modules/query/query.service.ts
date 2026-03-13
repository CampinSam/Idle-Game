import { Injectable, Logger } from '@nestjs/common';
import { CheckInService } from '../checkin/checkin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Patch, UiIntent } from '../commands/command.types';
import { serializeLocation } from '../commands/location-serializer.util';

const MAX_DELTA_AGE = 10000;

export interface BootstrapResult {
  serverTime: number;
  snapshot: {
    player: any;
    state: any;
    inventory?: any;
    jobs?: any;
    notifications?: any;
    currencies?: any;
    activeEffects?: any;
  };
  cursor: { delta: string };
}

export interface DeltaResult {
  from: string;
  to: string;
  patches: Patch[];
  ui: UiIntent[];
}

function serializeEntity(entity: any) {
  const progression = (entity.progression as any) || {};
  if (progression && typeof progression.xp === 'bigint') {
    progression.xp = Number(progression.xp);
  }
  const display = (entity.display as any) || {};
  const state = (entity.state as any) || {};
  return {
    ...entity,
    progression,
    name: display.name || entity.speciesId || 'Entity',
    level: progression.level || 1,
    xp: Number(progression.xp || 0),
    status: state.status || 'idle',
  };
}


@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private prisma: PrismaService,
    private checkInService: CheckInService,
  ) {}

  async bootstrap(userId: string): Promise<BootstrapResult> {
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
      questInstances,
      checkInInstances,
      activeEffects,
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
          createdAt: true,
          updatedAt: true,
        },
      }),
      (this.prisma as any).entity.findMany({
        where: { ownerUserId: userId },
        include: { equipment: true },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).locationInstance.findMany({
        where: { ownerUserId: userId },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: true,
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
      (this.prisma as any).questInstance.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      }),
      (this.prisma as any).checkInInstance.findMany({
        where: { userId },
      }),
      (this.prisma as any).activeEffect.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Auto check-in on bootstrap (fire-and-forget so fresh gifts appear next bootstrap)
    try {
      await this.checkInService.autoCheck(userId);
    } catch (err) {
      this.logger.warn(`Failed to auto check-in on bootstrap for ${userId}: ${err}`);
    }

    const cursorId = latestDelta?.id ?? BigInt(0);
    const currencyIds = new Set<string>(currencyDefs.map((c: any) => c.id));

    const serializedEntities = entities.map(serializeEntity);
    const serializedLocations = locations.map((loc: any) =>
      serializeLocation(loc, buildingJobs, currencyIds),
    );

    const currencyMap: Record<string, number> = {};
    for (const row of currencyBalances) {
      currencyMap[row.currencyId] = Number(row.balance);
    }

    return {
      serverTime: Date.now(),
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
          quests: questInstances,
          checkins: checkInInstances,
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
      },
      cursor: { delta: cursorId.toString() },
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
}
