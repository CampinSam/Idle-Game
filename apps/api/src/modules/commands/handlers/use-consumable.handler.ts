import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import {
  PatchBuilder,
  buildItemPatches,
  buildEntityPatch,
  buildPlayerPatch,
  buildCurrencyPatches,
} from '../patch-builder';
import { InventoryService } from '../../inventory/inventory.service';
import { EffectService } from '../../effect/effect.service';
import { EntityService } from '../../entity/entity.service';
import { CurrencyService } from '../../currency/currency.service';
import {
  EffectDurationModel,
  EffectCategory,
  EffectTargetType,
  EffectSourceType,
} from '@derp/shared';

@Injectable()
export class UseConsumableHandler implements CommandHandler {
  constructor(
    private inventoryService: InventoryService,
    private effectService: EffectService,
    private entityService: EntityService,
    private currencyService: CurrencyService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { itemInstanceId, targetId } = payload;
    if (!itemInstanceId) throw new BadRequestException('itemInstanceId is required');

    const item = await (ctx.tx as any).itemInstance.findUnique({
      where: { id: itemInstanceId },
      include: { definition: true },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.userId !== ctx.userId) throw new ForbiddenException('Item does not belong to you');
    if (item.definition?.type !== 'CONSUMABLE') {
      throw new BadRequestException('Item is not a consumable');
    }

    const consumableData = item.definition.consumableData as any;
    if (!consumableData || !consumableData.effects || !Array.isArray(consumableData.effects)) {
      throw new BadRequestException('Item has no consumable effect configuration');
    }

    const effects: Array<{ effectDefId: string; targetType?: string }> = consumableData.effects;
    const pb = new PatchBuilder();
    const appliedEffects: any[] = [];
    const instantResults: string[] = [];

    for (const effectSpec of effects) {
      const def = await this.effectService.getEffectDef(effectSpec.effectDefId);
      const effectTargetType = (effectSpec.targetType ?? def.targetType) as EffectTargetType;

      let resolvedTargetId = ctx.userId;
      if (effectTargetType === EffectTargetType.ENTITY) {
        if (!targetId) throw new BadRequestException('targetId is required for entity effects');
        const entity = await (ctx.tx as any).entity.findFirst({
          where: { id: targetId, ownerUserId: ctx.userId },
        });
        if (!entity) throw new NotFoundException('Target entity not found');
        resolvedTargetId = targetId;
      } else if (effectTargetType === EffectTargetType.LOCATION) {
        if (!targetId) throw new BadRequestException('targetId is required for location effects');
        const location = await (ctx.tx as any).locationInstance.findFirst({
          where: { id: targetId, ownerUserId: ctx.userId },
        });
        if (!location) throw new NotFoundException('Target location not found');
        resolvedTargetId = targetId;
      } else if (effectTargetType === EffectTargetType.PLAYER) {
        resolvedTargetId = ctx.userId;
      }

      if (def.durationModel === EffectDurationModel.INSTANT) {
        await this.applyInstantEffect(ctx, def, resolvedTargetId, effectTargetType);
        instantResults.push(`${def.name} applied`);
      } else {
        const active = await this.effectService.applyEffect(
          {
            effectDefId: def.id,
            userId: ctx.userId,
            targetType: effectTargetType,
            targetId: resolvedTargetId,
            sourceType: EffectSourceType.CONSUMABLE,
            sourceId: item.definitionId,
          },
          ctx.tx,
        );
        appliedEffects.push(active);
        pb.upsertActiveEffect(active);
      }
    }

    if (item.definition.stackable) {
      await this.inventoryService.removeItemTx(ctx.tx, {
        userId: ctx.userId,
        itemId: item.definitionId,
        quantity: 1,
        reason: `Used consumable: ${item.definition.name}`,
        sourceType: 'consumable',
        sourceId: item.definitionId,
      });
    } else {
      await (ctx.tx as any).itemInstance.delete({ where: { id: itemInstanceId } });
    }

    await buildItemPatches(pb, ctx.tx, ctx.userId);

    if (targetId) {
      const entity = await (ctx.tx as any).entity.findFirst({
        where: { id: targetId, ownerUserId: ctx.userId },
        include: { equipment: true },
      });
      if (entity) pb.upsertEntity(entity);
    }

    await buildPlayerPatch(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);

    const effectNames = effects.length > 0
      ? (await Promise.all(effects.map(async (e) => {
          try {
            const d = await this.effectService.getEffectDef(e.effectDefId);
            return d.name;
          } catch { return e.effectDefId; }
        }))).join(', ')
      : item.definition.name;

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: `Used ${item.definition.name}: ${effectNames}`,
        },
      ],
    };
  }

  private async applyInstantEffect(
    ctx: CommandContext,
    def: any,
    targetId: string,
    targetType: EffectTargetType,
  ): Promise<void> {
    const value = def.value ?? 0;
    const stats: Record<string, number> = (def.stats && typeof def.stats === 'object') ? def.stats : {};

    switch (def.category as EffectCategory) {
      case EffectCategory.XP_MULTIPLIER:
      case EffectCategory.STAT_BOOST: {
        if (targetType === EffectTargetType.ENTITY && Object.keys(stats).length > 0) {
          const entity = await (ctx.tx as any).entity.findUnique({ where: { id: targetId } });
          if (!entity) break;
          const currentStats = (entity.stats as any) || {};
          const newStats = { ...currentStats };
          for (const [key, val] of Object.entries(stats)) {
            newStats[key] = (newStats[key] ?? 0) + val;
          }
          await (ctx.tx as any).entity.update({
            where: { id: targetId },
            data: { stats: newStats },
          });
        }
        if (targetType === EffectTargetType.ENTITY && value > 0 &&
            def.category === EffectCategory.XP_MULTIPLIER) {
          await this.entityService.addEntityXp(targetId, ctx.userId, value);
        }
        break;
      }

      case EffectCategory.KEEPER_XP_MULTIPLIER: {
        if (value > 0) {
          const user = await (ctx.tx as any).user.findUnique({ where: { id: ctx.userId } });
          if (user) {
            const newXp = BigInt(user.keeperXp) + BigInt(Math.floor(value));
            await (ctx.tx as any).user.update({
              where: { id: ctx.userId },
              data: { keeperXp: newXp },
            });
          }
        }
        break;
      }

      case EffectCategory.CURRENCY_MULTIPLIER: {
        if (def.resourceId && value > 0) {
          await this.currencyService.creditTx(ctx.tx, {
            userId: ctx.userId,
            currencyId: def.resourceId,
            amount: value,
            reason: `Consumable instant: ${def.name}`,
            sourceType: 'consumable',
            sourceId: def.id,
          });
        }
        break;
      }

      default:
        break;
    }
  }
}
