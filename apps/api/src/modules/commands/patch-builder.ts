import { Patch } from './command.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveLevelConfig,
  resolveProductionRates,
  LevelRules,
} from '../game-rules/level-config.util';

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

function serializeJob(job: any) {
  const timer = job.timer as any;
  return {
    id: job.id,
    type: job.type,
    defId: job.defId,
    status: job.status,
    timer: job.timer,
    team: job.team,
    data: job.data,
    results: job.results,
    startTick: timer?.startTick ?? null,
    durationTicks: timer?.durationTicks ?? null,
  };
}

function serializeItem(item: any) {
  return {
    ...item,
    id: item.id,
    definitionId: item.definitionId,
    quantity: item.quantity,
  };
}

export class PatchBuilder {
  private patches: Patch[] = [];

  upsertJob(job: any): this {
    this.patches.push({ op: 'upsert', entity: 'job', id: job.id, data: serializeJob(job) });
    return this;
  }

  deleteJob(jobId: string): this {
    this.patches.push({ op: 'delete', entity: 'job', id: jobId });
    return this;
  }

  upsertEntity(entity: any): this {
    this.patches.push({ op: 'upsert', entity: 'entity', id: entity.id, data: serializeEntity(entity) });
    return this;
  }

  upsertItem(item: any): this {
    this.patches.push({ op: 'upsert', entity: 'item', id: item.id, data: serializeItem(item) });
    return this;
  }

  deleteItem(itemId: string): this {
    this.patches.push({ op: 'delete', entity: 'item', id: itemId });
    return this;
  }

  upsertPlayer(user: any): this {
    this.patches.push({
      op: 'upsert',
      entity: 'player',
      id: user.id,
      data: {
        id: user.id,
        username: user.username,
        keeperLevel: user.keeperLevel,
        keeperXp: user.keeperXp?.toString?.() ?? user.keeperXp,
        prestigeTokens: user.prestigeTokens,
        flags: user.flags,
      },
    });
    return this;
  }

  upsertCurrencyBalances(balances: Record<string, number>): this {
    this.patches.push({ op: 'upsert', entity: 'currencyBalance', id: '_', data: balances });
    return this;
  }

  upsertLocation(location: any, buildingJobs: any[] = [], currencyIds: Set<string> = new Set()): this {
    const jobsByBuildingId = new Map<string, any>();
    for (const job of buildingJobs) {
      const jobData = job.data as any;
      if (jobData?.buildingId) {
        jobsByBuildingId.set(jobData.buildingId, job);
      }
    }

    const storage = (location.storage as any) || {};

    const serialized = {
      id: location.id,
      ownerUserId: location.ownerUserId,
      definitionId: location.definitionId,
      regionId: location.regionId,
      name: location.definitionId || location.regionId || 'Location',
      region: location.regionId || '',
      isUnique: location.isUnique,
      level: location.level,
      xp: location.xp?.toString?.() ?? '0',
      threatLevel: location.threatLevel,
      corruptionLevel: location.corruptionLevel,
      enabled: location.enabled !== false,
      lastCollectionTick: location.lastCollectionTick?.toString?.() ?? '0',
      storage: {
        capacity: storage.capacity || {},
        stored: storage.stored || {},
        productionRates: storage.productionRates || {},
      },
      lastAccruedTick: location.lastCollectionTick?.toString?.() ?? '0',
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

    this.patches.push({ op: 'upsert', entity: 'location', id: location.id, data: serialized });
    return this;
  }

  upsertNotification(notification: any): this {
    this.patches.push({
      op: 'upsert',
      entity: 'notification',
      id: notification.id,
      data: {
        id: notification.id,
        type: notification.type,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt instanceof Date
          ? notification.createdAt.toISOString()
          : notification.createdAt,
      },
    });
    return this;
  }

  build(): Patch[] {
    return this.patches;
  }
}

export async function fetchFullLocation(prisma: PrismaService | any, locationId: string) {
  return (prisma as any).locationInstance.findUnique({
    where: { id: locationId },
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
  });
}

export async function fetchBuildingJobs(prisma: PrismaService | any, userId: string) {
  return (prisma as any).job.findMany({
    where: {
      userId,
      type: 'BuildingJob',
      status: { in: ['active', 'ready_notified'] },
    },
  });
}

export async function fetchCurrencyIds(prisma: PrismaService | any): Promise<Set<string>> {
  const currencies = await (prisma as any).currency.findMany({ select: { id: true } });
  return new Set(currencies.map((c: any) => c.id));
}

export async function fetchCurrencyMap(prisma: PrismaService | any, userId: string): Promise<Record<string, number>> {
  const rows = await (prisma as any).userCurrencyBalance.findMany({ where: { userId } });
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.currencyId] = Number(row.balance);
  }
  return map;
}

export async function fetchUserItems(prisma: PrismaService | any, userId: string) {
  return (prisma as any).itemInstance.findMany({
    where: { userId },
    include: { definition: true },
  });
}

export async function fetchActiveJobs(tx: any, userId: string) {
  return tx.job.findMany({
    where: { userId, status: { in: ['active', 'ready_notified'] } },
  });
}

export async function fetchEntity(tx: any, entityId: string) {
  return tx.entity.findUnique({
    where: { id: entityId },
    include: { equipment: true },
  });
}

export async function buildLocationPatches(pb: PatchBuilder, tx: any, userId: string, locationId: string) {
  const [location, buildingJobs, currencyIds] = await Promise.all([
    fetchFullLocation(tx, locationId),
    fetchBuildingJobs(tx, userId),
    fetchCurrencyIds(tx),
  ]);
  if (location) pb.upsertLocation(location, buildingJobs, currencyIds);
}

export async function buildCurrencyPatches(pb: PatchBuilder, tx: any, userId: string) {
  const currencyMap = await fetchCurrencyMap(tx, userId);
  pb.upsertCurrencyBalances(currencyMap);
}

export async function buildActiveJobPatches(pb: PatchBuilder, tx: any, userId: string) {
  const jobs = await fetchActiveJobs(tx, userId);
  for (const job of jobs) pb.upsertJob(job);
}

export async function buildItemPatches(pb: PatchBuilder, tx: any, userId: string) {
  const items = await fetchUserItems(tx, userId);
  for (const item of items) pb.upsertItem(item);
}

export async function buildEntityPatch(pb: PatchBuilder, tx: any, entityId: string) {
  const entity = await fetchEntity(tx, entityId);
  if (entity) pb.upsertEntity(entity);
}

export async function buildPlayerPatch(pb: PatchBuilder, tx: any, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (user) pb.upsertPlayer(user);
}
