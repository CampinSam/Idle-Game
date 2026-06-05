import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildPlayerPatch } from '../patch-builder';

@Injectable()
export class SetPrimaryOutpostHandler implements CommandHandler {
  constructor() {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId } = payload;
    if (!locationId || typeof locationId !== 'string') {
      throw new BadRequestException('locationId is required');
    }

    const location = await (ctx.tx as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: ctx.userId },
      select: { id: true, enabled: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    if (!location.enabled) throw new BadRequestException('Location must be active to set as primary');

    await (ctx.tx as any).user.update({
      where: { id: ctx.userId },
      data: { primaryLocationId: locationId },
    });

    const pb = new PatchBuilder();
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'local_toast' as const, tone: 'success' as const, title: 'Primary Outpost Updated', body: 'Primary outpost has been updated.' }],
    };
  }
}
