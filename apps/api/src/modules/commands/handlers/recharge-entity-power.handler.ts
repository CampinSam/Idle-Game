import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { PowerGrantService } from '../../global-power/power-grant.service';
import { PowerChargeService } from '../../global-power/power-charge.service';
import { TickService } from '../../tick/tick.service';
import { CurrencyService } from '../../currency/currency.service';

@Injectable()
export class RechargeEntityPowerHandler implements CommandHandler {
  constructor(
    private powerGrantService: PowerGrantService,
    private powerChargeService: PowerChargeService,
    private tickService: TickService,
    private currencyService: CurrencyService,
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
      select: { id: true, ownerUserId: true, display: true, speciesId: true },
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
        `No active power grant found for power "${powerKey}" on entity "${entityId}".`,
      );
    }

    const chargeConfig = PowerChargeService.extractChargeConfig(grant.powerDef);

    // Find the RESOURCE_SPEND recharge rule.
    const resourceRule = (chargeConfig.rechargeRules ?? []).find(
      (r): r is Extract<NonNullable<typeof chargeConfig.rechargeRules>[number], { type: 'RESOURCE_SPEND' }> =>
        r.type === 'RESOURCE_SPEND',
    );
    if (!resourceRule) {
      throw new BadRequestException(
        `Power "${powerKey}" does not support resource-based recharging. ` +
        `Add a RESOURCE_SPEND recharge rule to its chargeConfig.`,
      );
    }

    // Gate check: 'owner' (default) requires the requester to own the entity.
    // 'everyone' is already satisfied by reaching this point (anyone can request).
    const gate = resourceRule.gate ?? 'owner';
    if (gate === 'owner' && !isAdmin && entity.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('Only the owner may recharge this power');
    }

    if (!Array.isArray(resourceRule.cost) || resourceRule.cost.length === 0) {
      throw new BadRequestException(
        `Power "${powerKey}" RESOURCE_SPEND rule has no cost defined.`,
      );
    }

    const currentTickNum = await this.tickService.getCurrentTick();
    const currentTick = BigInt(Math.floor(currentTickNum));

    // Apply tick drip first so we know the current charge level.
    const usage = await this.powerChargeService.getOrCreateEntityUsage(
      entityId,
      grant.id,
      chargeConfig,
      ctx.tx,
    );
    const currentUnits = await this.powerChargeService.applyEntityTickDrip(
      usage,
      chargeConfig,
      currentTick,
      ctx.tx,
    );

    const maxChargeUnits = chargeConfig.maxChargeUnits ?? 1;
    if (currentUnits >= maxChargeUnits) {
      throw new BadRequestException(
        `Power "${powerKey}" is already at maximum charge (${currentUnits}/${maxChargeUnits}).`,
      );
    }

    // Deduct each currency cost inside the transaction.
    for (const costItem of resourceRule.cost) {
      await this.currencyService.spendTx(ctx.tx, {
        userId: ctx.userId,
        currencyId: costItem.currencyId,
        amount: costItem.amount,
        reason: `recharge_power:${powerKey}`,
        sourceType: 'power_recharge',
        sourceId: grant.id,
      });
    }

    // Add the recharge units, capped at max.
    const rechargedUnits = Math.min(currentUnits + resourceRule.units, maxChargeUnits);
    await (ctx.tx as any).entityPowerUsage.update({
      where: { id: usage.id },
      data: { chargeUnits: rechargedUnits },
    });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);

    pb.upsert('entityPowerUsage', entityId, {
      [powerKey]: {
        grantId: grant.id,
        chargeUnits: rechargedUnits,
        maxChargeUnits,
      },
    });

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
