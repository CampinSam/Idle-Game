import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildActiveJobPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class BuildBuildingHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingDefId } = payload;

    await this.locationService.buildBuilding(ctx.userId, locationId, buildingDefId, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildActiveJobPatches(pb, ctx.tx, ctx.userId);

    const buildingJob = await (ctx.tx as any).job.findFirst({
      where: { userId: ctx.userId, type: 'building', status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'construction_started',
      category: 'locations',
      title: 'Construction Started',
      body: 'Building construction has begun.',
      deepLink: buildingJob ? { jobId: buildingJob.id } : { locationId, screen: `/locations/${locationId}` },
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
