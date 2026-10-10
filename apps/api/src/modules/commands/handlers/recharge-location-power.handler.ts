import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { PowerGrantService } from '../../global-power/power-grant.service';
import { PowerChargeService } from '../../global-power/power-charge.service';
import { TickService } from '../../tick/tick.service';
import { CurrencyService } from '../../currency/currency.service';

@Injectable()
export class RechargeLocationPowerHandler implements CommandHandler {
  constructor(
    private powerGrantService: PowerGrantService,
    private powerChargeService: PowerChargeService,
    private tickService: TickService,
    private currencyService: CurrencyService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, powerKey } = payload || {};

    if (!locationId || typeof locationId !== 'string') {
      throw new BadRequestException('locationId is required');
    }
    if (!powerKey || typeof powerKey !== 'string') {
      throw new BadRequestException('powerKey is required');
    }

    const location = await (ctx.tx as any).locationInstance.findUnique({
      where: { id: locationId },
      select: { id: true, ownerUserId: true },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const user = await (ctx.tx as any).user.findUnique({
      where: { id: ctx.userId },
      select: { flags: true },
    });
    const isAdmin = user && typeof user.flags === 'object' && user.flags !== null
      && (user.flags as Record<string, unknown>).isAdmin === true;

    const grant = await this.powerGrantService.findActiveGrant('location', locationId, powerKey, ctx.tx);
    if (!grant) {
      throw new NotFoundException(
        `No active power grant found for power "${powerKey}" on location "${locationId}".`,
      );
    }

    // Merge grant overrides into chargeConfig so overridden charge fields take effect.
    const chargeConfig = PowerChargeService.extractChargeConfig(
      grant.powerDef,
      grant.overrides as Record<string, any> | null,
    );

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

    // Gate check: 'owner' (default) requires the requester to own the location.
    // 'everyone' allows any authenticated player to contribute.
    const gate = resourceRule.gate ?? 'owner';
    if (gate === 'owner' && !isAdmin && location.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('Only the location owner may recharge this power');
    }

    if (!Array.isArray(resourceRule.cost) || resourceRule.cost.length === 0) {
      throw new BadRequestException(
        `Power "${powerKey}" RESOURCE_SPEND rule has no cost defined.`,
      );
    }

    const currentTickNum = await this.tickService.getCurrentTick();
    const currentTick = BigInt(Math.floor(currentTickNum));

    const usage = await this.powerChargeService.getOrCreateLocationUsage(
      locationId,
      grant.id,
      chargeConfig,
      ctx.tx,
    );
    const currentUnits = await this.powerChargeService.applyLocationTickDrip(
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

    // Add the recharge units, clamped to [0, max].
    const rechargedUnits = Math.min(Math.max(0, currentUnits + resourceRule.units), maxChargeUnits);
    await (ctx.tx as any).locationPowerUsage.update({
      where: { id: usage.id },
      data: { chargeUnits: rechargedUnits },
    });

    const pb = new PatchBuilder();
    pb.upsert('locationPowerUsage', locationId, {
      [powerKey]: {
        grantId: grant.id,
        chargeUnits: rechargedUnits,
        maxChargeUnits,
      },
    });
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
