import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { EffectCategory, EffectValueMode } from '@derp/shared';
import { getCurrentTick } from '@derp/math';

export const POWER_TYPE_TO_CATEGORY: Record<string, EffectCategory> = {
  keeper_xp_boost: EffectCategory.KEEPER_XP_MULTIPLIER,
  entity_xp_boost: EffectCategory.XP_MULTIPLIER,
  mission_power_boost: EffectCategory.MISSION_POWER,
  mission_duration_reduction: EffectCategory.MISSION_TIMER_SPEED,
  crafting_duration_reduction: EffectCategory.CRAFTING_TIMER_SPEED,
  building_build_duration_reduction: EffectCategory.BUILDING_BUILD_TIMER_SPEED,
  building_upgrade_duration_reduction: EffectCategory.BUILDING_UPGRADE_TIMER_SPEED,
  injury_recovery_boost: EffectCategory.INJURY_RECOVERY_SPEED,
};

// tick_speed_boost acts directly on the BoostEvent / TickRateInterval system
// rather than the effect resolver, so it lives outside POWER_TYPE_TO_CATEGORY.
export const TICK_SPEED_BOOST_TYPE = 'tick_speed_boost';

export const VALID_POWER_TYPES = [
  ...Object.keys(POWER_TYPE_TO_CATEGORY),
  TICK_SPEED_BOOST_TYPE,
];

export const VALID_VALUE_MODES = [
  EffectValueMode.FLAT_ADD,
  EffectValueMode.PERCENT_ADD,
  EffectValueMode.MULTIPLIER,
];

export interface CreateGlobalPowerDto {
  label: string;
  powerType: string;
  value: number;
  valueMode?: string;
  durationMinutes: number;
  scheduledFor?: Date | string;
  triggeredByUserId?: string;
}

export interface GlobalActivePowerRecord {
  id: string;
  label: string;
  powerType: string;
  value: number;
  valueMode: string;
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
  powerType: string;
  value: number;
  valueMode: string;
  durationMinutes: number;
  scheduledFor?: string;
  startTime: string;
  endTime: string;
  status: string;
  triggeredByUserId?: string;
};

