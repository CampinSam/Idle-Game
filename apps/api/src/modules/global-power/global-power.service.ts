import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';
import { EffectDefOverrides, EffectSelection, EffectValueMode } from '@derp/shared';
import { getCurrentTick } from '@derp/math';

// tick_speed_boost acts directly on the BoostEvent / TickRateInterval system
// rather than the effect resolver, so it is identified by effectDefId = null.
export const TICK_SPEED_BOOST_TYPE = 'tick_speed_boost';

export interface CreateGlobalPowerDto {
  label: string;
  /** null → tick_speed_boost power (uses BoostEvent, not effect resolver). */
  effectDefId: string | null;
  effectOverrides?: EffectDefOverrides & { valueMode?: string };
  selection?: EffectSelection;
  durationMinutes: number;
  scheduledFor?: Date | string;
  triggeredByUserId?: string;
}

export interface GlobalActivePowerRecord {
  id: string;
  label: string;
  effectDefId: string | null;
  effectOverrides: Record<string, any> | null;
  selection: Record<string, any> | null;
  durationMinutes: number;
  scheduledFor: Date | null;
  startTime: Date;
  endTime: Date;
  status: string;
  triggeredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type SerializedPower = {
  id: string;
  label: string;
  effectDefId: string | null;
  effectDefName: string | null;
  effectCategory: string | null;
  value: number;
  valueMode: string;
  durationMinutes: number;
  scheduledFor?: string;
  startTime: string;
  endTime: string;
  status: string;
  triggeredByUserId?: string;
  selection: Record<string, any> | null;
};

/** Convert tick_speed_boost value+valueMode (stored in effectOverrides) to BoostEvent params. */
function toBoostParams(value: number, valueMode: string): { multiplier: number; percentBoost: number } {
  if (valueMode === EffectValueMode.MULTIPLIER) {
    return { multiplier: value, percentBoost: (value - 1) * 100 };
  }
  // percent_add and flat_add are both treated as an additive percentage.
  const pct = value;
  return { multiplier: 1 + pct / 100, percentBoost: pct };
}

@Injectable()
export class GlobalPowerService {
  private readonly logger = new Logger(GlobalPowerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubService,
    private readonly definitionCache: DefinitionCacheService,
  ) {}

  async getActivePowers(): Promise<GlobalActivePowerRecord[]> {
    return this.prisma.globalActivePower.findMany({
      where: { status: 'active' },
      orderBy: { startTime: 'desc' },
    }) as Promise<GlobalActivePowerRecord[]>;
  }

  /** Returns active + scheduled powers. Used by the admin panel default view. */
  async getActiveAndScheduledPowers(): Promise<GlobalActivePowerRecord[]> {
    const powers = await this.prisma.globalActivePower.findMany({
      where: { status: { in: ['active', 'scheduled'] } },
      orderBy: { startTime: 'asc' },
      include: { effectDef: true },
    }) as any[];
    return powers.map((p) => this.attachDefToRecord(p));
  }

