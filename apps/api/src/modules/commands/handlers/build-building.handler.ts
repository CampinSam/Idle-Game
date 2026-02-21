import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildActiveJobPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class BuildBuildingHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingDefId } = payload;

    await this.locationService.buildBuilding(ctx.userId, locationId, buildingDefId);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildActiveJobPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: 'Construction started!' }],
    };
  }
}
