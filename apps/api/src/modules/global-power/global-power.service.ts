import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { EffectCategory, EffectValueMode } from '@derp/shared';

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

export const VALID_POWER_TYPES = Object.keys(POWER_TYPE_TO_CATEGORY);

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
  triggeredByUserId?: string;
}

export interface GlobalActivePowerRecord {
  id: string;
  label: string;
  powerType: string;
  value: number;
  valueMode: string;
  durationMinutes: number;
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
  startTime: string;
  endTime: string;
  status: string;
  triggeredByUserId?: string;
};

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

  async getAllPowers(): Promise<GlobalActivePowerRecord[]> {
    return this.prisma.globalActivePower.findMany({
      orderBy: { startTime: 'desc' },
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

    // Value-range guards per mode
    if (valueMode === EffectValueMode.MULTIPLIER && dto.value <= 0) {
      throw new BadRequestException('value must be greater than 0 for multiplier mode');
    }
    if (valueMode === EffectValueMode.PERCENT_ADD && (dto.value < -100 || dto.value > 1000)) {
      throw new BadRequestException('percent_add value must be between -100 and 1000');
    }
    if (dto.value === 0) {
      throw new BadRequestException('value must be non-zero');
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + dto.durationMinutes * 60 * 1000);

    const power = await this.prisma.globalActivePower.create({
      data: {
        label: dto.label,
        powerType: dto.powerType,
        value: dto.value,
        valueMode,
        durationMinutes: dto.durationMinutes,
        startTime: now,
        endTime,
        status: 'active',
        triggeredByUserId: dto.triggeredByUserId ?? null,
      },
    }) as GlobalActivePowerRecord;

    this.logger.log(
      `Global power activated: ${power.label} (${power.powerType} ${power.value} ${power.valueMode} for ${dto.durationMinutes}min)`,
    );

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
   * broadcasts a single summary event. Returns count of newly expired powers.
   */
  async expireStale(): Promise<number> {
    const now = new Date();
    const expiring = await this.prisma.globalActivePower.findMany({
      where: { status: 'active', endTime: { lte: now } },
    }) as GlobalActivePowerRecord[];

    if (expiring.length === 0) return 0;

    await this.prisma.globalActivePower.updateMany({
      where: { id: { in: expiring.map((p) => p.id) } },
      data: { status: 'expired' },
    });

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
      startTime: power.startTime.toISOString(),
      endTime: power.endTime.toISOString(),
      status: power.status,
      ...(power.triggeredByUserId ? { triggeredByUserId: power.triggeredByUserId } : {}),
    };
  }
}
