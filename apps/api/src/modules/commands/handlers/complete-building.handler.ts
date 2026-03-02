import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class CompleteBuildingHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingId } = payload;

    const result = await this.locationService.completeBuilding(ctx.userId, locationId, buildingId, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    const completedJobs = await (ctx.tx as any).job.findMany({
      where: { userId: ctx.userId, type: 'BuildingJob', status: { in: ['completed', 'collected'] } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    for (const job of completedJobs) pb.upsertJob(job);

    if (result.updatedNotification) pb.upsertNotification(result.updatedNotification);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success' as const, message: 'Construction complete!' }],
    };
  }
}
