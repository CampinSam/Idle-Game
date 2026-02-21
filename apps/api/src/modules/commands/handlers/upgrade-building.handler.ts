import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyMap, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class UpgradeBuildingHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingId } = payload;

    await this.locationService.upgradeBuilding(ctx.userId, locationId, buildingId);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(ctx.tx, locationId),
      fetchBuildingJobs(ctx.tx, ctx.userId),
      fetchCurrencyIds(ctx.tx),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    const currencyMap = await fetchCurrencyMap(ctx.tx, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const jobs = await ctx.tx.job.findMany({
      where: { userId: ctx.userId, status: { in: ['active', 'ready_notified'] } },
    });
    for (const job of jobs) pb.upsertJob(job);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'info' as const,
          message: 'Upgrade started!',
        },
      ],
    };
  }
}
