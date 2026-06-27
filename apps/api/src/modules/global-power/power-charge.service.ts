import { Injectable } from '@nestjs/common';

export interface ChargeConfig {
  maxChargeUnits?: number;
  costPerUse?: number;
  initialChargeUnits?: number;
  rechargeRules?: Array<
    | { type: 'TICK'; unitsPerTick: number }
    | { type: 'RESOURCE_SPEND'; units: number; cost: any[]; gate?: 'owner' | 'everyone' }
  >;
}

export interface ChargeUsageSnapshot {
  id: string;
  chargeUnits: number;
  lastChargeAppliedAt: bigint | null;
}

/** Shared math — no DB calls. */
function applyTickDripMath(
  currentChargeUnits: number,
  lastChargeAppliedAt: bigint | null,
  currentTick: bigint,
  config: ChargeConfig,
): { updatedUnits: number; elapsedTicks: number } {
  const maxUnits = config.maxChargeUnits ?? 1;
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
  return { updatedUnits: clamped, elapsedTicks };
}

@Injectable()
export class PowerChargeService {

  /**
   * Fetch or create the EntityPowerUsage charge pool for the given grant.
   * Returns the current row (with any existing chargeUnits).
   */
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

  /**
   * Fetch or create the LocationPowerUsage charge pool for the given grant.
   */
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
   * Returns the post-drip chargeUnits (does NOT deduct costPerUse).
   * Writes updated chargeUnits + lastChargeAppliedAt when elapsed > 0.
   */
  async applyEntityTickDrip(
    usage: ChargeUsageSnapshot,
    config: ChargeConfig,
    currentTick: bigint,
    db: any,
  ): Promise<number> {
    const { updatedUnits, elapsedTicks } = applyTickDripMath(
      usage.chargeUnits,
      usage.lastChargeAppliedAt,
      currentTick,
      config,
    );

    if (elapsedTicks > 0) {
      await (db as any).entityPowerUsage.update({
        where: { id: usage.id },
        data: { chargeUnits: updatedUnits, lastChargeAppliedAt: currentTick },
      });
    }
    return updatedUnits;
  }

  /**
   * Apply tick-based drip recharge for a LocationPowerUsage row.
   */
  async applyLocationTickDrip(
    usage: ChargeUsageSnapshot,
    config: ChargeConfig,
    currentTick: bigint,
    db: any,
  ): Promise<number> {
    const { updatedUnits, elapsedTicks } = applyTickDripMath(
      usage.chargeUnits,
      usage.lastChargeAppliedAt,
      currentTick,
      config,
    );

    if (elapsedTicks > 0) {
      await (db as any).locationPowerUsage.update({
        where: { id: usage.id },
        data: { chargeUnits: updatedUnits, lastChargeAppliedAt: currentTick },
      });
    }
    return updatedUnits;
  }

  /**
   * Deduct costPerUse from an EntityPowerUsage row and record a PowerUseEvent.
   * Also decrements grant.remainingChargeUnits when it is not null.
   */
  async deductEntityCharge(
    usage: ChargeUsageSnapshot,
    costPerUse: number,
    powerGrantId: string,
    currentTick: bigint,
    triggeredByUserId: string | null,
    db: any,
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
      },
    });
  }

  /**
   * Deduct costPerUse from a LocationPowerUsage row and record a PowerUseEvent.
   */
  async deductLocationCharge(
    usage: ChargeUsageSnapshot,
    costPerUse: number,
    powerGrantId: string,
    currentTick: bigint,
    triggeredByUserId: string | null,
    db: any,
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
