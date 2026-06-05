import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';
import { PowerDefService } from '../../global-power/power-def.service';

function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class TriggerEntityPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private globalPowerService: GlobalPowerService,
    private powerDefService: PowerDefService,
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
    // Support new PowerRef format (key field), legacy inline format (powerType / effectDefId fields),
    // and the historical 'tick_boost' alias for 'tick_speed_boost'.
    const powerRef = powers.find((p: any) =>
      p.key === powerKey ||
      p.powerType === powerKey ||
      p.effectDefId === powerKey ||
      (powerKey === 'tick_boost' && (p.key === 'tick_speed_boost' || p.powerType === 'tick_speed_boost')),
    );

    if (!powerRef) {
      throw new BadRequestException(`Power "${powerKey}" not found for this entity`);
    }

    const resolved = await this.powerDefService.resolve(powerRef);

    const today = getUtcDay(new Date());
    const dailyLimit: number = resolved.dailyLimit;

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

    const isTickBoost = resolved.powerType === 'tick_speed_boost';

    if (!isTickBoost && !resolved.effectDefId) {
      throw new BadRequestException(`Power "${powerKey}" has no effectDefId defined. Non-tick powers must provide effectDefId.`);
    }

    // Tick-speed boosts always operate at global scope — the BoostEvent processor
    // applies to the world tick, not to individual players or entities.
    // For all other powers: use the explicit selection from PowerRef/PowerDef when provided;
    // otherwise derive a contextual selection from the resolved scope, embedding the
    // triggering identity (userId/entityId) so the effect is constrained to the correct
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
          selection = { scope: 'entity', agg: 'any', filter: { entityId } };
          break;
        case 'location':
          // Location context not available in the entity handler; fall back to global.
          selection = { scope: 'global', agg: 'any' };
          break;
        default:
          selection = { scope: 'global', agg: 'any' };
      }
    }

    await this.globalPowerService.triggerPower({
      label: `${entityName} — ${resolved.name}`,
      effectDefId: isTickBoost ? null : resolved.effectDefId,
      effectOverrides: isTickBoost
        ? { value: resolved.value, valueMode: resolved.valueMode }
        : resolved.effectOverrides,
      selection,
      durationMinutes: resolved.durationMinutes,
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

    const toastMessage = isTickBoost
      ? `⚡ ${resolved.name} activated! +${resolved.value}% world tick speed for ${resolved.durationMinutes} minutes!`
      : `${resolved.name} activated for ${resolved.durationMinutes} minutes!`;

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success', message: toastMessage }],
    };
  }
}
