import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildActiveJobPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class UpgradeBuildingHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, buildingId } = payload;

    await this.locationService.upgradeBuilding(ctx.userId, locationId, buildingId);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildActiveJobPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: 'Upgrade started!' }],
    };
  }
}
