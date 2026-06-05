import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';
import { PowerDefService } from '../../global-power/power-def.service';
import { NotificationService } from '../../notification/notification.service';

function getUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class TriggerEntityPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private globalPowerService: GlobalPowerService,
    private powerDefService: PowerDefService,
    private notificationService: NotificationService,
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
    // Use the canonical key returned by resolve() for all usage accounting so that
    // alias variants (e.g. 'tick_boost' → 'tick_speed_boost') map to the same row
    // and cannot bypass the daily limit by using a different alias.
    const canonicalKey = resolved.key;

    const today = getUtcDay(new Date());
    const dailyLimit: number = resolved.dailyLimit;

    const existingUsage = await (this.prisma as any).entityPowerUsage.findUnique({
      where: {
        entityId_powerKey: {
          entityId,
          powerKey: canonicalKey,
        },
      },
    });

    if (existingUsage && existingUsage.lastUsedUtcDay === today
        && existingUsage.usageCount >= dailyLimit) {
      throw new BadRequestException(
        `Daily limit reached for power "${canonicalKey}". Resets at 00:00 UTC.`,
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
      // Derive selection from the resolved scope. 'player' → player-level effect
      // for triggering player only; 'entity' → all entities of the player;
      // 'location' → entities at the entity's current location.
      switch (resolved.scope) {
        case 'player':
          // Player-level effects (timer speeds, keeper XP, mission power, etc.) are
          // resolved via resolveForTarget(userId, PLAYER, ...). Use scope:'player' +
          // agg:'self' so the power only applies to the triggering player.
          selection = { scope: 'player', agg: 'self' };
          break;
        case 'entity':
          // Apply to all entities owned by the triggering user.
          selection = { scope: 'entity', agg: 'any', filter: { userId: ctx.userId } };
          break;
        case 'location': {
          // Apply to entities at the location this entity is currently assigned to.
          // resolveForTarget() populates context.locationId from LocationWorkerAssignment
          // so matchesSelection() can gate on it.
          const assignment = await (this.prisma as any).locationWorkerAssignment.findFirst({
            where: { entityId },
            select: { locationId: true },
          });
          if (!assignment?.locationId) {
            throw new BadRequestException(
              `Cannot activate location-scoped power "${resolved.name ?? resolved.key}": entity is not assigned to any location.`,
            );
          }
          selection = { scope: 'entity', agg: 'any', filter: { locationId: assignment.locationId } };
          break;
        }
        default:
          selection = { scope: 'global', agg: 'any' };
      }
    }

    await this.globalPowerService.triggerPower({
      label: `${entityName} — ${resolved.name}`,
      effectDefId: isTickBoost ? null : resolved.effectDefId,
      effectOverrides: isTickBoost
        ? { value: resolved.value, valueMode: resolved.valueMode }
        : { ...resolved.effectOverrides, value: resolved.value, valueMode: resolved.valueMode },
      selection,
      durationMinutes: resolved.durationMinutes,
      triggeredByUserId: ctx.userId,
    });

    if (existingUsage && existingUsage.lastUsedUtcDay === today) {
      await (this.prisma as any).entityPowerUsage.update({
        where: {
          entityId_powerKey: { entityId, powerKey: canonicalKey },
        },
        data: { usageCount: { increment: 1 } },
      });
    } else if (existingUsage) {
      await (this.prisma as any).entityPowerUsage.update({
        where: {
          entityId_powerKey: { entityId, powerKey: canonicalKey },
        },
        data: { lastUsedUtcDay: today, usageCount: 1 },
      });
    } else {
      await (this.prisma as any).entityPowerUsage.create({
        data: { entityId, powerKey: canonicalKey, lastUsedUtcDay: today, usageCount: 1 },
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

    const powerTitle = isTickBoost ? 'Tick Boost Activated!' : 'Power Activated!';
    const powerBody = isTickBoost
      ? `⚡ ${resolved.name}: +${resolved.value}% world tick speed for ${resolved.durationMinutes} min!`
      : `${resolved.name} activated for ${resolved.durationMinutes} minutes!`;

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'power_activated',
      category: 'system',
      title: powerTitle,
      body: powerBody,
      deepLink: { entityId, screen: `/entities/${entityId}` },
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
