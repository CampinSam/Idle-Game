import { Injectable, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import {
  PatchBuilder,
  buildLocationPatches,
  buildCurrencyPatches,
  buildItemPatches,
} from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class DepositLocationXpHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, costOption, charges } = payload || {};

    if (!locationId || typeof locationId !== 'string') {
      throw new BadRequestException('locationId is required');
    }
    if (!costOption || typeof costOption !== 'object') {
      throw new BadRequestException('costOption is required');
    }
    if (costOption.type !== 'currency' && costOption.type !== 'item') {
      throw new BadRequestException('costOption.type must be currency or item');
    }
    if (typeof costOption.id !== 'string' || typeof costOption.amount !== 'number') {
      throw new BadRequestException('costOption.id and costOption.amount are required');
    }

    const chargesNum = typeof charges === 'number' && charges > 0 ? Math.floor(charges) : 1;

    const result = await this.locationService.depositLocationXp(
      ctx.userId,
      locationId,
      { type: costOption.type, id: costOption.id, amount: costOption.amount },
      chargesNum,
      ctx.tx,
    );

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    if (costOption.type === 'currency') {
      await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    } else {
      await buildItemPatches(pb, ctx.tx, ctx.userId);
    }
    // Push the level-up notification through the same patch stream so the
    // client's NotificationContext (driven from sync patches) sees it
    // immediately — required for both the in-page auto-open flow and the
    // notification-tap flow.
    if (result.notification) {
      pb.upsertNotification(result.notification);
    }

    const body = result.leveledUp
      ? `Outpost reached Level ${result.newLevel}!`
      : `+${result.xpGained} XP deposited`;
    const title = result.leveledUp ? 'Level Up!' : 'XP Deposited';

    // For level-up, the locationService already created a location_level_up notification;
    // re-use it as the command feedback so the drawer shows one entry, not two.
    // For a plain XP deposit, create a lightweight command notification.
    let commandNotifId: string;
    if (result.notification) {
      commandNotifId = result.notification.id;
    } else {
      const newNotif = await this.notificationService.createForCommand({
        userId: ctx.userId,
        type: 'xp_deposited',
        category: 'location',
        title,
        body,
      }, ctx.tx);
      pb.upsertNotification(newNotif);
      commandNotifId = newNotif.id;
    }

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: commandNotifId }],
    };
  }
}