  async getAllPowers(): Promise<GlobalActivePowerRecord[]> {
    const powers = await this.prisma.globalActivePower.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { effectDef: true },
    }) as any[];
    return powers.map((p) => this.attachDefToRecord(p));
  }

  /**
   * Attach effectDefName/effectCategory and resolved effective value/valueMode
   * from the joined effectDef and effectOverrides onto the serialized record.
   * - tick_speed_boost (effectDefId=null): value+valueMode from effectOverrides
   * - effectDef-backed: value+valueMode from effectOverrides (overrides take
   *   precedence) falling back to null when no override is present.
   */
  private attachDefToRecord(p: any): GlobalActivePowerRecord & {
    effectDefName?: string | null;
    effectCategory?: string | null;
    effectiveValue?: number | null;
    effectiveValueMode?: string | null;
  } {
    const { effectDef, ...rest } = p;
    const overrides = p.effectOverrides as Record<string, any> | null;
    const effectiveValue: number | null =
      typeof overrides?.value === 'number' ? overrides.value : null;
    const effectiveValueMode: string | null =
      typeof overrides?.valueMode === 'string' ? overrides.valueMode : null;
    return {
      ...rest,
      effectDefName: effectDef?.name ?? null,
      effectCategory: effectDef?.category ?? null,
      effectiveValue,
      effectiveValueMode,
    };
  }

  /**
   * Triggers a global power, enforcing a no-stack constraint per effectDefId:
   * if a power with the same effectDefId is already active, a BadRequestException
   * is thrown. For tick_speed_boost (effectDefId = null) the constraint is skipped
   * since multiple tick boosts can coexist.
   */
  async triggerPower(dto: CreateGlobalPowerDto): Promise<GlobalActivePowerRecord> {
    if (dto.effectDefId !== null) {
      // Resolve slug → UUID so the findFirst correctly matches stored UUID values.
      const resolvedDef = this.definitionCache.get('effectDef', dto.effectDefId);
      const resolvedEffectDefId: string = resolvedDef?.id ?? dto.effectDefId;
      dto = { ...dto, effectDefId: resolvedEffectDefId };

      const now = new Date();
      const existing = await this.prisma.globalActivePower.findFirst({
        where: { status: 'active', effectDefId: resolvedEffectDefId, endTime: { gt: now } },
      }) as GlobalActivePowerRecord | null;

      if (existing) {
        const remaining = Math.ceil((existing.endTime.getTime() - now.getTime()) / 60_000);
        throw new BadRequestException(
          `A power with effectDef "${dto.effectDefId}" is already active. Wait for it to expire (${remaining} minute${remaining !== 1 ? 's' : ''} remaining).`,
        );
      }
    }

    return this.createPower(dto);
  }

  async createPower(dto: CreateGlobalPowerDto): Promise<GlobalActivePowerRecord> {
    if (typeof dto.durationMinutes !== 'number' || dto.durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes must be a positive number');
    }
    if (!Number.isInteger(dto.durationMinutes) || dto.durationMinutes > 10080) {
      throw new BadRequestException('durationMinutes must be a whole number and at most 10080 (1 week)');
    }

    const isTickBoost = dto.effectDefId === null;

    if (isTickBoost) {
      // tick_speed_boost: validate value and valueMode from effectOverrides
      const overrides = dto.effectOverrides as any;
      const value = overrides?.value;
      const valueMode = overrides?.valueMode ?? EffectValueMode.PERCENT_ADD;
      if (typeof value !== 'number' || !isFinite(value)) {
        throw new BadRequestException('effectOverrides.value must be a finite number for tick_speed_boost');
      }
      if (value === 0) throw new BadRequestException('effectOverrides.value must be non-zero');
      const validModes = [EffectValueMode.FLAT_ADD, EffectValueMode.PERCENT_ADD, EffectValueMode.MULTIPLIER];
      if (!validModes.includes(valueMode as EffectValueMode)) {
        throw new BadRequestException(`effectOverrides.valueMode "${valueMode}" is invalid. Valid: ${validModes.join(', ')}`);
      }
      if (valueMode === EffectValueMode.MULTIPLIER && value <= 0) {
        throw new BadRequestException('effectOverrides.value must be > 0 for multiplier mode');
      }
      if (valueMode === EffectValueMode.PERCENT_ADD && (value < -100 || value > 1000)) {
        throw new BadRequestException('effectOverrides.value (percent_add) must be between -100 and 1000');
      }
    } else {
      if (!dto.effectDefId) throw new BadRequestException('effectDefId is required');
      // Validate effectDefId references a real EffectDef via Prisma (accepts UUID or slug key)
      const def = this.definitionCache.get('effectDef', dto.effectDefId);
      if (!def || def.enabled === false) throw new NotFoundException(`EffectDef "${dto.effectDefId}" not found or disabled`);
      // Canonicalise to UUID so the stored record references the correct PK.
      dto = { ...dto, effectDefId: def.id };
    }

    // Validate and parse scheduledFor
    let scheduledFor: Date | null = null;
    if (dto.scheduledFor) {
      const parsed = new Date(dto.scheduledFor);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('scheduledFor must be a valid ISO date-time string');
      }
      scheduledFor = parsed;
    }

    const now = new Date();
    const isScheduled = scheduledFor !== null && scheduledFor > now;
    const startTime = isScheduled ? scheduledFor! : now;
    const endTime = new Date(startTime.getTime() + dto.durationMinutes * 60 * 1000);
    const status = isScheduled ? 'scheduled' : 'active';

    const defaultSelection: EffectSelection = { scope: 'global', agg: 'any' };

    const power = await this.prisma.globalActivePower.create({
      data: {
        label: dto.label,
        effectDefId: dto.effectDefId,
        effectOverrides: (dto.effectOverrides as any) ?? null,
        selection: (dto.selection ?? defaultSelection) as any,
        durationMinutes: dto.durationMinutes,
        scheduledFor: isScheduled ? scheduledFor : null,
        startTime,
        endTime,
        status,
        triggeredByUserId: dto.triggeredByUserId ?? null,
      },
    }) as GlobalActivePowerRecord;

    if (isScheduled) {
      this.logger.log(
        `Global power scheduled: ${power.label} (effectDefId=${power.effectDefId ?? 'tick_speed_boost'} for ${dto.durationMinutes}min, starts ${startTime.toISOString()})`,
      );
      return power;
    }

    this.logger.log(
      `Global power activated: ${power.label} (effectDefId=${power.effectDefId ?? 'tick_speed_boost'} for ${dto.durationMinutes}min)`,
    );

    if (isTickBoost) {
      await this.applyTickBoostForPower(power, now);
    }

    const active = await this.getActivePowers();
    const activeSerialized = await Promise.all(active.map((p) => this.serializePower(p)));
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: activeSerialized,
      changes: [{ event: 'started', id: power.id, label: power.label, durationMinutes: power.durationMinutes }],
    });

    return power;
  }

  async cancelPower(id: string): Promise<GlobalActivePowerRecord> {
    const power = await this.prisma.globalActivePower.findUnique({
      where: { id },
    }) as GlobalActivePowerRecord | null;

    if (!power) throw new NotFoundException(`Global power ${id} not found`);
    if (power.status === 'cancelled') {
      throw new BadRequestException('Power has already been cancelled');
    }
    if (power.status === 'expired') {
      throw new BadRequestException('Power has already expired');
    }

    const updated = await this.prisma.globalActivePower.update({
      where: { id },
      data: { status: 'cancelled' },
    }) as GlobalActivePowerRecord;

    this.logger.log(`Global power cancelled: ${power.label} (${id})`);

    const isTickBoost = power.effectDefId === null;
    if (power.status === 'active' && isTickBoost) {
      await this.cancelTickBoostForPower(id, new Date());
    }

    const active = await this.getActivePowers();
    const activeSerialized = await Promise.all(active.map((p) => this.serializePower(p)));
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: activeSerialized,
      changes: [{ event: 'ended', id: updated.id, label: updated.label, durationMinutes: updated.durationMinutes }],
    });

    return updated;
  }

  /**
   * Called on every tick poll cycle (~200ms). Finds naturally expired powers
   * (endTime <= now, status = 'active'), persists status = 'expired', and
   * broadcasts a single summary event. Also activates scheduled powers whose
   * startTime has arrived (scheduledFor <= now, status = 'scheduled').
   * Returns count of newly expired powers.
   */
  async expireStale(): Promise<number> {
    const now = new Date();

    // Activate powers whose scheduled start time has arrived
    const toActivate = await this.prisma.globalActivePower.findMany({
      where: { status: 'scheduled', startTime: { lte: now } },
    }) as GlobalActivePowerRecord[];

    if (toActivate.length > 0) {
      await this.prisma.globalActivePower.updateMany({
        where: { id: { in: toActivate.map((p) => p.id) } },
        data: { status: 'active' },
      });

      for (const p of toActivate) {
        if (p.effectDefId === null) {
          await this.applyTickBoostForPower({ ...p, status: 'active' }, now);
        }
      }

      const active = await this.getActivePowers();
      const activeSerialized = await Promise.all(active.map((p) => this.serializePower(p)));
      this.pubsub.publishBroadcast({
        type: 'global_power.changed',
        active: activeSerialized,
        changes: toActivate.map((p) => ({
          event: 'started' as const,
          id: p.id,
          label: p.label,
          durationMinutes: p.durationMinutes,
        })),
      });

      this.logger.log(`Activated ${toActivate.length} scheduled global power(s)`);
    }

    // Expire powers whose end time has passed
    const expiring = await this.prisma.globalActivePower.findMany({
      where: { status: 'active', endTime: { lte: now } },
    }) as GlobalActivePowerRecord[];

    if (expiring.length === 0) return 0;

    await this.prisma.globalActivePower.updateMany({
      where: { id: { in: expiring.map((p) => p.id) } },
      data: { status: 'expired' },
    });

    const tickPowers = expiring.filter((p) => p.effectDefId === null);
    if (tickPowers.length > 0) {
      await this.expireTickBoostsForPowers(tickPowers.map((p) => p.id), now);
    }

    const active = await this.getActivePowers();
    const activeSerialized = await Promise.all(active.map((p) => this.serializePower(p)));
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: activeSerialized,
      changes: expiring.map((p) => ({
        event: 'ended' as const,
        id: p.id,
        label: p.label,
        durationMinutes: p.durationMinutes,
      })),
    });

    this.logger.log(`Expired ${expiring.length} global power(s)`);
    return expiring.length;
  }

  async serializePower(power: GlobalActivePowerRecord): Promise<SerializedPower> {
    const overrides = (power.effectOverrides ?? {}) as any;
    const isTickBoost = power.effectDefId === null;

    let effectDefName: string | null = null;
    let effectCategory: string | null = null;
    let value = 0;
    let valueMode = EffectValueMode.PERCENT_ADD;

    if (isTickBoost) {
      value = overrides.value ?? 0;
      valueMode = overrides.valueMode ?? EffectValueMode.PERCENT_ADD;
    } else {
      try {
        const def = power.effectDefId ? this.definitionCache.get('effectDef', power.effectDefId) : null;
        if (def) {
          effectDefName = def.name;
          effectCategory = def.category;
          value = overrides.value ?? def.value ?? 0;
          valueMode = def.valueMode;
        }
      } catch { /* graceful fallback */ }
    }

    return {
      id: power.id,
      label: power.label,
      effectDefId: power.effectDefId,
      effectDefName,
      effectCategory,
      value,
      valueMode,
      durationMinutes: power.durationMinutes,
      ...(power.scheduledFor ? { scheduledFor: power.scheduledFor.toISOString() } : {}),
      startTime: power.startTime.toISOString(),
      endTime: power.endTime.toISOString(),
      status: power.status,
      ...(power.triggeredByUserId ? { triggeredByUserId: power.triggeredByUserId } : {}),
      selection: power.selection,
    };
  }

  // ---------------------------------------------------------------------------
  // Tick-speed boost helpers (inline to avoid circular dep with TickModule).
  // Private getters follow the same pattern as BoostService.
  // ---------------------------------------------------------------------------

  private get boostEvent() {
    return (this.prisma as any).boostEvent;
  }

  private get tickRateInterval() {
    return (this.prisma as any).tickRateInterval;
  }

  private boostEventName(powerId: string): string {
    return `global_power:${powerId}`;
  }

  /**
   * Creates a BoostEvent linked to this power and recomputes the tick rate.
   * Value and valueMode are read from effectOverrides for tick_speed_boost powers.
   */
  private async applyTickBoostForPower(power: GlobalActivePowerRecord, now: Date): Promise<void> {
    const overrides = (power.effectOverrides ?? {}) as any;
    const value = overrides.value ?? 0;
    const valueMode = overrides.valueMode ?? EffectValueMode.PERCENT_ADD;
    const { multiplier, percentBoost } = toBoostParams(value, valueMode);
    const boostEvent = await this.boostEvent.create({
      data: {
        name: this.boostEventName(power.id),
        description: power.label,
        multiplier,
        percentBoost,
        startTime: power.startTime,
        endTime: power.endTime,
        status: 'active',
      },
    });
    await this.recomputeAndBroadcastTickRate(now, boostEvent.id);
  }

  /**
   * Cancels the BoostEvent linked to this power and recomputes the tick rate.
   * If the boost event is already gone (e.g. expired naturally), logs a warning
   * and returns — the tick rate will self-correct on the next expiry cycle.
   */
  private async cancelTickBoostForPower(powerId: string, now: Date): Promise<void> {
    const name = this.boostEventName(powerId);
    const boostEvent = await this.boostEvent.findFirst({
      where: { name, status: 'active' },
    });
    if (!boostEvent) {
      this.logger.warn(`No active BoostEvent found for power ${powerId} during cancel — skipping tick-rate update`);
      return;
    }
    await this.boostEvent.update({
      where: { id: boostEvent.id },
      data: { status: 'cancelled', endTime: now },
    });
    await this.recomputeAndBroadcastTickRate(now, boostEvent.id);
  }

  /**
   * Expires BoostEvents for a batch of tick_speed_boost powers and recomputes
   * the tick rate once. Missing boost events are warned about but do not block
   * the expiry of the global powers themselves.
   */
  private async expireTickBoostsForPowers(powerIds: string[], now: Date): Promise<void> {
    const names = powerIds.map((id) => this.boostEventName(id));
    const boostEvents = await this.boostEvent.findMany({
      where: { name: { in: names }, status: 'active' },
    });
    if (boostEvents.length === 0) {
      this.logger.warn(`No active BoostEvents found for powers [${powerIds.join(', ')}] during expiry — skipping tick-rate update`);
      return;
    }
    await this.boostEvent.updateMany({
      where: { id: { in: boostEvents.map((b: any) => b.id) } },
      data: { status: 'expired' },
    });
    await this.recomputeAndBroadcastTickRate(now, boostEvents[0].id);
  }

  /**
   * Recomputes the effective tick rate from all active BoostEvents, writes a
   * new TickRateInterval anchored to `anchorBoostId`, and broadcasts tick.sync
   * + boost.changed. Mirrors BoostService.recomputeActiveRate without creating
   * a circular module dependency.
   */
  private async recomputeAndBroadcastTickRate(atTime: Date, anchorBoostId: string): Promise<void> {
    const activeBoosts = await this.boostEvent.findMany({
      where: { status: 'active', startTime: { lte: atTime }, endTime: { gt: atTime } },
      select: { id: true, name: true, percentBoost: true, multiplier: true, endTime: true },
    });

    const combinedPercent: number = activeBoosts.reduce(
      (sum: number, b: { percentBoost: number }) => sum + b.percentBoost,
      0,
    );

    const baseInterval = await this.tickRateInterval.findFirst({
      where: { boostEventId: null, effectiveFromTime: { lte: atTime } },
      orderBy: { effectiveFromTime: 'desc' },
    });
    const baseRate: number = baseInterval?.ticksPerSecond ?? 1.0;
    const newRate = baseRate * (1 + combinedPercent / 100);

    const intervals = await this.tickRateInterval.findMany({
      orderBy: { effectiveFromTime: 'asc' },
    });
    const currentTick = getCurrentTick(atTime, intervals.map((i: any) => ({
      effectiveFromTime: i.effectiveFromTime,
      effectiveFromTick: i.effectiveFromTick,
      ticksPerSecond: i.ticksPerSecond,
    })));

    await this.tickRateInterval.create({
      data: {
        ticksPerSecond: newRate,
        effectiveFromTime: atTime,
        effectiveFromTick: currentTick,
        boostEventId: anchorBoostId,
      },
    });

    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick,
      tickRate: newRate,
      serverTime: atTime.toISOString(),
      boosts: activeBoosts.map((b: any) => ({
        id: b.id,
        name: b.name,
        multiplier: b.multiplier,
        endTime: b.endTime instanceof Date ? b.endTime.toISOString() : b.endTime,
      })),
    });

    this.pubsub.publishBroadcast({
      type: 'boost.changed',
      active: activeBoosts.map((b: any) => ({
        id: b.id,
        name: b.name,
        percentBoost: b.percentBoost,
        endTime: b.endTime instanceof Date ? b.endTime.toISOString() : b.endTime,
      })),
      combinedPercent,
    });
  }
}
