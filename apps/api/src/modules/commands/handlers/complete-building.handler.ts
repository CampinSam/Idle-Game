import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CompleteBuildingHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingId } = payload;

    await this.locationService.completeBuilding(ctx.userId, locationId, buildingId);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(ctx.tx, locationId),
      fetchBuildingJobs(ctx.tx, ctx.userId),
      fetchCurrencyIds(ctx.tx),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    const completedJobs = await ctx.tx.job.findMany({
      where: { userId: ctx.userId, type: 'BuildingJob', status: { in: ['completed', 'collected'] } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    for (const job of completedJobs) pb.upsertJob(job);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: 'Construction complete!',
        },
      ],
    };
  }
}
