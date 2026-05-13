import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';

const MAX_NAME_LENGTH = 32;

function txDb(tx: unknown) {
  return tx as any;
}

@Injectable()
export class RenameEntityHandler implements CommandHandler {
  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { entityId, name } = payload || {};

    if (!entityId) throw new BadRequestException('entityId is required');
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('name is required');
    }
    const trimmedName = name.trim();
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }

    const entity = await txDb(ctx.tx).entity.findUnique({
      where: { id: entityId },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    if (entity.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('Entity does not belong to you');
    }

    const existingDisplay = (entity.display as any) || {};
    await txDb(ctx.tx).entity.update({
      where: { id: entityId },
      data: {
        display: { ...existingDisplay, name: trimmedName },
      },
    });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success' as const, message: `Renamed to "${trimmedName}"` }],
    };
  }
}
