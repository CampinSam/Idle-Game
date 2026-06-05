import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class ToggleLocationHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, enabled } = payload;

    await this.locationService.toggleLocationEnabled(ctx.userId, locationId, enabled, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    return {
      patches: pb.build(),
      ui: [{ type: 'local_toast' as const, tone: 'info' as const, title: 'Location Updated', body: enabled ? 'Location enabled.' : 'Location disabled.' }],
    };
  }
}
