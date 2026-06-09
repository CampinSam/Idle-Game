import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches, buildPlayerPatch } from '../patch-builder';
import { LocationService } from '../../location/location.service';

@Injectable()
export class SwapOutpostHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { disableLocationId, enableLocationId } = payload;

    if (!disableLocationId || typeof disableLocationId !== 'string') {
      throw new BadRequestException('disableLocationId is required');
    }
    if (!enableLocationId || typeof enableLocationId !== 'string') {
      throw new BadRequestException('enableLocationId is required');
    }
    if (disableLocationId === enableLocationId) {
      throw new BadRequestException('disableLocationId and enableLocationId must be different');
    }

    const [disableLoc, enableLoc] = await Promise.all([
      (ctx.tx as any).locationInstance.findFirst({
        where: { id: disableLocationId, ownerUserId: ctx.userId },
        select: { id: true, enabled: true, name: true },
      }),
      (ctx.tx as any).locationInstance.findFirst({
        where: { id: enableLocationId, ownerUserId: ctx.userId },
        select: { id: true, enabled: true, name: true },
      }),
    ]);

    if (!disableLoc) throw new NotFoundException('Outpost to deactivate not found');
    if (!enableLoc) throw new NotFoundException('Outpost to activate not found');
    if (!disableLoc.enabled) throw new BadRequestException('The outpost to deactivate is not currently active');
    if (enableLoc.enabled) throw new BadRequestException('The outpost to activate is already active');

    await this.locationService.swapOutposts(ctx.userId, disableLocationId, enableLocationId, ctx.tx);

    const pb = new PatchBuilder();
    await Promise.all([
      buildLocationPatches(pb, ctx.tx, ctx.userId, disableLocationId),
      buildLocationPatches(pb, ctx.tx, ctx.userId, enableLocationId),
      buildPlayerPatch(pb, ctx.tx, ctx.userId),
    ]);

    const disableName = disableLoc.name || 'Outpost';
    const enableName = enableLoc.name || 'Outpost';

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
