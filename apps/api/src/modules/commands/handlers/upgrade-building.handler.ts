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

    const buildingJob = await (ctx.tx as any).job.findFirst({
      where: { userId: ctx.userId, type: 'building', status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const notification = buildingJob
      ? await this.notificationService.upsertJobNotification({
          userId: ctx.userId,
          jobId: buildingJob.id,
          type: 'upgrade_started',
          category: 'locations',
          priority: 'normal',
          title: 'Upgrade Started',
          body: 'Building upgrade has begun.',
          deepLink: { jobId: buildingJob.id },
        }, ctx.tx)
      : await this.notificationService.createForCommand({
          userId: ctx.userId,
          type: 'upgrade_started',
          category: 'locations',
          title: 'Upgrade Started',
          body: 'Building upgrade has begun.',
          deepLink: { locationId, screen: `/locations/${locationId}` },
        }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
