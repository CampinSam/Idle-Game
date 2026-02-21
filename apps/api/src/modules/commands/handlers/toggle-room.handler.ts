import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ToggleRoomHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, roomId, enabled } = payload;

    await this.locationService.toggleRoomEnabled(ctx.userId, locationId, roomId, enabled);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(this.prisma, locationId),
      fetchBuildingJobs(this.prisma, ctx.userId),
      fetchCurrencyIds(this.prisma),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'info' as const,
          message: enabled ? 'Room enabled' : 'Room disabled',
        },
      ],
    };
  }
}
