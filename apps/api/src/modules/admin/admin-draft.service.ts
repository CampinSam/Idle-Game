import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from './admin.service';
import { TABLE_KEY_TO_GROUP } from './admin-permissions';

@Injectable()
export class AdminDraftService {
  private readonly logger = new Logger(AdminDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  async createDraft(opts: {
    tableName: string;
    recordId: string;
    operation: 'create' | 'update' | 'delete';
    payload: any;
    authorId: string;
  }) {
    const existing = await (this.prisma as any).contentDraft.findFirst({
      where: {
        tableName: opts.tableName,
        recordId: opts.recordId,
        status: 'pending',
      },
    });

    if (existing) {
      return (this.prisma as any).contentDraft.update({
        where: { id: existing.id },
        data: {
          operation: opts.operation,
          payload: opts.payload,
          updatedAt: new Date(),
        },
        include: {
          author: { select: { username: true } },
        },
      });
    }

    return (this.prisma as any).contentDraft.create({
      data: {
        tableName: opts.tableName,
        recordId: opts.recordId,
        operation: opts.operation,
        payload: opts.payload,
        status: 'pending',
        authorId: opts.authorId,
      },
      include: {
        author: { select: { username: true } },
      },
    });
  }

  async listDrafts(opts: {
    status?: string;
    tableName?: string;
    recordId?: string;
    authorId?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.tableName) where.tableName = opts.tableName;
    if (opts.recordId) where.recordId = opts.recordId;
    if (opts.authorId) where.authorId = opts.authorId;

    return (this.prisma as any).contentDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });
  }

  async getDraft(id: string) {
    const draft = await (this.prisma as any).contentDraft.findUnique({
      where: { id },
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);

    let liveRecord: any = null;
    if (draft.operation !== 'create') {
      try {
        liveRecord = await this.adminService.getRecord(draft.tableName, draft.recordId);
      } catch {
        liveRecord = null;
      }
    }

    return { ...draft, liveRecord };
  }

  async approveDraft(
    id: string,
    reviewerId: string,
    reviewerRole: string,
    reviewerScopes: string[],
  ) {
    const draft = await (this.prisma as any).contentDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    if (draft.status !== 'pending') {
      throw new BadRequestException(`Draft is already ${draft.status}`);
    }

    if (reviewerRole !== 'super_admin') {
      const group = TABLE_KEY_TO_GROUP[draft.tableName] ?? null;
      if (group && !reviewerScopes.includes(group)) {
        throw new ForbiddenException(
          `Content scope '${group}' is not in your allowed scopes`,
        );
      }
    }

    if (draft.operation === 'create') {
      await this.adminService.createRecord(draft.tableName, { ...(draft.payload as any) });
    } else if (draft.operation === 'update') {
      await this.adminService.updateRecord(draft.tableName, draft.recordId, { ...(draft.payload as any) });
    } else if (draft.operation === 'delete') {
      await this.adminService.deleteRecord(draft.tableName, draft.recordId);
    }

    const approved = await (this.prisma as any).contentDraft.update({
      where: { id },
      data: { status: 'approved', reviewerId },
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });

    this.logger.log(
      `Draft ${id} approved by ${reviewerId}: ${draft.operation} on ${draft.tableName}/${draft.recordId}`,
    );

    return approved;
  }

  async rejectDraft(
    id: string,
    reviewerId: string,
    reviewerRole: string,
    reviewerScopes: string[],
    reviewComment?: string,
  ) {
    const draft = await (this.prisma as any).contentDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    if (draft.status !== 'pending') {
      throw new BadRequestException(`Draft is already ${draft.status}`);
    }

    if (reviewerRole !== 'super_admin') {
      const group = TABLE_KEY_TO_GROUP[draft.tableName] ?? null;
      if (group && !reviewerScopes.includes(group)) {
        throw new ForbiddenException(
          `Content scope '${group}' is not in your allowed scopes`,
        );
      }
    }

    return (this.prisma as any).contentDraft.update({
      where: { id },
      data: { status: 'rejected', reviewerId, reviewComment: reviewComment ?? null },
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });
  }
}
