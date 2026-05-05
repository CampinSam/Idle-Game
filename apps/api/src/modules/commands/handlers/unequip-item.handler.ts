import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch, buildItemPatches } from '../patch-builder';

function txDb(tx: unknown) {
  return tx as any;
}

/**
 * Removes a single equipped gear instance from an entity. Counterpart to
 * `EquipItem`. Idempotent: unequipping an already-unequipped item is a no-op.
 */
@Injectable()
export class UnequipItemHandler implements CommandHandler {
  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { entityId, itemInstanceId } = payload || {};
    if (!entityId) throw new BadRequestException('entityId is required');
    if (!itemInstanceId) throw new BadRequestException('itemInstanceId is required');

    const entity = await txDb(ctx.tx).entity.findUnique({
      where: { id: entityId },
      select: { id: true, ownerUserId: true },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    if (entity.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('Entity does not belong to you');
    }

    const equipRow = await txDb(ctx.tx).entityEquipment.findFirst({
      where: { entityId, itemInstanceId },
    });
    if (!equipRow) {
      // Idempotent — nothing to do.
      return { patches: [], ui: [] };
    }

    const item = await txDb(ctx.tx).itemInstance.findUnique({
      where: { id: itemInstanceId },
      include: { definition: { select: { name: true } } },
    });
    if (!item || item.userId !== ctx.userId) {
      throw new ForbiddenException('Item does not belong to you');
    }

    await txDb(ctx.tx).entityEquipment.delete({ where: { id: equipRow.id } });
    await txDb(ctx.tx).itemInstance.update({
      where: { id: itemInstanceId },
      data: { equippedToId: null },
    });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: `Unequipped ${item.definition?.name ?? 'item'}`,
        },
      ],
    };
  }
}
