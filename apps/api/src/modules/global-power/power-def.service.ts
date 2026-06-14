import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PowerDefService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve a PowerDef by either its UUID id or its slug key.
   * Returns the UUID id of the matching record, or throws NotFoundException.
   */
  private async resolveUuid(keyOrUuid: string): Promise<string> {
    const def = await this.prisma.powerDef.findFirst({
      where: { OR: [{ id: keyOrUuid }, { key: keyOrUuid }] },
      select: { id: true },
    });
    if (!def) throw new NotFoundException(`PowerDef "${keyOrUuid}" not found`);
    return def.id;
  }

  /**
   * Resolve an EffectDef reference (UUID or slug key) to a UUID id.
   * Returns null when effectDefId is null/undefined.
   */
  private async resolveEffectDefUuid(effectDefId: string | null | undefined): Promise<string | null> {
    if (!effectDefId) return null;
    const def = await (this.prisma as any).effectDef.findFirst({
      where: { OR: [{ id: effectDefId }, { key: effectDefId }] },
      select: { id: true },
    });
    if (!def) throw new NotFoundException(`EffectDef "${effectDefId}" not found`);
    return def.id;
  }

  async list(opts: { enabled?: boolean } = {}) {
    const where: any = {};
    if (opts.enabled !== undefined) where.enabled = opts.enabled;
    return this.prisma.powerDef.findMany({
      where,
      include: { effectDef: { select: { id: true, key: true, name: true, category: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    const def = await this.prisma.powerDef.findFirst({
      where: { OR: [{ id }, { key: id }] },
      include: { effectDef: { select: { id: true, key: true, name: true, category: true } } },
    });
    if (!def) throw new NotFoundException(`PowerDef "${id}" not found`);
    return def;
  }

  async create(data: {
    id: string;
    name: string;
    description?: string;
    powerType: string;
    effectDefId?: string | null;
    defaultValue?: number;
    defaultValueMode?: string;
    defaultDurationMinutes?: number;
    defaultDailyLimit?: number;
    defaultScope?: string;
    selection?: any;
    enabled?: boolean;
  }) {
    if (!data.id || !/^[a-z0-9_]+$/.test(data.id)) {
      throw new BadRequestException('id must be lowercase snake_case');
    }
    if (!data.name) throw new BadRequestException('name is required');
    if (!data.powerType) throw new BadRequestException('powerType is required');
    const validPowerTypes = [
      'tick_speed_boost',
      'effect_backed',
      'keeper_xp_boost',
      'entity_xp_boost',
      'mission_power_boost',
      'mission_duration_reduction',
      'crafting_duration_reduction',
      'building_build_duration_reduction',
      'building_upgrade_duration_reduction',
      'injury_recovery_boost',
    ];
    if (!validPowerTypes.includes(data.powerType)) {
      throw new BadRequestException(`powerType must be one of: ${validPowerTypes.join(', ')}`);
    }
    if (data.powerType === 'effect_backed' && !data.effectDefId) {
      throw new BadRequestException('effectDefId is required for effect_backed powers');
    }

    // data.id is the caller-provided slug key; id (UUID) is auto-generated.
    const { id: key, effectDefId: rawEffectDefId, ...rest } = data;
    const effectDefId = await this.resolveEffectDefUuid(rawEffectDefId);

    return this.prisma.powerDef.create({
      data: { key, effectDefId, ...rest },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      powerType: string;
      effectDefId: string | null;
      defaultValue: number;
      defaultValueMode: string;
      defaultDurationMinutes: number;
      defaultDailyLimit: number;
      defaultScope: string;
      selection: any;
      enabled: boolean;
    }>,
  ) {
    const uuid = await this.resolveUuid(id);

    let resolvedData: any = { ...data };
    if ('effectDefId' in data) {
      resolvedData.effectDefId = await this.resolveEffectDefUuid(data.effectDefId);
    }

    return this.prisma.powerDef.update({ where: { id: uuid }, data: resolvedData });
  }

  async delete(id: string) {
    const uuid = await this.resolveUuid(id);
    return this.prisma.powerDef.delete({ where: { id: uuid } });
  }

  /**
   * Resolve a PowerRef against its PowerDef (if any) to produce a fully-merged
   * configuration ready for activation.
   */
  async resolve(powerRef: {
    powerDefId?: string;
    /** Optional for legacy inline powers; falls back to powerType then effectDefId. */
    key?: string;
    name: string;
    value?: number;
    valueMode?: string;
    durationMinutes?: number;
    dailyLimit?: number;
    scope?: string;
    selection?: any;
    powerType?: string;
    effectDefId?: string | null;
    effectOverrides?: Record<string, any>;
  }): Promise<{
    key: string;
    name: string;
    powerType: string;
    effectDefId: string | null;
    effectOverrides?: Record<string, any>;
    value: number;
    valueMode: string;
    durationMinutes: number;
    dailyLimit: number;
    scope: string;
    selection?: any;
  }> {
    let def: any = null;
    if (powerRef.powerDefId) {
      def = await this.prisma.powerDef.findFirst({
        where: { OR: [{ id: powerRef.powerDefId }, { key: powerRef.powerDefId }] },
      });
      if (!def) throw new NotFoundException(`PowerDef "${powerRef.powerDefId}" not found`);
      if (!def.enabled) throw new BadRequestException(`PowerDef "${powerRef.powerDefId}" is disabled`);
    }

    // Determine effective key: PowerRef.key → powerType → effectDefId (legacy inline fallback)
    const effectiveKey: string =
      powerRef.key ?? def?.key ?? powerRef.powerType ?? powerRef.effectDefId ?? 'unknown';

    // Normalise tick_boost → tick_speed_boost for backward compatibility.
    // Inline-only powers (no powerDefId) that carry effectDefId but no powerType are
    // treated as 'effect_backed', not 'tick_speed_boost', to avoid misclassification.
    const rawType: string =
      def?.powerType ??
      powerRef.powerType ??
      (powerRef.effectDefId ? 'effect_backed' : 'tick_speed_boost');
    const powerType: string = rawType === 'tick_boost' ? 'tick_speed_boost' : rawType;

    // Raw effectDefId string (could be slug or UUID) from the def or inline PowerRef.
    const rawEffectDefId: string | null = powerRef.effectDefId !== undefined
      ? (powerRef.effectDefId ?? null)
      : (def?.effectDefId ?? null);

    // Resolve to UUID so the caller stores the correct FK value in global_active_powers.
    const effectDefId = await this.resolveEffectDefUuid(rawEffectDefId);

    const value: number = powerRef.value ?? def?.defaultValue ?? 50;
    const valueMode: string = powerRef.valueMode ?? def?.defaultValueMode ?? 'percent_add';
    const durationMinutes: number = powerRef.durationMinutes ?? def?.defaultDurationMinutes ?? 30;
    const dailyLimit: number = powerRef.dailyLimit ?? def?.defaultDailyLimit ?? 1;
    const scope: string = powerRef.scope ?? def?.defaultScope ?? 'global';
    const selection = powerRef.selection ?? def?.selection ?? undefined;

    return {
      key: effectiveKey,
      name: powerRef.name,
      powerType,
      effectDefId,
      effectOverrides: powerRef.effectOverrides,
      value,
      valueMode,
      durationMinutes,
      dailyLimit,
      scope,
      selection,
    };
  }
}
