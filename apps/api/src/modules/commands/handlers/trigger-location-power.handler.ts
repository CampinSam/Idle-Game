import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { BoostService } from '../../tick/boost.service';
import { GlobalPowerService } from '../../global-power/global-power.service';

function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class TriggerLocationPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private boostService: BoostService,
    private globalPowerService: GlobalPowerService,
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
    const power = powers.find((p: any) => p.powerType === powerKey);

    if (!power) {
      throw new BadRequestException(`Power "${powerKey}" not found for this location`);
    }

    const today = getUtcDay(new Date());
    const dailyLimit: number = typeof power.dailyLimit === 'number' && power.dailyLimit > 0
      ? power.dailyLimit
      : 1;

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

    // Activate the power. Both service methods use this.prisma internally and
    // commit their own writes before broadcasting SSE — ensuring SSE payloads
    // always reflect fully-committed state.
    if (power.powerType === 'tick_boost') {
      const percentBoost = typeof power.value === 'number' ? power.value : 50;
      const multiplier = 1 + percentBoost / 100;
      const locationName = location.name || location.definition?.id || 'Unique Outpost';

      await this.boostService.createBoost({
        name: `${locationName} Tick Boost`,
        description: `Triggered by unique location power from ${nftAssetId}`,
        multiplier,
        percentBoost,
        durationMinutes: power.durationMinutes,
        userId: ctx.userId,
      });
    } else {
      await this.globalPowerService.triggerPower({
        label: `${location.name || nftAssetId} — ${powerKey}`,
        powerType: power.powerType,
        value: power.value,
        durationMinutes: power.durationMinutes,
        triggeredByUserId: ctx.userId,
      });
    }

    // Record usage after successful activation. Ordering is intentional: if
    // activation throws, usage is never incremented. If the usage write fails
    // after a successful activation (rare), the power remains active and the
    // counter is simply not tracked for this use — acceptable given idempotency
    // keys prevent duplicate command invocations.
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

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    const toastMessage = power.powerType === 'tick_boost'
      ? `⚡ World Tick boosted +${typeof power.value === 'number' ? power.value : 50}% for ${power.durationMinutes} minutes!`
      : `Power "${powerKey}" activated for ${power.durationMinutes} minutes!`;

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success', message: toastMessage }],
    };
  }
}
