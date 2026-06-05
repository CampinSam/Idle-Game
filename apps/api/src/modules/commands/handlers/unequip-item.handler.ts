import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch, buildItemPatches, buildLocationPatches } from '../patch-builder';
import { LocationSettlementService } from '../../location/location-settlement.service';
import { gearWouldChangeStats } from '../../entity/entity-stats.util';

function txDb(tx: unknown) {
  return tx as any;
}

/**
 * Removes a single equipped gear instance from an entity. Counterpart to
 * `EquipItem`. Idempotent: unequipping an already-unequipped item is a no-op.
 */
@Injectable()
export class UnequipItemHandler implements CommandHandler {
  constructor(private settlementService: LocationSettlementService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { entityId, itemInstanceId } = payload || {};
    if (!entityId) throw new BadRequestException('entityId is required');
    if (!itemInstanceId) throw new BadRequestException('itemInstanceId is required');

    const entity = await txDb(ctx.tx).entity.findUnique({
      where: { id: entityId },
      select: { id: true, ownerUserId: true, state: true, display: true, speciesId: true },
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
      include: { definition: { select: { name: true, equipData: true } } },
    });
    if (!item || item.userId !== ctx.userId) {
      throw new ForbiddenException('Item does not belong to you');
    }

    // Block stat-changing unequips on busy entities — same reasoning as
    // EquipItem (mid-job stat shifts would silently change job math).
    // Cosmetic gear (no stat contribution) can still be unequipped.
    const entityStatus = (entity.state as any)?.status ?? 'idle';
    if (
      entityStatus !== 'idle' &&
      gearWouldChangeStats(item.definition?.equipData)
    ) {
      const entityName = (entity.display as any)?.name || entity.speciesId || 'Entity';
      throw new BadRequestException(
        `"${entityName}" is currently ${entityStatus} — finish or cancel the job before changing equipment`,
      );
    }

    await txDb(ctx.tx).entityEquipment.delete({ where: { id: equipRow.id } });
    await txDb(ctx.tx).itemInstance.update({
      where: { id: itemInstanceId },
      data: { equippedToId: null },
    });

    // See EquipItemHandler — recalc outpost meta if this entity is a worker,
    // so stat-driven production / consumption multipliers stay accurate.
    const workerAssignments = await txDb(ctx.tx).locationWorkerAssignment.findMany({
      where: { entityId },
      select: { locationId: true },
    });

    const pb = new PatchBuilder();
    await buildEntityPatch(pb, ctx.tx, entityId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    for (const a of workerAssignments) {
      await this.settlementService.recalculateLocationMeta(a.locationId, ctx.tx);
      await buildLocationPatches(pb, ctx.tx, ctx.userId, a.locationId);
    }

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'local_toast' as const,
          tone: 'success' as const,
          title: 'Gear Unequipped',
          body: `Unequipped ${item.definition?.name ?? 'item'}`,
        },
      ],
    };
  }
}
