import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildCurrencyPatches, buildItemPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class ClaimLocationHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId } = payload;

    await this.locationService.claimLocation(ctx.userId, locationId, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'local_toast' as const, tone: 'success' as const, title: 'Resources Claimed', body: 'Location resources have been collected.' }],
    };
  }
}
