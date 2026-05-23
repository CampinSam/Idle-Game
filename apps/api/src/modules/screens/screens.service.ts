import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ScreenCompositionDefinition,
  ScreenResolutionContext,
  VisibilityRuleGroup,
  VisibilityRule,
  PlatformKey,
  AudienceRule,
} from '@derp/shared';

export interface ResolvedScreenDefinition {
  id: string;
  type: string;
  key: string;
  version: number;
  isActive: boolean;
  data: Record<string, any>;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ScreensService {
  private readonly logger = new Logger(ScreensService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public resolution (full pipeline) ────────────────────────────────────

  async resolveScreen(
    screenKey: string,
    context: ScreenResolutionContext,
  ): Promise<ResolvedScreenDefinition> {
    const now = new Date();

    const row = await (this.prisma as any).gameDefinition.findFirst({
      where: {
        type: 'screen_composition',
        key: screenKey,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!row) {
      throw new NotFoundException(
        `No active screen composition found for key "${screenKey}"`,
      );
    }

    // 1. Row-level time window
    if (row.startsAt && new Date(row.startsAt) > now) {
      throw new NotFoundException(`Screen "${screenKey}" is not yet available`);
    }
    if (row.endsAt && new Date(row.endsAt) <= now) {
      throw new NotFoundException(`Screen "${screenKey}" is no longer available`);
    }

    const def = row.data as ScreenCompositionDefinition;

    // 2. Definition-level availability (startsAt/endsAt + seasonIds)
    if (def.availability) {
      const avail = def.availability;
      if (avail.startsAt && new Date(avail.startsAt) > now) {
        throw new NotFoundException(`Screen "${screenKey}" is not yet available`);
      }
      if (avail.endsAt && new Date(avail.endsAt) <= now) {
        throw new NotFoundException(`Screen "${screenKey}" is no longer available`);
      }
      if (avail.seasonIds?.length) {
        const activeSeason = await (this.prisma as any).season.findFirst({
          where: {
            status: 'active',
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          select: { id: true },
          orderBy: { endsAt: 'asc' },
        });
        if (!activeSeason || !avail.seasonIds.includes(activeSeason.id)) {
          throw new NotFoundException(
            `Screen "${screenKey}" is not available in the current season`,
          );
        }
      }
    }

    // 3. Platform targeting
    if (def.platform && context.platform) {
      const { include, exclude } = def.platform;
      if (include?.length && !include.includes(context.platform)) {
        throw new NotFoundException(
          `Screen "${screenKey}" is not available on platform "${context.platform}"`,
        );
      }
      if (exclude?.length && exclude.includes(context.platform)) {
        throw new NotFoundException(
          `Screen "${screenKey}" is not available on platform "${context.platform}"`,
        );
      }
    }

    // 4. Audience checks (fail-safe for anonymous callers)
    if (def.audience) {
      this.evaluateAudience(screenKey, def.audience, context);
    }

    // 5. Filter sections by visibility and sort by priority
    const visCtx = this.buildVisibilityContext(context);
    const filteredSections = (def.sections ?? [])
      .filter(s => this.evaluateVisibilityGroup(s.visibility, visCtx))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    return this.serialize({
      ...row,
      data: { ...def, sections: filteredSections },
    });
  }

  // ─── Admin preview (no filtering, raw data) ───────────────────────────────

  async resolvePreview(
    screenKey: string,
    version: number,
  ): Promise<ResolvedScreenDefinition> {
    const row = await (this.prisma as any).gameDefinition.findFirst({
      where: { type: 'screen_composition', key: screenKey, version },
    });

    if (!row) {
      throw new NotFoundException(
        `No screen composition found for key "${screenKey}" version ${version}`,
      );
    }

    return this.serialize(row);
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  async listByKey(screenKey?: string): Promise<ResolvedScreenDefinition[]> {
    const rows = await (this.prisma as any).gameDefinition.findMany({
      where: {
        type: 'screen_composition',
        ...(screenKey ? { key: screenKey } : {}),
      },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r: any) => this.serialize(r));
  }

  async getById(id: string): Promise<ResolvedScreenDefinition> {
    const row = await (this.prisma as any).gameDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`GameDefinition ${id} not found`);
    return this.serialize(row);
  }

  async create(data: {
    type: string;
    key: string;
    version: number;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    data: Record<string, any>;
  }): Promise<ResolvedScreenDefinition> {
    const row = await (this.prisma as any).gameDefinition.create({
      data: {
        type: data.type,
        key: data.key,
        version: data.version,
        isActive: data.isActive ?? false,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        data: data.data,
      },
    });
    return this.serialize(row);
  }

  async update(
    id: string,
    data: Partial<{
      isActive: boolean;
      startsAt: string | null;
      endsAt: string | null;
      data: Record<string, any>;
    }>,
  ): Promise<ResolvedScreenDefinition> {
    const existing = await (this.prisma as any).gameDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`GameDefinition ${id} not found`);

    const updateData: any = {};
    if (data.data !== undefined) updateData.data = data.data;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if ('startsAt' in data) updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    if ('endsAt' in data) updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;

    const row = await (this.prisma as any).gameDefinition.update({
      where: { id },
      data: updateData,
    });
    return this.serialize(row);
  }

  async archive(id: string): Promise<ResolvedScreenDefinition> {
    const existing = await (this.prisma as any).gameDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`GameDefinition ${id} not found`);

    const existingData = (existing.data ?? {}) as Record<string, any>;
    const row = await (this.prisma as any).gameDefinition.update({
      where: { id },
      data: {
        isActive: false,
        data: { ...existingData, status: 'archived' },
      },
    });
    return this.serialize(row);
  }

  // ─── Publish / rollback (atomic) ──────────────────────────────────────────

  async publish(screenKey: string, version: number): Promise<ResolvedScreenDefinition> {
    const target = await (this.prisma as any).gameDefinition.findFirst({
      where: { key: screenKey, version },
    });

    if (!target) {
      throw new NotFoundException(
        `No game definition found for key "${screenKey}" version ${version}`,
      );
    }

    const [, updated] = await (this.prisma as any).$transaction([
      (this.prisma as any).gameDefinition.updateMany({
        where: { type: target.type, key: screenKey, isActive: true },
        data: { isActive: false },
      }),
      (this.prisma as any).gameDefinition.update({
        where: { id: target.id },
        data: {
          isActive: true,
          data: { ...(target.data ?? {}), status: 'active' },
        },
      }),
    ]);

    this.logger.log(`Published game definition type="${target.type}" key="${screenKey}" version=${version}`);

    return this.serialize(updated);
  }

  async rollback(screenKey: string, version: number): Promise<ResolvedScreenDefinition> {
    return this.publish(screenKey, version);
  }

  // ─── Audience evaluation ─────────────────────────────────────────────────

  private evaluateAudience(
    screenKey: string,
    aud: AudienceRule,
    context: ScreenResolutionContext,
  ): void {
    if (!context.user) {
      // Fail-safe: deny anonymous callers if any auth-required constraint is present
      const requiresAuth =
        (aud.minKeeperLevel !== undefined && aud.minKeeperLevel > 0) ||
        (aud.walletStatus !== undefined && aud.walletStatus !== 'any') ||
        (aud.nftStatus !== undefined && aud.nftStatus !== 'any') ||
        (aud.requiredFlags !== undefined && aud.requiredFlags.length > 0) ||
        (aud.includeUserSegments !== undefined &&
          aud.includeUserSegments.length > 0 &&
          !aud.includeUserSegments.includes('all')) ||
        (aud.excludeUserSegments !== undefined &&
          aud.excludeUserSegments.includes('all'));

      if (requiresAuth) {
        throw new NotFoundException(
          `Screen "${screenKey}" requires authentication`,
        );
      }
      return;
    }

    const user = context.user;

    if (aud.minKeeperLevel !== undefined && user.keeperLevel < aud.minKeeperLevel) {
      throw new NotFoundException(
        `Screen "${screenKey}" requires Keeper Level ${aud.minKeeperLevel}`,
      );
    }
    if (
      aud.maxKeeperLevel !== null &&
      aud.maxKeeperLevel !== undefined &&
      user.keeperLevel > aud.maxKeeperLevel
    ) {
      throw new NotFoundException(
        `Screen "${screenKey}" is not available at your Keeper Level`,
      );
    }
    if (aud.walletStatus === 'connected' && user.walletCount === 0) {
      throw new NotFoundException(`Screen "${screenKey}" requires a connected wallet`);
    }
    if (aud.walletStatus === 'not_connected' && user.walletCount > 0) {
      throw new NotFoundException(
        `Screen "${screenKey}" is not available with a connected wallet`,
      );
    }
  }

  // ─── Visibility evaluator ─────────────────────────────────────────────────

  private buildVisibilityContext(ctx: ScreenResolutionContext): Record<string, unknown> {
    return {
      user: ctx.user
        ? { keeperLevel: ctx.user.keeperLevel, id: ctx.user.id }
        : {},
      wallet: { isConnected: (ctx.user?.walletCount ?? 0) > 0 },
      flags: {},
      platform: ctx.platform ?? 'web',
      local: {},
    };
  }

  private evaluateVisibilityGroup(
    group: VisibilityRuleGroup | null | undefined,
    ctx: Record<string, unknown>,
  ): boolean {
    if (!group) return true;

    const { all, any, none } = group;

    if (all?.length && !all.every(r => this.evaluateVisibilityRule(r, ctx))) return false;
    if (any?.length && !any.some(r => this.evaluateVisibilityRule(r, ctx))) return false;
    if (none?.length && none.some(r => this.evaluateVisibilityRule(r, ctx))) return false;

    return true;
  }

  private evaluateVisibilityRule(
    rule: VisibilityRule,
    ctx: Record<string, unknown>,
  ): boolean {
    const val = this.resolvePath(rule.path, ctx);
    const { operator, value } = rule;

    switch (operator) {
      case 'equals': return val === value;
      case 'not_equals': return val !== value;
      case 'greater_than': return typeof val === 'number' && val > (value as number);
      case 'greater_than_or_equal': return typeof val === 'number' && val >= (value as number);
      case 'less_than': return typeof val === 'number' && val < (value as number);
      case 'less_than_or_equal': return typeof val === 'number' && val <= (value as number);
      case 'includes': return Array.isArray(val) && val.includes(value);
      case 'not_includes': return Array.isArray(val) && !val.includes(value);
      case 'exists': return val !== undefined && val !== null;
      case 'not_exists': return val === undefined || val === null;
      case 'in': return Array.isArray(value) && (value as unknown[]).includes(val);
      case 'not_in': return Array.isArray(value) && !(value as unknown[]).includes(val);
      default: return true;
    }
  }

  private resolvePath(path: string, ctx: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = ctx;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  // ─── Optional user context loader ─────────────────────────────────────────

  async loadUserContext(userId: string): Promise<ScreenResolutionContext['user'] | undefined> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, keeperLevel: true },
      });
      if (!user) return undefined;
      const walletCount = await (this.prisma as any).linkedWallet.count({ where: { userId } });
      return { id: user.id, keeperLevel: user.keeperLevel ?? 0, walletCount };
    } catch (err) {
      this.logger.warn(
        `loadUserContext failed for userId=${userId}: ${(err as Error)?.message ?? err}`,
      );
      return undefined;
    }
  }

  // ─── Serializer ───────────────────────────────────────────────────────────

  private serialize(row: any): ResolvedScreenDefinition {
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      version: row.version,
      isActive: row.isActive,
      data: row.data ?? {},
      startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null,
      endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}
