import { Injectable, BadRequestException } from '@nestjs/common';

export interface ChargeConfig {
  maxChargeUnits?: number;
  costPerUse?: number;
  initialChargeUnits?: number;
  /** Minimum ticks between uses.  0 or absent = no cooldown. */
  cooldownTicks?: number;
  /** Array of sliding-window rate limits applied before deduction. */
  rateLimits?: Array<{ windowTicks: number; maxUses: number }>;
  rechargeRules?: Array<
    | { type: 'TICK'; unitsPerTick: number }
    | {
        type: 'RESOURCE_SPEND';
        units: number;
        cost: Array<{ currencyId: string; amount: number }>;
        gate?: 'owner' | 'everyone';
      }
  >;
}

export interface ChargeUsageSnapshot {
  id: string;
  chargeUnits: number;
  lastChargeAppliedAt: bigint | null;
}

/**
 * Four-step tick-drip algorithm.
 * Step 1: compute elapsed ticks since last drip (0 when null → initialise).
 * Step 2: accumulate delta from TICK recharge rules.
 * Step 3: clamp to [0, maxChargeUnits].
 * Step 4: return updated units + whether the row must be written.
 *
 * When lastChargeAppliedAt is null the row has never been dripped; we still
 * advance lastChargeAppliedAt to currentTick so future calls can measure
 * elapsed ticks correctly.
 */
function applyTickDripMath(
  currentChargeUnits: number,
  lastChargeAppliedAt: bigint | null,
  currentTick: bigint,
  config: ChargeConfig,
): { updatedUnits: number; mustWrite: boolean } {
  const maxUnits = config.maxChargeUnits ?? 1;
  const isFirstDrip = lastChargeAppliedAt === null;
  const lastTick = lastChargeAppliedAt ?? currentTick;
  const elapsedTicks = Math.max(0, Number(currentTick - lastTick));

  const rechargeRules = config.rechargeRules ?? [];
  let delta = 0;
  for (const rule of rechargeRules) {
    if (rule.type === 'TICK') {
      delta += rule.unitsPerTick * elapsedTicks;
    }
  }

  const clamped = Math.min(
    Math.max(0, currentChargeUnits + delta),
    maxUnits === Infinity ? Number.MAX_SAFE_INTEGER : maxUnits,
  );

  return {
    updatedUnits: clamped,
    // Must write when ticks elapsed (drip happened) OR first call (null initialisation).
    mustWrite: elapsedTicks > 0 || isFirstDrip,
  };
}

@Injectable()
export class PowerChargeService {

  async getOrCreateEntityUsage(
    entityId: string,
    powerGrantId: string,
    config: ChargeConfig,
    db: any,
  ): Promise<ChargeUsageSnapshot> {
    const existing = await (db as any).entityPowerUsage.findUnique({
      where: { powerGrantId },
      select: { id: true, chargeUnits: true, lastChargeAppliedAt: true },
    });
    if (existing) return existing;

    const initialChargeUnits = config.initialChargeUnits ?? config.maxChargeUnits ?? 1;
    return (db as any).entityPowerUsage.create({
      data: { entityId, powerGrantId, chargeUnits: initialChargeUnits },
      select: { id: true, chargeUnits: true, lastChargeAppliedAt: true },
    });
  }

  async getOrCreateLocationUsage(
    locationInstanceId: string,
    powerGrantId: string,
    config: ChargeConfig,
    db: any,
  ): Promise<ChargeUsageSnapshot> {
    const existing = await (db as any).locationPowerUsage.findUnique({
      where: { powerGrantId },
      select: { id: true, chargeUnits: true, lastChargeAppliedAt: true },
    });
    if (existing) return existing;

    const initialChargeUnits = config.initialChargeUnits ?? config.maxChargeUnits ?? 1;
    return (db as any).locationPowerUsage.create({
      data: { locationInstanceId, powerGrantId, chargeUnits: initialChargeUnits },
      select: { id: true, chargeUnits: true, lastChargeAppliedAt: true },
    });
  }

  /**
   * Apply tick-based drip recharge for an EntityPowerUsage row.
   * Always advances lastChargeAppliedAt on first call (null → currentTick) so
   * future calls measure elapsed ticks correctly.
   */
  async applyEntityTickDrip(
    usage: ChargeUsageSnapshot,
    config: ChargeConfig,
    currentTick: bigint,
    db: any,
  ): Promise<number> {
    const { updatedUnits, mustWrite } = applyTickDripMath(
      usage.chargeUnits,
      usage.lastChargeAppliedAt,
      currentTick,
      config,
    );

    if (mustWrite) {
      await (db as any).entityPowerUsage.update({
        where: { id: usage.id },
        data: { chargeUnits: updatedUnits, lastChargeAppliedAt: currentTick },
      });
    }
    return updatedUnits;
  }

  async applyLocationTickDrip(
    usage: ChargeUsageSnapshot,
    config: ChargeConfig,
    currentTick: bigint,
    db: any,
  ): Promise<number> {
    const { updatedUnits, mustWrite } = applyTickDripMath(
      usage.chargeUnits,
      usage.lastChargeAppliedAt,
      currentTick,
      config,
    );

    if (mustWrite) {
      await (db as any).locationPowerUsage.update({
        where: { id: usage.id },
        data: { chargeUnits: updatedUnits, lastChargeAppliedAt: currentTick },
      });
    }
    return updatedUnits;
  }

