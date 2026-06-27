import { Patch } from './command.types';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeLocation } from './location-serializer.util';
import { serializeEntityFull } from '../entity/entity-stats.util';
import { evaluateTopLevelRules } from '../game-rules/evaluate-top-level-rules.util';

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
    currentPhase: job.currentPhase ?? 0,
    phaseResults: job.phaseResults ?? null,
    accumulatedState: job.accumulatedState ?? null,
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

  /**
   * Pushes an entity upsert patch using a *pre-serialized* payload. Callers
   * that want the canonical equipment-aware payload (with `baseStats` and
   * `equippedStats`) should use `buildEntityPatch` instead, which awaits
   * `serializeEntityFull` and forwards here.
   */
  upsertEntity(entityData: any): this {
    this.patches.push({ op: 'upsert', entity: 'entity', id: entityData.id, data: entityData });
    return this;
  }

  upsertItem(item: any): this {
    this.patches.push({ op: 'upsert', entity: 'item', id: item.id, data: serializeItem(item) });
    return this;
  }

  upsertAchievement(instance: any): this {
    // Pass through the full row including the included `questDef`
    // so the frontend can render names/descriptions without a second
    // fetch. Achievement instances are QuestInstance rows with
    // category='achievement' on their questDef.
    this.patches.push({
      op: 'upsert',
      entity: 'achievement',
      id: instance.id,
      data: instance,
    });
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
        primaryLocationId: user.primaryLocationId ?? null,
        bonusOutpostSlots: user.bonusOutpostSlots ?? 0,
      },
    });
    return this;
  }

  upsertCurrencyBalances(balances: Record<string, number>): this {
    this.patches.push({ op: 'upsert', entity: 'currencyBalance', id: '_', data: balances });
    return this;
  }

  upsertLocation(location: any, buildingJobs: any[] = [], currencyIds: Set<string> = new Set()): this {
    const serialized = serializeLocation(location, buildingJobs, currencyIds);
    this.patches.push({ op: 'upsert', entity: 'location', id: location.id, data: serialized });
    return this;
  }

  upsertNotification(notification: any): this {
    const toIso = (v: any) =>
      v instanceof Date ? v.toISOString() : (v ?? null);
    this.patches.push({
      op: 'upsert',
      entity: 'notification',
      id: notification.id,
      data: {
        id: notification.id,
        type: notification.type,
        category: notification.category,
        priority: notification.priority,
        title: notification.title,
        body: notification.body,
        deepLink: notification.deepLink ?? {},
        meta: notification.meta ?? {},
        groupKey: notification.groupKey ?? null,
        sourceType: notification.sourceType ?? null,
        sourceId: notification.sourceId ?? null,
        createdAt: toIso(notification.createdAt),
        readAt: toIso(notification.readAt),
        dismissedAt: toIso(notification.dismissedAt),
      },
    });
    return this;
  }

  upsertActiveEffect(effect: any): this {
    this.patches.push({
      op: 'upsert',
      entity: 'activeEffect',
      id: effect.id,
      data: {
        id: effect.id,
        effectDefId: effect.effectDefId,
        targetType: effect.targetType,
        targetId: effect.targetId,
        sourceType: effect.sourceType,
        sourceId: effect.sourceId,
        category: effect.category,
        valueMode: effect.valueMode,
        value: effect.value,
        stats: effect.stats,
        trait: effect.trait,
        currentStacks: effect.currentStacks,
        remainingUses: effect.remainingUses,
        sessionType: effect.sessionType,
        sessionId: effect.sessionId,
        expiresAt: effect.expiresAt instanceof Date ? effect.expiresAt.toISOString() : (effect.expiresAt ?? null),
        expiresAtTick: effect.expiresAtTick,
        createdAt: effect.createdAt instanceof Date ? effect.createdAt.toISOString() : effect.createdAt,
      },
    });
    return this;
  }

  deleteActiveEffect(id: string): this {
    this.patches.push({ op: 'delete', entity: 'activeEffect', id });
    return this;
  }

  upsert(entity: string, id: string, data: any): this {
    this.patches.push({ op: 'upsert', entity, id, data });
    return this;
  }

  delete(entity: string, id: string): this {
    this.patches.push({ op: 'delete', entity, id });
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
  const currencies = await (prisma as any).currency.findMany({ select: { key: true } });
  return new Set(currencies.map((c: any) => c.key));
}

export async function fetchCurrencyMap(prisma: PrismaService | any, userId: string): Promise<Record<string, number>> {
  const rows = await (prisma as any).userCurrencyBalance.findMany({
    where: { userId },
    include: { currency: { select: { key: true } } },
  });
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.currency.key] = Number(row.balance);
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
    include: {
      equipment: true,
      definition: true,
    },
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
  if (!entity) return;
  const payload = await serializeEntityFull(tx, entity);
  pb.upsertEntity(payload);
}

export async function buildPlayerPatch(pb: PatchBuilder, tx: any, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (user) pb.upsertPlayer(user);
}

export async function fetchActiveEffects(tx: any, userId: string, currentTick?: number) {
  const now = new Date();
  const orClauses: any[] = [
    { expiresAt: null, expiresAtTick: null },
    { expiresAt: { gt: now } },
  ];
  if (currentTick !== undefined) {
    orClauses.push({ expiresAtTick: { gt: currentTick } });
  }
  return tx.activeEffect.findMany({
    where: { userId, OR: orClauses },
    orderBy: { createdAt: 'asc' },
  });
}

export async function buildActiveEffectPatches(pb: PatchBuilder, tx: any, userId: string, currentTick?: number) {
  const effects = await fetchActiveEffects(tx, userId, currentTick);
  for (const effect of effects) pb.upsertActiveEffect(effect);
}

/**
 * Re-evaluates `requirementStatus` for every mission category def and mission
 * def using the player's current flags (as visible inside `tx`). Emits
 * `{ op:'upsert', entity:'categoryDef'|'missionDef' }` patches so the client
 * can unlock gated categories/missions in the same render cycle that applies
 * the mission-completion patches — no separate HTTP refetch needed.
 *
 * Call this only when flags were actually changed (e.g. resolvedFlagCount > 0)
 * to keep the patch payload small.
 */
export async function buildMissionDefStatusPatches(
  pb: PatchBuilder,
  tx: any,
  userId: string,
  gameRules: any,
): Promise<void> {
  const user = await (tx as any).user.findUnique({ where: { id: userId } });
  if (!user) return;

  const reqContext = gameRules.buildRequirementContext(user);

  const categories = await (tx as any).missionCategoryDef.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  for (const cat of categories) {
    const requirementStatus = cat.requirements
      ? evaluateTopLevelRules(cat.requirements, reqContext, gameRules)
      : [];
    pb.upsert('categoryDef', cat.id, { requirementStatus });
  }

  const missionDefs = await (tx as any).missionDef.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  for (const def of missionDefs) {
    const requirementStatus = def.requirements
      ? evaluateTopLevelRules(def.requirements, reqContext, gameRules)
      : [];
    const launchRequirementStatus = def.launchRequirements
      ? evaluateTopLevelRules(def.launchRequirements, reqContext, gameRules)
      : [];
    pb.upsert('missionDef', def.id, { requirementStatus, launchRequirementStatus });
  }
}
