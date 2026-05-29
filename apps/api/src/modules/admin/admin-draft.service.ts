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
import { ScreensService } from '../screens/screens.service';
import { TABLE_KEY_TO_GROUP } from './admin-permissions';

@Injectable()
export class AdminDraftService implements OnModuleInit {
  private readonly logger = new Logger(AdminDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly screensService: ScreensService,
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
      this.logger.warn(`Pending-draft unique index: ${(err as any)?.message}`);
    }

    // Boot-time recovery: verify and finalize drafts stuck in 'applying' state
    // (process crashed during a previous approval attempt)
    try {
      const stuck = await (this.prisma as any).contentDraft.findMany({
        where: { status: 'applying' },
      });
      if (stuck.length > 0) {
        this.logger.warn(`Verifying ${stuck.length} draft(s) stuck in 'applying' state`);
        for (const draft of stuck) {
          const applied = await this.checkIfAlreadyApplied(draft);
          if (applied) {
            // Mutation landed before the crash — finalize as approved
            this.logger.log(`Draft ${draft.id} confirmed applied → marking approved`);
            await (this.prisma as any).contentDraft.update({
              where: { id: draft.id },
              data: { status: 'approved' },
            });
          } else {
            // Mutation did not land — revert so reviewer can retry
            this.logger.warn(`Draft ${draft.id} not applied → reverting to pending`);
            await (this.prisma as any).contentDraft.update({
              where: { id: draft.id },
              data: {
                status: 'pending',
                reviewerId: null,
                reviewComment: 'Recovered: server restarted during approval — please re-review',
              },
            });
          }
        }
      }
    } catch (err) {
      this.logger.error(`Failed to recover applying drafts on boot: ${(err as any)?.message}`);
    }
  }

  // ─── Recovery helper: check if mutation already landed ─────────────────────

  private async checkIfAlreadyApplied(draft: any): Promise<boolean> {
    try {
      if (draft.operation === 'create') {
        // If the record now exists, creation already happened
        const existing = await this.tryGetRecord(draft.tableName, draft.recordId);
        return existing !== null;
      } else if (draft.operation === 'delete') {
        // If the record is gone, deletion already happened
        const existing = await this.tryGetRecord(draft.tableName, draft.recordId);
        return existing === null;
      } else if (draft.operation === 'update') {
        // Compare live record to payload — if they match (all payload keys), mutation applied
        const live = await this.tryGetRecord(draft.tableName, draft.recordId);
        if (!live) return false;
        const payload = (draft.payload ?? {}) as Record<string, any>;
        return Object.entries(payload).every(([k, v]) =>
          JSON.stringify(live[k]) === JSON.stringify(v),
        );
      }
    } catch {
      // If we can't determine, be conservative and revert
    }
    return false;
  }

  private async tryGetRecord(tableName: string, recordId: string): Promise<any | null> {
    try {
      if (tableName === 'game-definitions') {
        return await this.screensService.getById(recordId).catch(() => null);
      }
      if (tableName === 'gemPacks') {
        return await this.adminService.getAdminGemPack(recordId).catch(() => null);
      }
      return await this.adminService.getRecord(tableName, recordId).catch(() => null);
    } catch {
      return null;
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
      return (this.prisma as any).contentDraft.update({
        where: { id: ownExisting.id },
        data: { operation: opts.operation, payload: opts.payload, updatedAt: new Date() },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
    }

    // Block if another author's draft is already pending or in-flight
    const conflicting = await (this.prisma as any).contentDraft.findFirst({
      where: {
        tableName: opts.tableName,
        recordId:  opts.recordId,
        status:    { in: ['pending', 'applying'] },
      },
    });
    if (conflicting) {
      throw new ConflictException(
        `Record "${opts.recordId}" in "${opts.tableName}" already has a pending draft from another author. Wait for it to be reviewed first.`,
      );
    }

    return (this.prisma as any).contentDraft.create({
      data: {
        tableName: opts.tableName,
        recordId:  opts.recordId,
        operation: opts.operation,
        payload:   opts.payload,
        status:    'pending',
        authorId:  opts.authorId,
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
      liveRecord = await this.tryGetRecord(draft.tableName, draft.recordId);
    }

    const diff = this.computeDiff(liveRecord, draft.payload as Record<string, any>);
    return { ...draft, liveRecord, diff };
  }

  // ─── Idempotent mutation apply ──────────────────────────────────────────────
  //
  // Routes mutations to the correct service (custom for gemPacks / game-definitions,
  // generic adminService for all other tables). Idempotency guards:
  //   - create: if the record already exists, treat as success (prior crash recovery)
  //   - delete: if the record is already gone, treat as success
  //   - update: propagate errors normally (update is safe to re-apply)

  private async applyMutation(draft: any): Promise<void> {
    const { tableName, recordId, operation } = draft;
    const payload = (draft.payload ?? {}) as Record<string, any>;

    try {
      if (tableName === 'game-definitions') {
        if (operation === 'create') {
          await this.screensService.create(payload as any);
        } else if (operation === 'update') {
          await this.screensService.update(recordId, payload as any);
        } else if (operation === 'delete') {
          await this.screensService.archive(recordId);
        }
      } else if (tableName === 'gemPacks') {
        if (operation === 'update') {
          await this.adminService.updateAdminGemPack(recordId, payload as any);
        } else {
          throw new BadRequestException(`GemPacks only supports 'update' drafts`);
        }
      } else {
        if (operation === 'create') {
          await this.adminService.createRecord(tableName, payload);
        } else if (operation === 'update') {
          await this.adminService.updateRecord(tableName, recordId, payload);
        } else if (operation === 'delete') {
          await this.adminService.deleteRecord(tableName, recordId);
        }
      }
    } catch (err: any) {
      // Idempotency: if mutation already landed from a prior attempt, treat as success
      if (operation === 'create') {
        const exists = await this.tryGetRecord(tableName, recordId);
        if (exists) {
          this.logger.warn(`Draft ${draft.id}: create already applied (idempotent) — treating as success`);
          return;
        }
      }
      if (operation === 'delete') {
        const exists = await this.tryGetRecord(tableName, recordId);
        if (!exists) {
          this.logger.warn(`Draft ${draft.id}: delete already applied (idempotent) — treating as success`);
          return;
        }
      }
      throw err;
    }
  }

  // ─── Approval (3-step state machine: pending → applying → approved) ─────────
  //
  // Step 1 (tx):  pending → applying   (atomic; prevents race; crash here → still 'pending')
  // Step 2:       applyMutation        (crash here → 'applying'; boot recovery verifies & finalizes)
  // Step 3 (tx):  applying → approved  (crash here → 'applying'; boot recovery detects applied → approves)

  async approveDraft(
    id:             string,
    reviewerId:     string,
    reviewerRole:   string,
    reviewerScopes: string[],
  ) {
    // Step 1: Atomically transition pending → applying
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

      return tx.contentDraft.update({
        where: { id },
        data: { status: 'applying', reviewerId },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
    });

    // Step 2: Apply the live mutation (idempotent-aware)
    try {
      await this.applyMutation(draft);
    } catch (mutationErr: any) {
      this.logger.error(
        `Draft ${id} mutation failed (reverting to pending): ${mutationErr?.message}`,
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
        this.logger.error(`Could not revert draft ${id} to pending: ${revertErr?.message}`);
      }
      throw new BadRequestException(`Failed to apply draft: ${mutationErr?.message}`);
    }

    // Step 3: Transition applying → approved
    const approved = await (this.prisma as any).contentDraft.update({
      where: { id },
      data: { status: 'approved' },
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
