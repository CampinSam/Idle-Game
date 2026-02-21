import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyMap, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ClaimLocationHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId } = payload;
    const tx = ctx.tx as any;

    await this.locationService.claimLocation(ctx.userId, locationId, tx);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(tx, locationId),
      fetchBuildingJobs(tx, ctx.userId),
      fetchCurrencyIds(tx),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    const currencyMap = await fetchCurrencyMap(tx, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const items = await tx.itemInstance.findMany({
      where: { userId: ctx.userId },
      include: { definition: true },
    });
    for (const item of items) pb.upsertItem(item);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: 'Resources claimed!',
        },
      ],
    };
  }
}
