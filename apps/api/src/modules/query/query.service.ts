import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Patch, UiIntent } from '../commands/command.types';
import {
  resolveLevelConfig,
  resolveProductionRates,
  LevelRules,
} from '../game-rules/level-config.util';

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

function serializeLocationForBootstrap(location: any, buildingJobs: any[], currencyIds: Set<string> = new Set()) {
  const jobsByBuildingId = new Map<string, any>();
  for (const job of buildingJobs) {
    const jobData = job.data as any;
    if (jobData?.buildingId) {
      jobsByBuildingId.set(jobData.buildingId, job);
    }
  }

  const storage = (location.storage as any) || {};

  return {
    id: location.id,
    ownerUserId: location.ownerUserId,
    definitionId: location.definitionId,
    regionId: location.regionId,
    name: location.definitionId || location.regionId || 'Location',
    region: location.regionId || '',
    isUnique: location.isUnique,
    level: location.level,
    xp: location.xp.toString(),
    threatLevel: location.threatLevel,
    corruptionLevel: location.corruptionLevel,
    enabled: location.enabled !== false,
    lastCollectionTick: location.lastCollectionTick.toString(),
    storage: {
      capacity: storage.capacity || {},
      stored: storage.stored || {},
      productionRates: storage.productionRates || {},
    },
    lastAccruedTick: location.lastCollectionTick.toString(),
    buildings: (location.buildings ?? []).map((b: any) => {
      const job = jobsByBuildingId.get(b.id);
      const jobTimer = job?.timer as any;
      const isEnabled = b.enabled !== false;
      const status = job ? 'building' : (isEnabled ? 'active' : 'disabled');

      const bRules = (b.buildingDef?.rules as LevelRules) || {};
      const bConfig = resolveLevelConfig(bRules, b.level);
      const bProduction = resolveProductionRates(bConfig.production, b.level);
      const primaryResource = Object.keys(bProduction)[0] || null;
      const resolved = primaryResource
        ? (currencyIds.has(primaryResource) ? { outputType: 'CURRENCY', outputRefId: primaryResource } : { outputType: 'ITEM', outputRefId: primaryResource })
        : { outputType: null, outputRefId: null };
      const rph = primaryResource ? bProduction[primaryResource] : 0;

      return {
        id: b.id,
        locationId: location.id,
        buildingDefId: b.buildingDefId,
        name: b.buildingDef?.name || b.buildingDefId,
        level: b.level,
        enabled: isEnabled,
        status,
        outputType: resolved.outputType,
        outputRefId: resolved.outputRefId,
        resourcePerHour: String(rph),
        jobId: job?.id || null,
        startTick: jobTimer?.startTick ?? null,
        durationTicks: jobTimer?.durationTicks ?? null,
        jobData: job?.data || null,
        rooms: (b.rooms ?? []).map((r: any) => ({
          id: r.id,
          buildingInstanceId: b.id,
          roomDefId: r.roomDefId,
          name: r.roomDef?.name || r.roomDefId,
          level: r.level,
          enabled: r.enabled !== false,
        })),
      };
    }),
    workers: (location.workerAssignments ?? []).map((w: any) => ({
      id: w.id,
      locationId: location.id,
      entityId: w.entityId,
      roleTag: w.roleTag,
      slotIndex: 0,
    })),
  };
}

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(private prisma: PrismaService) {}

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
    ]);

    const cursorId = latestDelta?.id ?? BigInt(0);
    const currencyIds = new Set<string>(currencyDefs.map((c: any) => c.id));

    const serializedEntities = entities.map(serializeEntity);
    const serializedLocations = locations.map((loc: any) =>
      serializeLocationForBootstrap(loc, buildingJobs, currencyIds),
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
        jobs: jobs.map((j: any) => {
          const timer = j.timer as any;
          return {
            id: j.id,
            type: j.type,
            defId: j.defId,
            status: j.status,
            timer: j.timer,
            team: j.team,
            data: j.data,
            startTick: timer?.startTick ?? null,
            durationTicks: timer?.durationTicks ?? null,
          };
        }),
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          category: n.category,
          title: n.title,
          body: n.body,
          createdAt: n.createdAt.toISOString(),
        })),
        currencies: currencyMap,
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
