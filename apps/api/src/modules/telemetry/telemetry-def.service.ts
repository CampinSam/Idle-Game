import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import { TelemetryService } from './telemetry.service';
import type { TelemetrySubscriber, TelemetryEvent } from './telemetry.service';
import type { TelemetrySubEventSpec, TelemetryDefDto, TelemetryDefWithCountsDto } from '@derp/shared';

interface CachedDef {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  startDate: Date | null;
  endDate: Date | null;
  subEvents: TelemetrySubEventSpec[];
  createdAt: Date;
  updatedAt: Date;
}

function serializeCount(count: bigint): string {
  return count.toString();
}

@Injectable()
export class TelemetryDefService implements OnModuleInit, TelemetrySubscriber {
  private readonly logger = new Logger(TelemetryDefService.name);
  private cache: CachedDef[] = [];
  private cacheRefreshedAt = 0;
  private readonly CACHE_TTL_MS = 60_000;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly selectionResolver: SelectionResolverService,
    private readonly telemetryService: TelemetryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.telemetryService.registerSubscriber(this);
    await this.refreshCache();
    this.scheduleRefresh();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private scheduleRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshCache();
      } catch (err) {
        this.logger.warn(`TelemetryDef cache refresh failed: ${err}`);
      }
    }, this.CACHE_TTL_MS);
  }

  async refreshCache(): Promise<void> {
    const rows = await (this.prisma as any).telemetryDef.findMany({
      where: { enabled: true },
    });
    this.cache = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      startDate: r.startDate,
      endDate: r.endDate,
      subEvents: Array.isArray(r.subEvents) ? (r.subEvents as TelemetrySubEventSpec[]) : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    this.cacheRefreshedAt = Date.now();
    this.logger.debug(`TelemetryDef cache loaded: ${this.cache.length} def(s)`);
  }

  private getActiveDefs(now: Date): CachedDef[] {
    return this.cache.filter(d => {
      if (!d.enabled) return false;
      if (d.startDate && now < d.startDate) return false;
      if (d.endDate && now > d.endDate) return false;
      return true;
    });
  }

  async processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void> {
    const selectionContext = event.selectionContext;
    if (!selectionContext) return;

    const now = new Date();
    const activeDefs = this.getActiveDefs(now);
    if (activeDefs.length === 0) return;

    const db = tx || this.prisma;

    for (const def of activeDefs) {
      for (const subEvent of def.subEvents) {
        if (subEvent.eventType !== event.eventType) continue;
        if (!subEvent.key) continue;

        let matched = true;
        if (subEvent.filter) {
          try {
            matched = this.selectionResolver.evaluateAll(subEvent.filter, selectionContext);
          } catch (err) {
            this.logger.warn(
              `TelemetryDef ${def.id} subEvent "${subEvent.key}" filter eval error: ${err}`,
            );
            matched = false;
          }
        }

        if (!matched) continue;

        try {
          await (db as any).telemetryCount.upsert({
            where: {
              telemetryDefId_subEventKey: {
                telemetryDefId: def.id,
                subEventKey: subEvent.key,
              },
            },
            create: {
              telemetryDefId: def.id,
              subEventKey: subEvent.key,
              count: 1n,
              lastIncrementedAt: now,
            },
            update: {
              count: { increment: 1n },
              lastIncrementedAt: now,
            },
          });
        } catch (err) {
          this.logger.error(
            `Failed to increment TelemetryCount for def=${def.id} key=${subEvent.key}: ${err}`,
          );
        }
      }
    }
  }

  async listDefs(): Promise<TelemetryDefDto[]> {
    const rows = await (this.prisma as any).telemetryDef.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: any) => this.mapDef(r));
  }

  async getDefWithCounts(id: string): Promise<TelemetryDefWithCountsDto> {
    const def = await (this.prisma as any).telemetryDef.findUnique({
      where: { id },
      include: { counts: true },
    });
    if (!def) throw new NotFoundException(`TelemetryDef ${id} not found`);
    return {
      ...this.mapDef(def),
      counts: (def.counts ?? []).map((c: any) => ({
        subEventKey: c.subEventKey,
        count: serializeCount(c.count),
        lastIncrementedAt: c.lastIncrementedAt.toISOString(),
      })),
    };
  }

  async createDef(data: Partial<TelemetryDefDto>): Promise<TelemetryDefDto> {
    const created = await (this.prisma as any).telemetryDef.create({
      data: {
        name: data.name ?? 'Unnamed',
        description: data.description ?? null,
        enabled: data.enabled ?? true,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        subEvents: data.subEvents ?? [],
      },
    });
    await this.refreshCache();
    return this.mapDef(created);
  }

  async updateDef(id: string, data: Partial<TelemetryDefDto>): Promise<TelemetryDefDto> {
    const existing = await (this.prisma as any).telemetryDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`TelemetryDef ${id} not found`);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.subEvents !== undefined) updateData.subEvents = data.subEvents;

    const updated = await (this.prisma as any).telemetryDef.update({ where: { id }, data: updateData });
    await this.refreshCache();
    return this.mapDef(updated);
  }

  async deleteDef(id: string): Promise<void> {
    const existing = await (this.prisma as any).telemetryDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`TelemetryDef ${id} not found`);
    await (this.prisma as any).telemetryDef.delete({ where: { id } });
    await this.refreshCache();
  }

  async resetCounts(id: string): Promise<{ reset: number }> {
    const existing = await (this.prisma as any).telemetryDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`TelemetryDef ${id} not found`);
    const result = await (this.prisma as any).telemetryCount.deleteMany({
      where: { telemetryDefId: id },
    });
    return { reset: result.count };
  }

  private mapDef(r: any): TelemetryDefDto {
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      enabled: r.enabled,
      startDate: r.startDate ? r.startDate.toISOString() : null,
      endDate: r.endDate ? r.endDate.toISOString() : null,
      subEvents: Array.isArray(r.subEvents) ? r.subEvents : [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
