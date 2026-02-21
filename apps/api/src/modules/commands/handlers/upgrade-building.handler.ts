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
      fetchFullLocation(this.prisma, locationId),
      fetchBuildingJobs(this.prisma, ctx.userId),
      fetchCurrencyIds(this.prisma),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    const currencyMap = await fetchCurrencyMap(this.prisma, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const jobs = await this.prisma.job.findMany({
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
