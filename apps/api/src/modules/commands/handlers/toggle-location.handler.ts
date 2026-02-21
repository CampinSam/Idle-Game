import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ToggleLocationHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, enabled } = payload;

    await this.locationService.toggleLocationEnabled(ctx.userId, locationId, enabled);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(ctx.tx, locationId),
      fetchBuildingJobs(ctx.tx, ctx.userId),
      fetchCurrencyIds(ctx.tx),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'info' as const,
          message: enabled ? 'Location enabled' : 'Location disabled',
        },
      ],
    };
  }
}
