import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  private get notification() {
    return (this.prisma as any).notification;
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
  }) {
    if (data.groupKey) {
      const cutoff = new Date(Date.now() - 90 * 1000);
      const existing = await this.notification.findFirst({
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
        return this.notification.update({
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
      const existing = await this.notification.findFirst({
        where: {
          userId: data.userId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          type: data.type,
        },
      });
      if (existing) return existing;

      try {
        const created = await this.notification.create({ data: payload });
        await this.pruneOld(data.userId);
        return created;
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return await this.notification.findFirst({
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

    const created = await this.notification.create({ data: payload });
    await this.pruneOld(data.userId);
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
