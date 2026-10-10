import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogEntry {
  id: string;
  adminId: string | null;
  adminUsername?: string;
  action: string;
  tableName: string | null;
  recordId: string | null;
  diff: any;
  metadata: any;
  createdAt: Date;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(opts: {
    adminId: string;
    action: string;
    tableName?: string;
    recordId?: string;
    diff?: any;
    metadata?: any;
  }): Promise<void> {
    const isBootstrap = opts.adminId === '__bootstrap__';
    if (isBootstrap) {
      this.logger.debug(`[AUDIT bootstrap] ${opts.action} ${opts.tableName ?? ''} ${opts.recordId ?? ''}`);
    }

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: isBootstrap ? null : opts.adminId,
          action: opts.action,
          tableName: opts.tableName ?? null,
          recordId: opts.recordId ?? null,
          diff: opts.diff ?? undefined,
          metadata: isBootstrap
            ? { ...(opts.metadata ?? {}), _bootstrap: true }
            : (opts.metadata ?? {}),
        },
      });
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  async list(opts: {
    adminId?: string;
    action?: string;
    tableName?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const where: any = {};
    if (opts.adminId) where.adminId = opts.adminId;
    if (opts.action) where.action = { contains: opts.action, mode: 'insensitive' };
    if (opts.tableName) where.tableName = opts.tableName;

    const rows = await this.prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
      include: { admin: { select: { username: true } } },
    });

    return rows.map((r) => ({
      id: r.id.toString(),
      adminId: r.adminId,
      adminUsername: (r as any).admin?.username,
      action: r.action,
      tableName: r.tableName,
      recordId: r.recordId,
      diff: r.diff,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }));
  }
}
