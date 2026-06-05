import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildActiveJobPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class UpgradeBuildingHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingId } = payload;

    await this.locationService.upgradeBuilding(ctx.userId, locationId, buildingId, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildActiveJobPatches(pb, ctx.tx, ctx.userId);

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'upgrade_started',
      category: 'locations',
      title: 'Upgrade Started',
      body: 'Building upgrade has begun.',
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
