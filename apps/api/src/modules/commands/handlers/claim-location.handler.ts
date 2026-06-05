import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildItemPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class ClaimLocationHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId } = payload;

    await this.locationService.claimLocation(ctx.userId, locationId, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'resources_claimed',
      category: 'location',
      title: 'Resources Claimed',
      body: 'Location resources have been collected.',
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
