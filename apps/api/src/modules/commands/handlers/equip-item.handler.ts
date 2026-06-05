import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch, buildItemPatches, buildLocationPatches } from '../patch-builder';
import { LocationSettlementService } from '../../location/location-settlement.service';
import { NotificationService } from '../../notification/notification.service';
import { gearWouldChangeStats } from '../../entity/entity-stats.util';

function txDb(tx: unknown) {
  return tx as any;
}

/**
 * Equips a GEAR item onto an entity slot.
 *
 * Server-authoritative validation:
 *   - Player must own both the entity and the item instance.
 *   - Item must be GEAR with `equipData.slot` set.
 *   - Entity's EquipmentSchema must define the slot (with capacity > 0).
 *   - Item must not already be equipped to a different entity (the
 *     equippedToId mirror is the canonical guard).
 *
 * Auto-swap: if the requested slot is already at capacity (per
 * EquipmentSchema.schema[slot]), the *oldest* claim in that slot is
 * unequipped first so equip becomes a one-tap action — matches the
 * mobile-RPG idiom and avoids forcing a separate "swap" command.
 */
@Injectable()
export class EquipItemHandler implements CommandHandler {
  constructor(
    private settlementService: LocationSettlementService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { entityId, itemInstanceId } = payload || {};
    if (!entityId) throw new BadRequestException('entityId is required');
    if (!itemInstanceId) throw new BadRequestException('itemInstanceId is required');

    const entity = await txDb(ctx.tx).entity.findUnique({
      where: { id: entityId },
      include: {
        definition: true,
        equipment: true,
      },
    });
    if (!entity) throw new NotFoundException('Entity not found');
    if (entity.ownerUserId !== ctx.userId) {
      throw new ForbiddenException('Entity does not belong to you');
    }

    const item = await txDb(ctx.tx).itemInstance.findUnique({
      where: { id: itemInstanceId },
      include: { definition: true },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item.userId !== ctx.userId) {
      throw new ForbiddenException('Item does not belong to you');
    }
    if (item.definition?.type !== 'GEAR') {
      throw new BadRequestException('Item is not equippable gear');
    }

    const equipData = item.definition.equipData as any;
    const slot: string | undefined = equipData?.slot;
    if (!slot || typeof slot !== 'string') {
      throw new BadRequestException('Item has no equipData.slot configured');
    }

    const schema = (entity.definition?.equipmentSlots as any) || {};
    const slotCapacity = Number(schema[slot] ?? 0);
    if (!slotCapacity || slotCapacity <= 0) {
      throw new BadRequestException(`Entity has no '${slot}' slot`);
    }

    // Block stat-changing equips on busy entities. Stats are read at job
    // resolution time (outpost production, mission outcomes), so allowing
    // mid-job changes would silently shift those calculations. Cosmetic
    // gear (no stat contribution) is still allowed even while busy.
    const entityStatus = (entity.state as any)?.status ?? 'idle';
    if (entityStatus !== 'idle' && gearWouldChangeStats(equipData)) {
      const entityName = (entity.display as any)?.name || entity.speciesId || 'Entity';
      throw new BadRequestException(
        `"${entityName}" is currently ${entityStatus} — finish or cancel the job before changing equipment`,
      );
    }

    // Already equipped to *this* entity in this slot? Treat as no-op success.
    const alreadyHere = entity.equipment.find(
      (eq: any) => eq.itemInstanceId === itemInstanceId,
    );
    if (alreadyHere) {
      return { patches: [], ui: [] };
    }

    // Equipped elsewhere? Block — owner must unequip first. We do not
    // silently steal equipment between entities to keep the action local
    // and reversible.
    if (item.equippedToId && item.equippedToId !== entityId) {
      throw new BadRequestException('Item is already equipped to another entity');
    }

    // Slot capacity check + auto-swap of the oldest occupant.
    const occupantsInSlot = entity.equipment
      .filter((eq: any) => Array.isArray(eq.slotClaims) && eq.slotClaims.includes(slot))
      .sort((a: any, b: any) =>
        new Date(a.equippedAt).getTime() - new Date(b.equippedAt).getTime(),
      );

    const evictedItemIds: string[] = [];
    if (occupantsInSlot.length >= slotCapacity) {
      const evictCount = occupantsInSlot.length - slotCapacity + 1;
      for (let i = 0; i < evictCount; i++) {
        const evict = occupantsInSlot[i];
        await txDb(ctx.tx).entityEquipment.delete({ where: { id: evict.id } });
        await txDb(ctx.tx).itemInstance.update({
          where: { id: evict.itemInstanceId },
          data: { equippedToId: null },
        });
        evictedItemIds.push(evict.itemInstanceId);
      }
    }

    await txDb(ctx.tx).entityEquipment.create({
      data: {
        entityId,
        itemInstanceId,
        slotClaims: [slot],
      },
    });
    await txDb(ctx.tx).itemInstance.update({
      where: { id: itemInstanceId },
      data: { equippedToId: entityId },
    });

    // If this entity is currently working at one or more outposts, the
    // outpost's effective production / consumption multipliers depend on
    // the worker's equipped FOC/SPD. Recalculate meta for those locations
    // so displayed and settled rates stay accurate.
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

    const itemName = item.definition.name;
    const body = evictedItemIds.length > 0
      ? `Equipped ${itemName} (replaced previous ${slot})`
      : `Equipped ${itemName}`;

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'gear_equipped',
      category: 'equipment',
      title: 'Gear Equipped',
      body,
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
    };
  }
}
