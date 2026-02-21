import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchFullLocation, fetchBuildingJobs, fetchCurrencyIds } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class RemoveWorkerHandler implements CommandHandler {
  constructor(
    private locationService: LocationService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, entityId } = payload;

    await this.locationService.removeWorker(ctx.userId, locationId, entityId);

    const pb = new PatchBuilder();

    const [location, buildingJobs, currencyIds] = await Promise.all([
      fetchFullLocation(ctx.tx, locationId),
      fetchBuildingJobs(ctx.tx, ctx.userId),
      fetchCurrencyIds(ctx.tx),
    ]);
    if (location) pb.upsertLocation(location, buildingJobs, currencyIds);

    const entity = await (ctx.tx as any).entity.findUnique({
      where: { id: entityId },
      include: { equipment: true },
    });
    if (entity) pb.upsertEntity(entity);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: 'Worker removed',
        },
      ],
    };
  }
}
