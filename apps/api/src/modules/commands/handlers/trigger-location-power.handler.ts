import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { PrismaService } from '../../../prisma/prisma.service';
import { GlobalPowerService } from '../../global-power/global-power.service';
import { PowerDefService } from '../../global-power/power-def.service';
import { PowerGrantService } from '../../global-power/power-grant.service';
import { PowerChargeService, ChargeUsageSnapshot } from '../../global-power/power-charge.service';
import { TickService } from '../../tick/tick.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class TriggerLocationPowerHandler implements CommandHandler {
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
    const { locationId, powerKey } = payload || {};

    if (!locationId || typeof locationId !== 'string') {
      throw new BadRequestException('locationId is required');
    }
    if (!powerKey || typeof powerKey !== 'string') {
      throw new BadRequestException('powerKey is required');
    }

    const location = await (ctx.tx as any).locationInstance.findUnique({
      where: { id: locationId },
      include: { definition: true },
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

    if (!isAdmin && location.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('You do not own this location');
    }

    const grant = await this.powerGrantService.findActiveGrant('location', locationId, powerKey, ctx.tx);
    if (!grant) {
      throw new NotFoundException(
        `No active power grant found for power "${powerKey}" on location "${locationId}". ` +
        `Ensure the location's NFT grants have been synced.`,
      );
    }

    const currentTickNum = await this.tickService.getCurrentTick();
    const currentTick = BigInt(Math.floor(currentTickNum));

    const chargeConfig = PowerChargeService.extractChargeConfig(grant.powerDef);
    const costPerUse = chargeConfig.costPerUse ?? 1;

    // ── 1. Cooldown check ─────────────────────────────────────────────────────
    if ((chargeConfig.cooldownTicks ?? 0) > 0) {
      await this.powerChargeService.checkCooldown(grant.id, chargeConfig.cooldownTicks!, currentTick, ctx.tx);
    }

    // ── 2. Rate-limit check ───────────────────────────────────────────────────
    if (chargeConfig.rateLimits && chargeConfig.rateLimits.length > 0) {
      await this.powerChargeService.checkRateLimits(grant.id, chargeConfig.rateLimits, currentTick, ctx.tx);
    }

    // ── 3. Get/create charge pool and apply tick drip ─────────────────────────
    const usage = await this.powerChargeService.getOrCreateLocationUsage(
      locationId,
      grant.id,
      chargeConfig,
      ctx.tx,
    );

    const afterDrip = await this.powerChargeService.applyLocationTickDrip(
      usage,
      chargeConfig,
      currentTick,
      ctx.tx,
    );

    if (afterDrip < costPerUse) {
      throw new BadRequestException(
        `Insufficient charges for power "${powerKey}". ` +
        `Available: ${afterDrip}, required: ${costPerUse}.`,
      );
    }

    // ── 4. Resolve power definition ───────────────────────────────────────────
    const powerRef = {
      key: grant.powerKey,
      powerDefId: grant.powerDefId ?? undefined,
      ...((grant.overrides as any) ?? {}),
    };
    const resolved = await this.powerDefService.resolve(powerRef);

    const isTickBoost = resolved.powerType === 'tick_speed_boost';
    const locationName = location.name || location.definition?.id || 'Unique Outpost';

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
          selection = { scope: 'entity', agg: 'any', filter: { userId: ctx.userId, locationId } };
          break;
        case 'location':
          selection = { scope: 'entity', agg: 'any', filter: { locationId } };
          break;
        default:
          selection = { scope: 'global', agg: 'any' };
      }
    }

    // ── 5. Deduct charge BEFORE activation to prevent free uses on failure ────
    const usageAfterDrip: ChargeUsageSnapshot = {
      id: usage.id,
      chargeUnits: afterDrip,
      lastChargeAppliedAt: usage.lastChargeAppliedAt,
    };

    await this.powerChargeService.deductLocationCharge(
      usageAfterDrip,
      costPerUse,
      grant.id,
      currentTick,
      ctx.userId,
      ctx.tx,
      'location',
      locationId,
    );

    // ── 6. Activate the power ─────────────────────────────────────────────────
    await this.globalPowerService.triggerPower({
      label: `${locationName} — ${resolved.name}`,
      effectDefId: isTickBoost ? null : resolved.effectDefId,
      effectOverrides: isTickBoost
        ? { value: resolved.value, valueMode: resolved.valueMode }
        : { ...resolved.effectOverrides, value: resolved.value, valueMode: resolved.valueMode },
      selection,
      durationMinutes: resolved.durationMinutes,
      triggeredByUserId: ctx.userId,
    });

    const finalChargeUnits = afterDrip - costPerUse;

    const pb = new PatchBuilder();
    pb.upsert('locationPowerUsage', locationId, {
      [grant.powerKey]: {
        grantId: grant.id,
        chargeUnits: finalChargeUnits,
        maxChargeUnits: chargeConfig.maxChargeUnits ?? 1,
      },
    });
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

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
      deepLink: { locationId, screen: `/locations/${locationId}` },
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}

