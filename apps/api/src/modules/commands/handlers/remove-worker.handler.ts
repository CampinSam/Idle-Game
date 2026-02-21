import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildEntityPatch } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class RemoveWorkerHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, entityId } = payload;

    await this.locationService.removeWorker(ctx.userId, locationId, entityId);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);
    await buildEntityPatch(pb, ctx.tx, entityId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success' as const, message: 'Worker removed' }],
    };
  }
}