  /**
   * Enforce cooldownTicks: reject if the most recent PowerUseEvent for this
   * grant was fired fewer than cooldownTicks ago.
   */
  async checkCooldown(
    powerGrantId: string,
    cooldownTicks: number,
    currentTick: bigint,
    db: any,
  ): Promise<void> {
    if (cooldownTicks <= 0) return;
    const lastEvent = await (db as any).powerUseEvent.findFirst({
      where: { powerGrantId },
      orderBy: { triggeredAtTick: 'desc' },
      select: { triggeredAtTick: true },
    });
    if (lastEvent) {
      const elapsed = Number(currentTick - BigInt(lastEvent.triggeredAtTick));
      if (elapsed < cooldownTicks) {
        throw new BadRequestException(
          `Power on cooldown. ${cooldownTicks - elapsed} tick(s) remaining before next use.`,
        );
      }
    }
  }

  /**
   * Enforce sliding-window rate limits: reject if any window's use count has
   * reached its maximum.  Uses indexed PowerUseEvent rows.
   */
  async checkRateLimits(
    powerGrantId: string,
    rateLimits: Array<{ windowTicks: number; maxUses: number }>,
    currentTick: bigint,
    db: any,
  ): Promise<void> {
    for (const limit of rateLimits) {
      const windowStart = currentTick - BigInt(limit.windowTicks);
      const count = await (db as any).powerUseEvent.count({
        where: {
          powerGrantId,
          triggeredAtTick: { gte: windowStart },
        },
      });
      if (count >= limit.maxUses) {
        throw new BadRequestException(
          `Power rate limit reached: max ${limit.maxUses} uses per ${limit.windowTicks} ticks.`,
        );
      }
    }
  }

  /**
   * Deduct costPerUse from an EntityPowerUsage row and record a PowerUseEvent.
   * Also decrements grant.remainingChargeUnits when it is not null.
   * Call this BEFORE activating the power so a failed activation does not grant
   * free uses.
   */
  async deductEntityCharge(
    usage: ChargeUsageSnapshot,
    costPerUse: number,
    powerGrantId: string,
    currentTick: bigint,
    triggeredByUserId: string | null,
    db: any,
    triggerSourceType?: string,
    triggerSourceId?: string,
  ): Promise<void> {
    const afterDeduct = usage.chargeUnits - costPerUse;
    await (db as any).entityPowerUsage.update({
      where: { id: usage.id },
      data: { chargeUnits: afterDeduct },
    });

    await this._decrementGrantRemaining(powerGrantId, costPerUse, db);

    await (db as any).powerUseEvent.create({
      data: {
        powerGrantId,
        triggeredByUserId,
        triggeredAtTick: currentTick,
        spentUnits: costPerUse,
        triggerSourceType: triggerSourceType ?? null,
        triggerSourceId: triggerSourceId ?? null,
      },
    });
  }

  async deductLocationCharge(
    usage: ChargeUsageSnapshot,
    costPerUse: number,
    powerGrantId: string,
    currentTick: bigint,
    triggeredByUserId: string | null,
    db: any,
    triggerSourceType?: string,
    triggerSourceId?: string,
  ): Promise<void> {
    const afterDeduct = usage.chargeUnits - costPerUse;
    await (db as any).locationPowerUsage.update({
      where: { id: usage.id },
      data: { chargeUnits: afterDeduct },
    });

    await this._decrementGrantRemaining(powerGrantId, costPerUse, db);

    await (db as any).powerUseEvent.create({
      data: {
        powerGrantId,
        triggeredByUserId,
        triggeredAtTick: currentTick,
        spentUnits: costPerUse,
        triggerSourceType: triggerSourceType ?? null,
        triggerSourceId: triggerSourceId ?? null,
      },
    });
  }

  /** Extract ChargeConfig from a PowerDef row (or return defaults when null). */
  static extractChargeConfig(powerDef: { chargeConfig?: any } | null): ChargeConfig {
    const raw = powerDef?.chargeConfig as any;
    if (!raw || typeof raw !== 'object') {
      return { maxChargeUnits: 1, costPerUse: 1, initialChargeUnits: 1, rechargeRules: [] };
    }
    return {
      maxChargeUnits: raw.maxChargeUnits ?? 1,
      costPerUse: raw.costPerUse ?? 1,
      initialChargeUnits: raw.initialChargeUnits ?? raw.maxChargeUnits ?? 1,
      cooldownTicks: raw.cooldownTicks ?? 0,
      rateLimits: Array.isArray(raw.rateLimits) ? raw.rateLimits : [],
      rechargeRules: Array.isArray(raw.rechargeRules) ? raw.rechargeRules : [],
    };
  }

  private async _decrementGrantRemaining(
    powerGrantId: string,
    costPerUse: number,
    db: any,
  ): Promise<void> {
    const grant = await (db as any).powerGrant.findUnique({
      where: { id: powerGrantId },
      select: { remainingChargeUnits: true },
    });
    if (grant?.remainingChargeUnits == null) return;
    const after = Math.max(0, grant.remainingChargeUnits - costPerUse);
    await (db as any).powerGrant.update({
      where: { id: powerGrantId },
      data: { remainingChargeUnits: after },
    });
  }
}
