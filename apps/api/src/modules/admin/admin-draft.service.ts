import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from './admin.service';
import { TABLE_KEY_TO_GROUP } from './admin-permissions';

@Injectable()
export class AdminDraftService implements OnModuleInit {
  private readonly logger = new Logger(AdminDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  async onModuleInit() {
    // Enforce DB-level uniqueness: only one pending draft per (tableName, recordId)
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS content_drafts_pending_record_unique
        ON content_drafts (table_name, record_id)
        WHERE status = 'pending'
      `);
    } catch (err) {
      this.logger.warn(`Pending-draft unique index already exists or could not be created: ${(err as any)?.message}`);
    }
  }

  // ─── Diff utility ──────────────────────────────────────────────────────────

  computeDiff(
    live: Record<string, any> | null,
    payload: Record<string, any>,
  ): Record<string, { old: any; new: any }> {
    const SKIP = new Set(['createdAt', 'updatedAt']);
    const diff: Record<string, { old: any; new: any }> = {};
    const allKeys = new Set([...Object.keys(live ?? {}), ...Object.keys(payload)]);
    for (const key of allKeys) {
      if (SKIP.has(key)) continue;
      const oldVal = live?.[key] ?? undefined;
      const newVal = payload[key] ?? undefined;
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = { old: oldVal, new: newVal };
      }
    }
    return diff;
  }

  // ─── Core CRUD ─────────────────────────────────────────────────────────────

  async createDraft(opts: {
    tableName: string;
    recordId: string;
    operation: 'create' | 'update' | 'delete';
    payload: any;
    authorId: string;
  }) {
    // Check for an existing pending draft by THIS author on this record
    const ownExisting = await (this.prisma as any).contentDraft.findFirst({
      where: {
        tableName: opts.tableName,
        recordId: opts.recordId,
        status: 'pending',
        authorId: opts.authorId,
      },
    });

    if (ownExisting) {
      // Update the author's own pending draft
      return (this.prisma as any).contentDraft.update({
        where: { id: ownExisting.id },
        data: {
          operation: opts.operation,
          payload: opts.payload,
          updatedAt: new Date(),
        },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
    }

    // Check if another author already has a pending draft for this record
    const conflicting = await (this.prisma as any).contentDraft.findFirst({
      where: {
        tableName:  opts.tableName,
        recordId:   opts.recordId,
        status:     'pending',
      },
    });
    if (conflicting) {
      throw new ConflictException(
        `Record "${opts.recordId}" in "${opts.tableName}" already has a pending draft from another author. Wait for it to be reviewed first.`,
      );
    }

    return (this.prisma as any).contentDraft.create({
      data: {
        tableName:  opts.tableName,
        recordId:   opts.recordId,
        operation:  opts.operation,
        payload:    opts.payload,
        status:     'pending',
        authorId:   opts.authorId,
      },
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });
  }

  async listDrafts(opts: {
    status?:    string;
    tableName?: string;
    recordId?:  string;
    authorId?:  string;
    limit?:     number;
    offset?:    number;
  } = {}) {
    const where: any = {};
    if (opts.status)    where.status    = opts.status;
    if (opts.tableName) where.tableName = opts.tableName;
    if (opts.recordId)  where.recordId  = opts.recordId;
    if (opts.authorId)  where.authorId  = opts.authorId;

    return (this.prisma as any).contentDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 100,
      skip:    opts.offset ?? 0,
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

    const diff = this.computeDiff(liveRecord, draft.payload as Record<string, any>);
    return { ...draft, liveRecord, diff };
  }

  // ─── Approval (atomic via transaction + compensation) ──────────────────────

  async approveDraft(
    id:             string,
    reviewerId:     string,
    reviewerRole:   string,
    reviewerScopes: string[],
  ) {
    // Atomically read the draft and mark it as 'approved' inside a transaction.
    // This prevents double-approval races. If the subsequent live mutation fails
    // we compensate by reverting the draft status back to 'pending'.
    const draft = await (this.prisma as any).$transaction(async (tx: any) => {
      const d = await tx.contentDraft.findUnique({
        where: { id },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
      if (!d) throw new NotFoundException(`Draft ${id} not found`);
      if (d.status !== 'pending') throw new BadRequestException(`Draft is already ${d.status}`);

      if (reviewerRole !== 'super_admin') {
        const group = TABLE_KEY_TO_GROUP[d.tableName] ?? null;
        if (group && !reviewerScopes.includes(group)) {
          throw new ForbiddenException(`Content scope '${group}' is not in your allowed scopes`);
        }
      }

      // Atomically transition to 'approved' (prevents parallel approve of same draft)
      return tx.contentDraft.update({
        where: { id },
        data: { status: 'approved', reviewerId },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
    });

    // Apply the live mutation outside the transaction
    try {
      if (draft.operation === 'create') {
        await this.adminService.createRecord(draft.tableName, { ...(draft.payload as any) });
      } else if (draft.operation === 'update') {
        await this.adminService.updateRecord(draft.tableName, draft.recordId, { ...(draft.payload as any) });
      } else if (draft.operation === 'delete') {
        await this.adminService.deleteRecord(draft.tableName, draft.recordId);
      }
    } catch (mutationErr: any) {
      // Compensate: revert draft back to pending so reviewer can retry or reject
      this.logger.error(
        `Draft ${id} mutation failed during approval (reverting to pending): ${mutationErr?.message}`,
      );
      try {
        await (this.prisma as any).contentDraft.update({
          where: { id },
          data: {
            status:        'pending',
            reviewerId:    null,
            reviewComment: `Approval failed: ${mutationErr?.message ?? 'unknown error'}`,
          },
        });
      } catch (revertErr: any) {
        this.logger.error(`Could not revert draft ${id} status: ${revertErr?.message}`);
      }
      throw new BadRequestException(`Failed to apply draft: ${mutationErr?.message}`);
    }

    this.logger.log(
      `Draft ${id} approved by ${reviewerId}: ${draft.operation} on ${draft.tableName}/${draft.recordId}`,
    );
    return draft;
  }

  async rejectDraft(
    id:             string,
    reviewerId:     string,
    reviewerRole:   string,
    reviewerScopes: string[],
    reviewComment?: string,
  ) {
    const draft = await (this.prisma as any).contentDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    if (draft.status !== 'pending') throw new BadRequestException(`Draft is already ${draft.status}`);

    if (reviewerRole !== 'super_admin') {
      const group = TABLE_KEY_TO_GROUP[draft.tableName] ?? null;
      if (group && !reviewerScopes.includes(group)) {
        throw new ForbiddenException(`Content scope '${group}' is not in your allowed scopes`);
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
