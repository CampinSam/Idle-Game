import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class ToggleRoomHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, roomId, enabled } = payload;

    await this.locationService.toggleRoomEnabled(ctx.userId, locationId, roomId, enabled);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: enabled ? 'Room enabled' : 'Room disabled' }],
    };
  }
}
