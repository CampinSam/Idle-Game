import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';
import { PowerDefService } from '../../global-power/power-def.service';
import { PowerGrantService } from '../../global-power/power-grant.service';
import { PowerChargeService } from '../../global-power/power-charge.service';
import { TickService } from '../../tick/tick.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class TriggerEntityPowerHandler implements CommandHandler {
  constructor(
    private prisma: PrismaService,
    private globalPowerService: GlobalPowerService,
    private powerDefService: PowerDefService,
    private powerGrantService: PowerGrantService,
    private powerChargeService: PowerChargeService,
    private tickService: TickService,
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

    const grant = await this.powerGrantService.findActiveGrant('entity', entityId, powerKey, ctx.tx);
    if (!grant) {
      throw new NotFoundException(
        `No active power grant found for power "${powerKey}" on entity "${entityId}". ` +
        `Ensure the entity's NFT grants have been synced.`,
      );
    }

    const currentTickNum = await this.tickService.getCurrentTick();
    const currentTick = BigInt(Math.floor(currentTickNum));

    const chargeConfig = PowerChargeService.extractChargeConfig(grant.powerDef);

    const usage = await this.powerChargeService.getOrCreateEntityUsage(
      entityId,
      grant.id,
      chargeConfig,
      ctx.tx,
    );

    const afterDrip = await this.powerChargeService.applyEntityTickDrip(
      usage,
      chargeConfig,
      currentTick,
      ctx.tx,
    );

    const costPerUse = chargeConfig.costPerUse ?? 1;
    if (afterDrip < costPerUse) {
      throw new BadRequestException(
        `Insufficient charges for power "${powerKey}". ` +
        `Available: ${afterDrip}, required: ${costPerUse}.`,
      );
    }

    const powerRef = {
      key: grant.powerKey,
      powerDefId: grant.powerDefId ?? undefined,
      ...((grant.overrides as any) ?? {}),
    };
    const resolved = await this.powerDefService.resolve(powerRef);

    const isTickBoost = resolved.powerType === 'tick_speed_boost';

    if (!isTickBoost && !resolved.effectDefId) {
      throw new BadRequestException(
        `Power "${powerKey}" has no effectDefId defined. Non-tick powers must provide effectDefId.`,
      );
    }

    let selection: any;
    if (isTickBoost) {
      selection = { scope: 'global', agg: 'any' };
    } else if (resolved.selection) {
      selection = resolved.selection;
    } else {
      switch (resolved.scope) {
        case 'player':
          selection = { scope: 'player', agg: 'self' };
          break;
        case 'entity':
          selection = { scope: 'entity', agg: 'any', filter: { userId: ctx.userId } };
          break;
        case 'location': {
          const assignment = await (this.prisma as any).locationWorkerAssignment.findFirst({
            where: { entityId },
            select: { locationId: true },
          });
          if (!assignment?.locationId) {
            throw new BadRequestException(
              `Cannot activate location-scoped power "${resolved.name}": entity is not assigned to any location.`,
            );
          }
          selection = { scope: 'entity', agg: 'any', filter: { locationId: assignment.locationId } };
          break;
        }
        default:
          selection = { scope: 'global', agg: 'any' };
      }
    }

    const entityName = (entity.display as any)?.name || entity.speciesId || 'Entity';

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

    const usageAfterDrip: import('../../global-power/power-charge.service').ChargeUsageSnapshot = {
      id: usage.id,
      chargeUnits: afterDrip,
      lastChargeAppliedAt: usage.lastChargeAppliedAt,
    };

    await this.powerChargeService.deductEntityCharge(
      usageAfterDrip,
      costPerUse,
      grant.id,
      currentTick,
      ctx.userId,
      ctx.tx,
    );

    const finalChargeUnits = afterDrip - costPerUse;

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);

    pb.upsert('entityPowerUsage', entityId, {
      [grant.powerKey]: {
        grantId: grant.id,
        chargeUnits: finalChargeUnits,
        maxChargeUnits: chargeConfig.maxChargeUnits ?? 1,
      },
    });

    const powerTitle = isTickBoost ? 'Tick Boost Activated!' : 'Power Activated!';
    const powerBody = isTickBoost
      ? `⚡ ${resolved.name}: +${resolved.value}% world tick speed for ${resolved.durationMinutes} min!`
      : `${resolved.name} activated for ${resolved.durationMinutes} minutes!`;

    const notification = await this.notificationService.createForCommandSilent({
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
      ui: [],
    };
  }
}
