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
import { validateEntityDefinitionTraitsShape } from '@derp/shared';

@Injectable()
export class AdminDraftService implements OnModuleInit {
  private readonly logger = new Logger(AdminDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly screensService: ScreensService,
  ) {}

  // ─── Boot-time recovery ──────────────────────────────────────────────────────
  //
  // DB-backed approvals are fully atomic (single $transaction), so they can never
  // get stuck in 'applying'. Only the gemPacks (Stripe) path uses the state
  // machine — if the server crashes between the Stripe call and the final DB update,
  // the draft is left in 'applying'. On restart we verify via Stripe and finalize.

  async onModuleInit() {
    // Ensure the partial unique index exists for pending drafts
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS content_drafts_pending_record_unique
        ON content_drafts (table_name, record_id)
        WHERE status = 'pending'
      `);
    } catch (err) {
      this.logger.warn(`Pending-draft unique index: ${(err as any)?.message}`);
    }

    // Recover drafts stuck in 'applying' (only gemPacks path uses this state)
    try {
      const stuck = await (this.prisma as any).contentDraft.findMany({
        where: { status: 'applying' },
      });
      if (stuck.length > 0) {
        this.logger.warn(`Recovering ${stuck.length} draft(s) stuck in 'applying'`);
        for (const draft of stuck) {
          const applied = await this.checkIfGemPackApplied(draft);
          if (applied) {
            this.logger.log(`Draft ${draft.id}: Stripe mutation confirmed → marking approved`);
            await (this.prisma as any).contentDraft.update({
              where: { id: draft.id },
              data: { status: 'approved' },
            });
          } else {
            this.logger.warn(`Draft ${draft.id}: mutation not confirmed → reverting to pending`);
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
      this.logger.error(`Boot recovery failed: ${(err as any)?.message}`);
    }
  }

  // Check whether the gemPack mutation was already applied (Stripe)
  private async checkIfGemPackApplied(draft: any): Promise<boolean> {
    if (draft.tableName !== 'gemPacks') return false;
    try {
      const live = await this.adminService.getAdminGemPack(draft.recordId).catch(() => null);
      if (!live) return false;
      // If all payload keys match the live record, mutation was applied
      const payload = (draft.payload ?? {}) as Record<string, any>;
      return Object.entries(payload).every(
        ([k, v]) => JSON.stringify(live[k]) === JSON.stringify(v),
      );
    } catch {
      return false;
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

  // ─── Record lookup helper ─────────────────────────────────────────────────

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

  // ─── Core CRUD ─────────────────────────────────────────────────────────────

  async createDraft(opts: {
    tableName: string;
    recordId: string;
    operation: 'create' | 'update' | 'delete';
    payload: any;
    authorId: string;
  }) {
    // Upsert own pending draft on same record
    const ownExisting = await (this.prisma as any).contentDraft.findFirst({
      where: {
        tableName: opts.tableName,
        recordId:  opts.recordId,
        status:    'pending',
        authorId:  opts.authorId,
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

    // Block if a different author's draft is already pending/applying
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

  // ─── Atomic mutation application (inside a Prisma $transaction) ────────────
  //
  // Called only for DB-backed tables. gemPacks (Stripe) has its own path.

  private async applyMutationInTx(tx: any, draft: any): Promise<void> {
    const { tableName, recordId, operation } = draft;
    const payload = (draft.payload ?? {}) as Record<string, any>;

    if (tableName === 'game-definitions') {
      if (operation === 'create') {
        await (tx as any).gameDefinition.create({
          data: {
            type:     payload.type,
            key:      payload.key,
            version:  payload.version,
            isActive: payload.isActive ?? false,
            startsAt: payload.startsAt ? new Date(payload.startsAt) : null,
            endsAt:   payload.endsAt   ? new Date(payload.endsAt)   : null,
            data:     payload.data,
          },
        });
      } else if (operation === 'update') {
        const updateData: any = {};
        if (payload.data     !== undefined) updateData.data     = payload.data;
        if (payload.isActive !== undefined) updateData.isActive = payload.isActive;
        if ('startsAt' in payload) updateData.startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
        if ('endsAt'   in payload) updateData.endsAt   = payload.endsAt   ? new Date(payload.endsAt)   : null;
        await (tx as any).gameDefinition.update({ where: { id: recordId }, data: updateData });
      } else if (operation === 'delete') {
        const existing = await (tx as any).gameDefinition.findUnique({ where: { id: recordId } });
        if (!existing) throw new NotFoundException(`GameDefinition ${recordId} not found`);
        const existingData = (existing.data ?? {}) as Record<string, any>;
        await (tx as any).gameDefinition.update({
          where: { id: recordId },
          data: { isActive: false, data: { ...existingData, status: 'archived' } },
        });
      }
    } else {
      // Table-specific pre-write validation
      if (tableName === 'entityDefinition' && 'traits' in payload) {
        const traitsError = validateEntityDefinitionTraitsShape(payload.traits);
        if (traitsError !== null) {
          throw new BadRequestException(`Invalid EntityDefinition traits: ${traitsError}`);
        }
      }

      // Generic path: tableName IS the Prisma camelCase model name
      const model = (tx as any)[tableName];
      if (!model) throw new BadRequestException(`Unknown table: ${tableName}`);

      if (operation === 'create') {
        await model.create({ data: payload });
      } else if (operation === 'update') {
        await model.update({ where: { id: recordId }, data: payload });
      } else if (operation === 'delete') {
        await model.delete({ where: { id: recordId } });
      }
    }
  }

  // ─── Approval — gemPacks (Stripe, 3-step state machine) ───────────────────
  //
  // Stripe API calls cannot participate in a Prisma DB transaction. We use:
  //   Step 1 (tx): pending → applying   (optimistic lock; crash here → still 'pending')
  //   Step 2:      Stripe API mutation  (crash here → 'applying'; boot recovery detects & finalizes)
  //   Step 3 (tx): applying → approved  (crash here → 'applying'; boot recovery confirms → approved)

  private async approveDraftViaStripe(
    draft:          any,
    id:             string,
    reviewerId:     string,
    reviewerRole:   string,
    reviewerScopes: string[],
  ) {
    // Scope check
    if (reviewerRole !== 'super_admin') {
      const group = TABLE_KEY_TO_GROUP['gemPacks'] ?? null;
      if (group && !reviewerScopes.includes(group)) {
        throw new ForbiddenException(`Content scope '${group}' is not in your allowed scopes`);
      }
    }

    // Step 1: pending → applying (using optimistic status filter to prevent races)
    const updated = await (this.prisma as any).contentDraft.updateMany({
      where: { id, status: 'pending' },
      data:  { status: 'applying', reviewerId },
    });
    if (updated.count === 0) {
      const current = await (this.prisma as any).contentDraft.findUnique({ where: { id } });
      throw new BadRequestException(`Draft is already ${current?.status ?? 'unknown'}`);
    }

    // Step 2: Stripe API mutation
    try {
      await this.adminService.updateAdminGemPack(draft.recordId, draft.payload as any);
    } catch (err: any) {
      this.logger.error(`GemPack draft ${id} Stripe mutation failed: ${err?.message}`);
      await (this.prisma as any).contentDraft.update({
        where: { id },
        data: {
          status:        'pending',
          reviewerId:    null,
          reviewComment: `Approval failed: ${err?.message ?? 'unknown error'}`,
        },
      });
      throw new BadRequestException(`Failed to apply gem pack draft: ${err?.message}`);
    }

    // Step 3: applying → approved + audit log (best-effort; boot recovery handles crashes here)
    const approved = await (this.prisma as any).contentDraft.update({
      where: { id },
      data:  { status: 'approved' },
      include: {
        author:   { select: { username: true } },
        reviewer: { select: { username: true } },
      },
    });
    try {
      await (this.prisma as any).adminAuditLog.create({
        data: {
          adminId:   reviewerId,
          action:    'draft_approve',
          tableName: draft.tableName,
          recordId:  draft.recordId,
          metadata:  { draftId: id, operation: draft.operation },
        },
      });
    } catch (auditErr: any) {
      this.logger.error(`Audit log failed for gemPack draft ${id}: ${auditErr?.message}`);
    }
    return approved;
  }

  // ─── Approval — DB-backed tables (fully atomic $transaction) ──────────────
  //
  // All three steps (validate, mutation, approved + audit log) happen in a single
  // Prisma $transaction. If any step fails the entire transaction rolls back and
  // the draft remains 'pending'. No intermediate state is visible externally.

  async approveDraft(
    id:             string,
    reviewerId:     string,
    reviewerRole:   string,
    reviewerScopes: string[],
  ) {
    // Peek at tableName before entering the transaction (for routing decision only)
    const peek = await (this.prisma as any).contentDraft.findUnique({
      where: { id },
      select: { tableName: true, status: true },
    });
    if (!peek) throw new NotFoundException(`Draft ${id} not found`);
    if (peek.status !== 'pending') throw new BadRequestException(`Draft is already ${peek.status}`);

    if (peek.tableName === 'gemPacks') {
      const draft = await (this.prisma as any).contentDraft.findUnique({ where: { id } });
      return this.approveDraftViaStripe(draft, id, reviewerId, reviewerRole, reviewerScopes);
    }

    // DB-backed: single atomic transaction — validate + mutation + approved + audit log
    return this.prisma.$transaction(async (tx: any) => {
      // Re-read and lock inside transaction (guards against concurrent approval attempts)
      const draft = await tx.contentDraft.findUnique({
        where: { id },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });
      if (!draft) throw new NotFoundException(`Draft ${id} not found`);
      if (draft.status !== 'pending') throw new BadRequestException(`Draft is already ${draft.status}`);

      if (reviewerRole !== 'super_admin') {
        const group = TABLE_KEY_TO_GROUP[draft.tableName] ?? null;
        if (group && !reviewerScopes.includes(group)) {
          throw new ForbiddenException(`Content scope '${group}' is not in your allowed scopes`);
        }
      }

      // Apply the live mutation
      await this.applyMutationInTx(tx, draft);

      // Mark approved (same transaction — atomically guaranteed)
      const approved = await tx.contentDraft.update({
        where: { id },
        data: { status: 'approved', reviewerId },
        include: {
          author:   { select: { username: true } },
          reviewer: { select: { username: true } },
        },
      });

      // Audit log (same transaction — atomically guaranteed)
      await tx.adminAuditLog.create({
        data: {
          adminId:   reviewerId,
          action:    'draft_approve',
          tableName: draft.tableName,
          recordId:  draft.recordId,
          metadata:  { draftId: id, operation: draft.operation },
        },
      });

      this.logger.log(
        `Draft ${id} approved by ${reviewerId}: ${draft.operation} on ${draft.tableName}/${draft.recordId}`,
      );
      return approved;
    });
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

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
