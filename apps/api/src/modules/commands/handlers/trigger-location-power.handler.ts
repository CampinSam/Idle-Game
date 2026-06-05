import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';
import { PowerDefService } from '../../global-power/power-def.service';

function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class TriggerLocationPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private globalPowerService: GlobalPowerService,
    private powerDefService: PowerDefService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, powerKey } = payload || {};

    if (!locationId || typeof locationId !== 'string') {
      throw new BadRequestException('locationId is required');
    }
    if (!powerKey || typeof powerKey !== 'string') {
      throw new BadRequestException('powerKey is required');
    }

    // Reads use ctx.tx so they observe the same snapshot as other command-scoped reads
    // under the player lock (same-user requests are serialized).
    const location = await (ctx.tx as any).locationInstance.findUnique({
      where: { id: locationId },
      include: { definition: true },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // Users with flags.isAdmin === true bypass ownership checks (support/testing).
    const user = await (ctx.tx as any).user.findUnique({
      where: { id: ctx.userId },
      select: { flags: true },
    });
    const isAdmin = user && typeof user.flags === 'object' && user.flags !== null
      && (user.flags as Record<string, unknown>).isAdmin === true;

    if (!isAdmin && location.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('You do not own this location');
    }

    const nftAssetId: string | null = location.nftAssetId;
    if (!nftAssetId) {
      throw new BadRequestException('This location has no NFT asset ID');
    }

    const rules = (location.definition?.rules as any) || {};
    const uniques: Record<string, any> = rules.uniques || {};
    const uniqueEntry = uniques[nftAssetId];

    if (!uniqueEntry) {
      throw new BadRequestException('This location has no unique powers defined');
    }

    const powers: any[] = uniqueEntry.powers || [];
    // Support new PowerRef format (key field), legacy inline format (powerType / effectDefId fields),
    // and the historical 'tick_boost' alias for 'tick_speed_boost'.
    const powerRef = powers.find((p: any) =>
      p.key === powerKey ||
      p.powerType === powerKey ||
      p.effectDefId === powerKey ||
      (powerKey === 'tick_boost' && (p.key === 'tick_speed_boost' || p.powerType === 'tick_speed_boost')),
    );

    if (!powerRef) {
      throw new BadRequestException(`Power "${powerKey}" not found for this location`);
    }

    const resolved = await this.powerDefService.resolve(powerRef);

    const today = getUtcDay(new Date());
    const dailyLimit: number = resolved.dailyLimit;

    // Daily limit check reads committed data via this.prisma (outside ctx.tx).
    // Concurrent invocations for the same user are prevented by the player lock.
    const existingUsage = await (this.prisma as any).locationPowerUsage.findUnique({
      where: {
        locationInstanceId_powerKey: {
          locationInstanceId: locationId,
          powerKey,
        },
      },
    });

    if (existingUsage && existingUsage.lastUsedUtcDay === today
        && existingUsage.usageCount >= dailyLimit) {
      throw new BadRequestException(
        `Daily limit reached for power "${powerKey}". Resets at 00:00 UTC.`,
      );
    }

    const isTickBoost = resolved.powerType === 'tick_speed_boost';
    const locationName = location.name || location.definition?.id || 'Unique Outpost';

    if (!isTickBoost && !resolved.effectDefId) {
      throw new BadRequestException(`Power "${powerKey}" has no effectDefId defined. Non-tick powers must provide effectDefId.`);
    }

    // Tick-speed boosts always operate at global scope — the BoostEvent processor
    // applies to the world tick, not to individual players or entities.
    // For all other powers: use the explicit selection from PowerRef/PowerDef when provided;
    // otherwise derive a contextual selection from the resolved scope, embedding the
    // triggering identity (userId/locationId) so the effect is constrained to the correct
    // target rather than all targets of that scope type.
    let selection: any;
    if (isTickBoost) {
      selection = { scope: 'global', agg: 'any' };
    } else if (resolved.selection) {
      selection = resolved.selection;
    } else {
      switch (resolved.scope) {
        case 'player':
          selection = { scope: 'player', agg: 'any', filter: { userId: ctx.userId } };
          break;
        case 'entity':
          // Entity context not available in the location handler; use player filter.
          selection = { scope: 'player', agg: 'any', filter: { userId: ctx.userId } };
          break;
        case 'location':
          selection = { scope: 'location', agg: 'any', filter: { locationId } };
          break;
        default:
          selection = { scope: 'global', agg: 'any' };
      }
    }

    await this.globalPowerService.triggerPower({
      label: `${locationName} — ${resolved.name}`,
      effectDefId: isTickBoost ? null : resolved.effectDefId,
      effectOverrides: isTickBoost
        ? { value: resolved.value, valueMode: resolved.valueMode }
        : resolved.effectOverrides,
      selection,
      durationMinutes: resolved.durationMinutes,
      triggeredByUserId: ctx.userId,
    });

    // Record usage after successful activation. Ordering is intentional: if
    // activation throws, usage is never incremented.
    if (existingUsage && existingUsage.lastUsedUtcDay === today) {
      await (this.prisma as any).locationPowerUsage.update({
        where: {
          locationInstanceId_powerKey: { locationInstanceId: locationId, powerKey },
        },
        data: { usageCount: { increment: 1 } },
      });
    } else if (existingUsage) {
      // New UTC day — reset counter
      await (this.prisma as any).locationPowerUsage.update({
        where: {
          locationInstanceId_powerKey: { locationInstanceId: locationId, powerKey },
        },
        data: { lastUsedUtcDay: today, usageCount: 1 },
      });
    } else {
      await (this.prisma as any).locationPowerUsage.create({
        data: { locationInstanceId: locationId, powerKey, lastUsedUtcDay: today, usageCount: 1 },
      });
    }

    const updatedUsageRows = await (this.prisma as any).locationPowerUsage.findMany({
      where: { locationInstanceId: locationId, lastUsedUtcDay: today },
      select: { powerKey: true, usageCount: true, lastUsedUtcDay: true },
    });
    const usageMap: Record<string, { usageCount: number; lastUsedUtcDay: string }> = {};
    for (const row of updatedUsageRows) {
      usageMap[row.powerKey] = { usageCount: row.usageCount, lastUsedUtcDay: row.lastUsedUtcDay };
    }

    const pb = new PatchBuilder();
    pb.upsert('locationPowerUsage', locationId, usageMap);
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    const toastMessage = isTickBoost
      ? `⚡ ${resolved.name} activated! +${resolved.value}% world tick speed for ${resolved.durationMinutes} minutes!`
      : `${resolved.name} activated for ${resolved.durationMinutes} minutes!`;

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success', message: toastMessage }],
    };
  }
}
