import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';

function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class TriggerEntityPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private globalPowerService: GlobalPowerService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { entityId, powerKey } = payload || {};

    if (!entityId || typeof entityId !== 'string') {
      throw new BadRequestException('entityId is required');
    }
    if (!powerKey || typeof powerKey !== 'string') {
      throw new BadRequestException('powerKey is required');
    }

    const entity = await (ctx.tx as any).entity.findUnique({
      where: { id: entityId },
      include: { definition: true, equipment: true },
    });

    if (!entity) {
      throw new NotFoundException('Entity not found');
    }

    const user = await (ctx.tx as any).user.findUnique({
      where: { id: ctx.userId },
      select: { flags: true },
    });
    const isAdmin = user && typeof user.flags === 'object' && user.flags !== null
      && (user.flags as Record<string, unknown>).isAdmin === true;

    if (!isAdmin && entity.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('You do not own this entity');
    }

    const nftAssetId: string | null = entity.nftAssetId;
    if (!nftAssetId) {
      throw new BadRequestException('This entity has no NFT asset ID');
    }

    const rules = (entity.definition?.rules as any) || {};
    const uniques: Record<string, any> = rules.uniques || {};
    const uniqueEntry = uniques[nftAssetId];

    if (!uniqueEntry) {
      throw new BadRequestException('This entity has no unique powers defined');
    }

    const powers: any[] = uniqueEntry.powers || [];
    const power = powers.find((p: any) => p.powerType === powerKey);

    if (!power) {
      throw new BadRequestException(`Power "${powerKey}" not found for this entity`);
    }

    const today = getUtcDay(new Date());
    const dailyLimit: number = typeof power.dailyLimit === 'number' && power.dailyLimit > 0
      ? power.dailyLimit
      : 1;

    const existingUsage = await (this.prisma as any).entityPowerUsage.findUnique({
      where: {
        entityId_powerKey: {
          entityId,
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

    const entityName = (entity.display as any)?.name || entity.speciesId || 'Entity';

    // Remap legacy tick_boost powerType to the canonical tick_speed_boost global power type.
    const resolvedPowerType = power.powerType === 'tick_boost' ? 'tick_speed_boost' : power.powerType;
    const percentBoost = typeof power.value === 'number' ? power.value : 50;

    await this.globalPowerService.triggerPower({
      label: power.powerType === 'tick_boost'
        ? `${entityName} — Global Tick Boost`
        : `${entityName} — ${powerKey}`,
      powerType: resolvedPowerType,
      value: power.powerType === 'tick_boost' ? percentBoost : power.value,
      valueMode: power.powerType === 'tick_boost' ? 'percent_add' : undefined,
      durationMinutes: power.durationMinutes,
      triggeredByUserId: ctx.userId,
    });

    if (existingUsage && existingUsage.lastUsedUtcDay === today) {
      await (this.prisma as any).entityPowerUsage.update({
        where: {
          entityId_powerKey: { entityId, powerKey },
        },
        data: { usageCount: { increment: 1 } },
      });
    } else if (existingUsage) {
      await (this.prisma as any).entityPowerUsage.update({
        where: {
          entityId_powerKey: { entityId, powerKey },
        },
        data: { lastUsedUtcDay: today, usageCount: 1 },
      });
    } else {
      await (this.prisma as any).entityPowerUsage.create({
        data: { entityId, powerKey, lastUsedUtcDay: today, usageCount: 1 },
      });
    }

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);


    const allUsagesForEntity = await (this.prisma as any).entityPowerUsage.findMany({
      where: { entityId, lastUsedUtcDay: today },
      select: { powerKey: true, usageCount: true, lastUsedUtcDay: true },
    });
    const usageMap: Record<string, { usageCount: number; lastUsedUtcDay: string }> = {};
    for (const u of allUsagesForEntity) {
      usageMap[u.powerKey] = { usageCount: u.usageCount, lastUsedUtcDay: u.lastUsedUtcDay };
    }
    pb.upsert('entityPowerUsage', entityId, usageMap);

    const toastMessage = power.powerType === 'tick_boost'
      ? `⚡ Global Tick Boost activated! +${percentBoost}% world tick speed for ${power.durationMinutes} minutes!`
      : `Power "${powerKey}" activated for ${power.durationMinutes} minutes!`;

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success', message: toastMessage }],
    };
  }
}