/** Convert global power value+valueMode into BoostEvent multiplier / percentBoost pair. */
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
  ) {}

  async getActivePowers(): Promise<GlobalActivePowerRecord[]> {
    return this.prisma.globalActivePower.findMany({
      where: { status: 'active' },
      orderBy: { startTime: 'desc' },
    }) as Promise<GlobalActivePowerRecord[]>;
  }

  /** Returns active + scheduled powers. Used by the admin panel default view. */
  async getActiveAndScheduledPowers(): Promise<GlobalActivePowerRecord[]> {
    return this.prisma.globalActivePower.findMany({
      where: { status: { in: ['active', 'scheduled'] } },
      orderBy: { startTime: 'asc' },
    }) as Promise<GlobalActivePowerRecord[]>;
  }

  async getAllPowers(): Promise<GlobalActivePowerRecord[]> {
    return this.prisma.globalActivePower.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) as Promise<GlobalActivePowerRecord[]>;
  }

  /**
   * Triggers a global power, enforcing a no-stack constraint: if a power of
   * the same `powerType` is already active, a `BadRequestException` is thrown
   * with a clear message. Use this for player-initiated power triggers (e.g.
   * unique location powers) to prevent unintended stacking.
   */
  async triggerPower(dto: CreateGlobalPowerDto): Promise<GlobalActivePowerRecord> {
    const now = new Date();
    const existing = await this.prisma.globalActivePower.findFirst({
      where: { status: 'active', powerType: dto.powerType, endTime: { gt: now } },
    }) as GlobalActivePowerRecord | null;

    if (existing) {
      const remaining = Math.ceil((existing.endTime.getTime() - now.getTime()) / 60_000);
      throw new BadRequestException(
        `A "${dto.powerType}" power is already active. Wait for it to expire (${remaining} minute${remaining !== 1 ? 's' : ''} remaining).`,
      );
    }

    return this.createPower(dto);
  }

  async createPower(dto: CreateGlobalPowerDto): Promise<GlobalActivePowerRecord> {
    if (!VALID_POWER_TYPES.includes(dto.powerType)) {
      throw new BadRequestException(
        `Invalid powerType "${dto.powerType}". Valid types: ${VALID_POWER_TYPES.join(', ')}`,
      );
    }
    if (typeof dto.value !== 'number' || !isFinite(dto.value)) {
      throw new BadRequestException('value must be a finite number');
    }
    if (typeof dto.durationMinutes !== 'number' || dto.durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes must be a positive number');
    }
    if (!Number.isInteger(dto.durationMinutes) || dto.durationMinutes > 10080) {
      throw new BadRequestException('durationMinutes must be a whole number and at most 10080 (1 week)');
    }

    const valueMode = dto.valueMode ?? EffectValueMode.PERCENT_ADD;
    if (!VALID_VALUE_MODES.includes(valueMode as EffectValueMode)) {
      throw new BadRequestException(
        `Invalid valueMode "${valueMode}". Valid modes: ${VALID_VALUE_MODES.join(', ')}`,
      );
    }

    if (valueMode === EffectValueMode.MULTIPLIER && dto.value <= 0) {
      throw new BadRequestException('value must be greater than 0 for multiplier mode');
    }
    if (valueMode === EffectValueMode.PERCENT_ADD && (dto.value < -100 || dto.value > 1000)) {
      throw new BadRequestException('percent_add value must be between -100 and 1000');
    }
    if (dto.value === 0) {
      throw new BadRequestException('value must be non-zero');
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

    const power = await this.prisma.globalActivePower.create({
      data: {
        label: dto.label,
        powerType: dto.powerType,
        value: dto.value,
        valueMode,
        durationMinutes: dto.durationMinutes,
        // Only persist scheduledFor when the power is actually deferred; normalize
        // to null when the provided date is in the past or omitted (immediate activation).
        scheduledFor: isScheduled ? scheduledFor : null,
        startTime,
        endTime,
        status,
        triggeredByUserId: dto.triggeredByUserId ?? null,
      },
    }) as GlobalActivePowerRecord;

    if (isScheduled) {
      this.logger.log(
        `Global power scheduled: ${power.label} (${power.powerType} ${power.value} ${power.valueMode} for ${dto.durationMinutes}min, starts ${startTime.toISOString()})`,
      );
      return power;
    }

    this.logger.log(
      `Global power activated: ${power.label} (${power.powerType} ${power.value} ${power.valueMode} for ${dto.durationMinutes}min)`,
    );

    if (power.powerType === TICK_SPEED_BOOST_TYPE) {
      await this.applyTickBoostForPower(power, now);
    }

    const active = await this.getActivePowers();
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: active.map((p) => this.serializePower(p)),
      changes: [{ event: 'started', id: power.id, powerType: power.powerType, label: power.label, durationMinutes: power.durationMinutes }],
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

    if (power.status === 'active' && power.powerType === TICK_SPEED_BOOST_TYPE) {
      await this.cancelTickBoostForPower(id, new Date());
    }

    const active = await this.getActivePowers();
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: active.map((p) => this.serializePower(p)),
      changes: [{ event: 'ended', id: updated.id, powerType: updated.powerType, label: updated.label, durationMinutes: updated.durationMinutes }],
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
        if (p.powerType === TICK_SPEED_BOOST_TYPE) {
          await this.applyTickBoostForPower({ ...p, status: 'active' }, now);
        }
      }

      const active = await this.getActivePowers();
      this.pubsub.publishBroadcast({
        type: 'global_power.changed',
        active: active.map((p) => this.serializePower(p)),
        changes: toActivate.map((p) => ({
          event: 'started' as const,
          id: p.id,
          powerType: p.powerType,
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

    const tickPowers = expiring.filter((p) => p.powerType === TICK_SPEED_BOOST_TYPE);
    if (tickPowers.length > 0) {
      await this.expireTickBoostsForPowers(tickPowers.map((p) => p.id), now);
    }

    const active = await this.getActivePowers();
    this.pubsub.publishBroadcast({
      type: 'global_power.changed',
      active: active.map((p) => this.serializePower(p)),
      changes: expiring.map((p) => ({
        event: 'ended' as const,
        id: p.id,
        powerType: p.powerType,
        label: p.label,
        durationMinutes: p.durationMinutes,
      })),
    });

    this.logger.log(`Expired ${expiring.length} global power(s)`);
    return expiring.length;
  }

  serializePower(power: GlobalActivePowerRecord): SerializedPower {
    return {
      id: power.id,
      label: power.label,
      powerType: power.powerType,
      value: power.value,
      valueMode: power.valueMode,
      durationMinutes: power.durationMinutes,
      ...(power.scheduledFor ? { scheduledFor: power.scheduledFor.toISOString() } : {}),
      startTime: power.startTime.toISOString(),
      endTime: power.endTime.toISOString(),
      status: power.status,
      ...(power.triggeredByUserId ? { triggeredByUserId: power.triggeredByUserId } : {}),
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
   * Errors propagate to the caller so createPower can surface them cleanly.
   */
  private async applyTickBoostForPower(power: GlobalActivePowerRecord, now: Date): Promise<void> {
    const { multiplier, percentBoost } = toBoostParams(power.value, power.valueMode);
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
