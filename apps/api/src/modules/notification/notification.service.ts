import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatLevelUpBody } from '../entity/entity-generator.util';

/**
 * Cumulatively merge two LocationLevelUnlocks payloads. Used when collapsing
 * multiple `location_level_up` notifications for the same outpost into a
 * single grouped record so the modal can display every unlock gained over
 * the entire `fromLevel -> toLevel` span, not just the most recent increment.
 *
 * - Numeric slot deltas are summed.
 * - Allowed-building / allowed-room ID lists are unioned (preserving order).
 * - Storage capacity additions are summed per `${type}:${id}`.
 */
function mergeLocationUnlocks(prev: any, next: any): any {
  const a = prev && typeof prev === 'object' ? prev : null;
  const b = next && typeof next === 'object' ? next : null;
  if (!a) return b ?? null;
  if (!b) return a;

  const unionIds = (xa: any, xb: any): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const arr of [Array.isArray(xa) ? xa : [], Array.isArray(xb) ? xb : []]) {
      for (const id of arr) {
        if (typeof id === 'string' && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out;
  };

  const storageMap = new Map<string, { type: string; id: string; addedCapacity: number }>();
  for (const arr of [a.storageAdded, b.storageAdded]) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (!s || typeof s.id !== 'string' || typeof s.type !== 'string') continue;
      const key = `${s.type}:${s.id}`;
      const cur = storageMap.get(key);
      const add = Number(s.addedCapacity ?? 0);
      if (cur) cur.addedCapacity += add;
      else storageMap.set(key, { type: s.type, id: s.id, addedCapacity: add });
    }
  }

  const productionMap = new Map<string, { type: string; id: string; addedRate: number }>();
  for (const arr of [a.productionAdded, b.productionAdded]) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (!p || typeof p.id !== 'string' || typeof p.type !== 'string') continue;
      const key = `${p.type}:${p.id}`;
      const cur = productionMap.get(key);
      const add = Number(p.addedRate ?? 0);
      if (cur) cur.addedRate += add;
      else productionMap.set(key, { type: p.type, id: p.id, addedRate: add });
    }
  }

  return {
    workerSlotsAdded: Number(a.workerSlotsAdded ?? 0) + Number(b.workerSlotsAdded ?? 0),
    buildingSlotsAdded: Number(a.buildingSlotsAdded ?? 0) + Number(b.buildingSlotsAdded ?? 0),
    newAllowedBuildings: unionIds(a.newAllowedBuildings, b.newAllowedBuildings),
    newAllowedRooms: unionIds(a.newAllowedRooms, b.newAllowedRooms),
    storageAdded: Array.from(storageMap.values()),
    productionAdded: Array.from(productionMap.values()),
  };
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  private get notification() {
    return (this.prisma as any).notification;
  }

  /**
   * Records an entity level-up notification.
   *
   * Uses a per-entity `groupKey` so multiple level-ups (or multi-level jumps
   * across separate addEntityXp calls) for the same entity within ~90s
   * collapse into a single toast that shows the cumulative stat gains.
   * Priority is `high` so the client toast pipeline auto-surfaces it.
   *
   * Bypasses the generic `createNotification` aggregation because we need to
   * sum per-stat deltas (count + body merge isn't enough).
   */
  async recordEntityLevelUp(
    data: {
      userId: string;
      entityId: string;
      entityName: string;
      fromLevel: number;
      toLevel: number;
      gainsPerLevel: Array<{ level: number; gains: Record<string, number> }>;
    },
    tx?: any,
  ) {
    const notif = tx ? (tx as any).notification : this.notification;
    const groupKey = `entity_level_up:${data.entityId}`;

    const incomingTotal: Record<string, number> = {};
    for (const lvl of data.gainsPerLevel) {
      for (const [k, v] of Object.entries(lvl.gains || {})) {
        if (typeof v === 'number' && v > 0) {
          incomingTotal[k] = (incomingTotal[k] || 0) + v;
        }
      }
    }

    const cutoff = new Date(Date.now() - 90 * 1000);
    const existing = await notif.findFirst({
      where: {
        userId: data.userId,
        groupKey,
        readAt: null,
        archivedAt: null,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const meta = (existing.meta as any) || {};
      const merged: Record<string, number> = { ...(meta.totalGains || {}) };
      for (const [k, v] of Object.entries(incomingTotal)) {
        merged[k] = (merged[k] || 0) + v;
      }
      const fromLevel = typeof meta.fromLevel === 'number' ? meta.fromLevel : data.fromLevel;
      return notif.update({
        where: { id: existing.id },
        data: {
          title: 'Level Up!',
          body: formatLevelUpBody(data.entityName, data.toLevel, merged),
          meta: {
            ...meta,
            entityId: data.entityId,
            entityName: data.entityName,
            fromLevel,
            toLevel: data.toLevel,
            totalGains: merged,
            gainsPerLevel: [
              ...(Array.isArray(meta.gainsPerLevel) ? meta.gainsPerLevel : []),
              ...data.gainsPerLevel,
            ],
            count: (meta.count || 1) + 1,
          },
        },
      });
    }

    return notif.create({
      data: {
        userId: data.userId,
        type: 'entity_level_up',
        category: 'progression',
        priority: 'high',
        title: 'Level Up!',
        body: formatLevelUpBody(data.entityName, data.toLevel, incomingTotal),
        deepLink: { screen: `/entities/${data.entityId}`, entityId: data.entityId },
        meta: {
          entityId: data.entityId,
          entityName: data.entityName,
          fromLevel: data.fromLevel,
          toLevel: data.toLevel,
          totalGains: incomingTotal,
          gainsPerLevel: data.gainsPerLevel,
          count: 1,
        },
        groupKey,
      },
    });
  }

  /**
   * Records a location level-up notification.
   *
   * Uses a per-location `groupKey` so multiple level-ups for the same
   * outpost within ~90s collapse into a single toast. Priority is `high`
   * so the client toast pipeline auto-surfaces it; deepLink targets the
   * outpost detail page so taps land users on the relevant location.
   */
  async recordLocationLevelUp(
    data: {
      userId: string;
      locationId: string;
      locationName: string;
      fromLevel: number;
      toLevel: number;
      unlocks?: any;
    },
    tx?: any,
  ) {
    const notif = tx ? (tx as any).notification : this.notification;
    const groupKey = `location_level_up:${data.locationId}`;

    const cutoff = new Date(Date.now() - 90 * 1000);
    const existing = await notif.findFirst({
      where: {
        userId: data.userId,
        groupKey,
        readAt: null,
        archivedAt: null,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });

    const body = `${data.locationName} reached Level ${data.toLevel}!`;

    if (existing) {
      const meta = (existing.meta as any) || {};
      const fromLevel = typeof meta.fromLevel === 'number' ? meta.fromLevel : data.fromLevel;
      // Merge unlocks cumulatively across grouped level-ups so the modal
      // reflects everything gained between the original `fromLevel` and the
      // latest `toLevel`, not just the most recent increment.
      const mergedUnlocks = mergeLocationUnlocks(meta.unlocks, data.unlocks);
      return notif.update({
        where: { id: existing.id },
        data: {
          title: 'Outpost Level Up!',
          body,
          meta: {
            ...meta,
            locationId: data.locationId,
            locationName: data.locationName,
            fromLevel,
            toLevel: data.toLevel,
            unlocks: mergedUnlocks,
            count: (meta.count || 1) + 1,
          },
        },
      });
    }

    return notif.create({
      data: {
        userId: data.userId,
        type: 'location_level_up',
        category: 'locations',
        priority: 'high',
        title: 'Outpost Level Up!',
        body,
        deepLink: { screen: `/locations/${data.locationId}`, locationId: data.locationId },
        meta: {
          locationId: data.locationId,
          locationName: data.locationName,
          fromLevel: data.fromLevel,
          toLevel: data.toLevel,
          unlocks: data.unlocks ?? null,
          count: 1,
        },
        groupKey,
      },
    });
  }

  async createNotification(data: {
    userId: string;
    type: string;
    category: string;
    priority: string;
    title: string;
    body: string;
    deepLink?: any;
    meta?: any;
    groupKey?: string;
    sourceType?: string;
    sourceId?: string;
  }, tx?: any) {
    const notif = tx ? (tx as any).notification : this.notification;

    if (data.groupKey) {
      const cutoff = new Date(Date.now() - 90 * 1000);
      const existing = await notif.findFirst({
        where: {
          userId: data.userId,
          groupKey: data.groupKey,
          readAt: null,
          archivedAt: null,
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        const currentMeta = (existing.meta as any) || {};
        const newCount = (currentMeta.count || 1) + 1;
        return notif.update({
          where: { id: existing.id },
          data: {
            title: data.title,
            body: data.body,
            meta: { ...currentMeta, count: newCount },
            deepLink: data.deepLink || existing.deepLink,
          },
        });
      }
    }

    const payload = {
      userId: data.userId,
      type: data.type,
      category: data.category,
      priority: data.priority,
      title: data.title,
      body: data.body,
      deepLink: data.deepLink || {},
      meta: data.meta || { count: 1 },
      groupKey: data.groupKey || null,
      sourceType: data.sourceType || null,
      sourceId: data.sourceId || null,
    };

    if (data.sourceType && data.sourceId) {
      const existing = await notif.findFirst({
        where: {
          userId: data.userId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          type: data.type,
        },
      });
      if (existing) return existing;

      try {
        const created = await notif.create({ data: payload });
        if (!tx) await this.pruneOld(data.userId);
        return created;
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return await notif.findFirst({
            where: {
              userId: data.userId,
              sourceType: data.sourceType,
              sourceId: data.sourceId,
              type: data.type,
            },
          });
        }
        throw e;
      }
    }

    const created = await notif.create({ data: payload });
    if (!tx) await this.pruneOld(data.userId);
    return created;
  }

  /**
   * Creates a notification as direct feedback for a player command.
   * Unlike createNotification, this never groups, deduplicates, or aggregates —
   * every call produces a distinct record. Always normal priority.
   * Pass `ctx.tx` so the record is committed atomically with the command.
   */
  async createForCommand(data: {
    userId: string;
    type: string;
    category: string;
    title: string;
    body: string;
    deepLink?: any;
    meta?: any;
  }, tx?: any) {
    const notif = tx ? (tx as any).notification : this.notification;
    return notif.create({
      data: {
        userId: data.userId,
        type: data.type,
        category: data.category,
        priority: 'normal',
        title: data.title,
        body: data.body,
        deepLink: data.deepLink ?? {},
        meta: data.meta ?? { count: 1 },
        groupKey: null,
        sourceType: null,
        sourceId: null,
      },
    });
  }

  /**
   * Upserts the single notification record that tracks a job through its
   * entire lifecycle (started → job_ready → complete/collected).
   *
   * Keyed by { sourceType: 'job', sourceId: jobId } — type-agnostic so it
   * transitions through any lifecycle phase without caring about the current
   * type. On update: rewrites type/title/body/deepLink/priority and clears
   * readAt + dismissedAt so the record resurfaces as unread. On create:
   * stores the keyed source fields so future transitions find it.
   *
   * Always pass `ctx.tx` from command handlers so the record is committed
   * atomically with the command's primary effects.
   */
  async upsertJobNotification(data: {
    userId: string;
    jobId: string;
    type: string;
    category: string;
    priority: string;
    title: string;
    body: string;
    deepLink?: any;
  }, tx?: any) {
    const notif = tx ? (tx as any).notification : this.notification;

    const existing = await notif.findFirst({
      where: {
        userId: data.userId,
        sourceType: 'job',
        sourceId: data.jobId,
        archivedAt: null,
      },
    });

    if (existing) {
      return notif.update({
        where: { id: existing.id },
        data: {
          type: data.type,
          category: data.category,
          priority: data.priority,
          title: data.title,
          body: data.body,
          deepLink: data.deepLink ?? existing.deepLink,
          readAt: null,
          dismissedAt: null,
        },
      });
    }

    const created = await notif.create({
      data: {
        userId: data.userId,
        type: data.type,
        category: data.category,
        priority: data.priority,
        title: data.title,
        body: data.body,
        deepLink: data.deepLink ?? {},
        meta: { count: 1 },
        groupKey: null,
        sourceType: 'job',
        sourceId: data.jobId,
      },
    });
    if (!tx) await this.pruneOld(data.userId);
    return created;
  }

  async updateBySource(data: {
    userId: string;
    sourceType: string;
    sourceId: string;
    originalType?: string;
    type: string;
    title: string;
    body: string;
    deepLink?: any;
    category?: string;
    priority?: string;
    markRead?: boolean;
  }) {
    const existing = await this.notification.findFirst({
      where: {
        userId: data.userId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        type: data.originalType || 'job_ready',
        archivedAt: null,
      },
    });

    const now = new Date();

    if (existing) {
      const updateData: any = {
        title: data.title,
        body: data.body,
        type: data.type,
        dismissedAt: null,
      };
      if (data.category) updateData.category = data.category;
      if (data.deepLink) updateData.deepLink = data.deepLink;
      if (data.priority) updateData.priority = data.priority;
      if (data.markRead) updateData.readAt = now;
      return this.notification.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    return this.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        category: data.category || 'general',
        priority: data.priority || 'normal',
        title: data.title,
        body: data.body,
        deepLink: data.deepLink || {},
        meta: { count: 1 },
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        readAt: data.markRead ? now : null,
      },
    });
  }

  async getNotifications(
    userId: string,
    options?: {
      category?: string;
      limit?: number;
      cursorCreatedAt?: string;
      cursorId?: string;
      includeArchived?: boolean;
    },
  ) {
    const limit = Math.min(options?.limit || 50, 100);
    const where: any = { userId };

    if (!options?.includeArchived) {
      where.archivedAt = null;
    }
    if (options?.category) {
      where.category = options.category;
    }

    if (options?.cursorCreatedAt && options?.cursorId) {
      where.OR = [
        { createdAt: { lt: new Date(options.cursorCreatedAt) } },
        {
          createdAt: new Date(options.cursorCreatedAt),
          id: { lt: options.cursorId },
        },
      ];
    }

    const items = await this.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    const unreadCount = await this.notification.count({
      where: { userId, readAt: null, archivedAt: null },
    });

    let nextCursor = null;
    if (hasMore && resultItems.length > 0) {
      const last = resultItems[resultItems.length - 1];
      nextCursor = { createdAt: last.createdAt.toISOString(), id: last.id };
    }

    return { items: resultItems, nextCursor, unreadCount };
  }

  async getUnreadCount(userId: string) {
    return this.notification.count({
      where: { userId, readAt: null, archivedAt: null },
    });
  }

  async markRead(userId: string, notificationIds: string[]) {
    return this.notification.updateMany({
      where: { id: { in: notificationIds }, userId },
      data: { readAt: new Date() },
    });
  }

  async markReadById(userId: string, notificationId: string) {
    return this.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markReadBySource(userId: string, sourceType: string, sourceId: string, tx?: any) {
    const notif = tx ? (tx as any).notification : this.notification;
    return notif.updateMany({
      where: { userId, sourceType, sourceId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async clearRead(userId: string) {
    return this.notification.updateMany({
      where: { userId, readAt: { not: null }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }

  async dismiss(userId: string, notificationId: string) {
    const now = new Date();
    return this.notification.updateMany({
      where: { id: notificationId, userId },
      data: { dismissedAt: now, readAt: now },
    });
  }

  async pruneOld(userId: string) {
    const count = await this.notification.count({ where: { userId } });
    if (count <= 500) return;

    const excess = count - 500;

    const readArchived = await this.notification.findMany({
      where: { userId, readAt: { not: null }, archivedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: excess,
      select: { id: true },
    });

    if (readArchived.length > 0) {
      await this.notification.deleteMany({
        where: { id: { in: readArchived.map((n: any) => n.id) } },
      });
    }

    const remaining = await this.notification.count({ where: { userId } });
    if (remaining <= 500) return;

    const stillExcess = remaining - 500;
    const readNotifications = await this.notification.findMany({
      where: { userId, readAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: stillExcess,
      select: { id: true },
    });

    if (readNotifications.length > 0) {
      await this.notification.deleteMany({
        where: { id: { in: readNotifications.map((n: any) => n.id) } },
      });
    }
  }
}
