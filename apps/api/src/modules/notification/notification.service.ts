import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatLevelUpBody } from '../entity/entity-generator.util';

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
