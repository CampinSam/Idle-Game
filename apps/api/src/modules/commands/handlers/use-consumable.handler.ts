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
import { effectWouldChangeStats } from '../../entity/entity-stats.util';
import { resolveRnd } from '../../entity/rnd-resolver.util';
import {
  EffectDurationModel,
  EffectCategory,
  EffectTargetType,
  EffectSourceType,
} from '@derp/shared';

function txDb(tx: unknown) {
  return tx as any;
}

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

    const item = await txDb(ctx.tx).itemInstance.findUnique({
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

    const effects: Array<{ effectDefId: string; targetType?: string; effectOverrides?: Record<string, any> }> = consumableData.effects;
    const pb = new PatchBuilder();

    // Pre-resolve all effect defs once so we can both (a) gate on busy
    // entities before any mutation, and (b) reuse the defs in the apply loop.
    const resolvedDefs = await Promise.all(
      effects.map(async (e) => ({
        spec: e,
        def: await this.effectService.getEffectDef(e.effectDefId),
      })),
    );

    // Block stat-changing consumables on busy entities. Stats are read at
    // job-resolution time (outpost production, mission outcomes), so a
    // mid-job stat shift would silently change those calculations. Heal /
    // XP / currency / non-stat consumables (and consumables that target
    // the player or a location) are still allowed.
    const entityTargetedStatChange = resolvedDefs.some(({ spec, def }) => {
      const tt = (spec.targetType ?? def.targetType) as EffectTargetType;
      // Pass spec.effectOverrides so override-driven stat changes (e.g. overrides.stats)
      // are also caught by the busy-entity guard, not just base def stats.
      return tt === EffectTargetType.ENTITY && effectWouldChangeStats(def, spec.effectOverrides ?? null);
    });
    if (entityTargetedStatChange) {
      if (!targetId) throw new BadRequestException('targetId is required for entity effects');
      const target = await txDb(ctx.tx).entity.findFirst({
        where: { id: targetId, ownerUserId: ctx.userId },
        select: { state: true, display: true, speciesId: true },
      });
      if (!target) throw new NotFoundException('Target entity not found');
      const targetStatus = (target.state as any)?.status ?? 'idle';
      if (targetStatus !== 'idle') {
        const entityName = (target.display as any)?.name || target.speciesId || 'Entity';
        throw new BadRequestException(
          `"${entityName}" is currently ${targetStatus} — finish or cancel the job before using stat-changing items`,
        );
      }
    }

    for (const { spec: effectSpec, def } of resolvedDefs) {
      const effectTargetType = (effectSpec.targetType ?? def.targetType) as EffectTargetType;

      let resolvedTargetId = ctx.userId;
      if (effectTargetType === EffectTargetType.ENTITY) {
        if (!targetId) throw new BadRequestException('targetId is required for entity effects');
        const entity = await txDb(ctx.tx).entity.findFirst({
          where: { id: targetId, ownerUserId: ctx.userId },
        });
        if (!entity) throw new NotFoundException('Target entity not found');
        resolvedTargetId = targetId;
      } else if (effectTargetType === EffectTargetType.LOCATION) {
        if (!targetId) throw new BadRequestException('targetId is required for location effects');
        const location = await txDb(ctx.tx).locationInstance.findFirst({
          where: { id: targetId, ownerUserId: ctx.userId },
        });
        if (!location) throw new NotFoundException('Target location not found');
        resolvedTargetId = targetId;
      } else if (effectTargetType === EffectTargetType.PLAYER) {
        resolvedTargetId = ctx.userId;
      } else {
        throw new BadRequestException(`Unsupported effect target type: ${effectTargetType}`);
      }

      if (def.durationModel === EffectDurationModel.INSTANT) {
        const mergedValue = effectSpec.effectOverrides?.value ?? def.value ?? 0;
        const mergedStats = effectSpec.effectOverrides?.stats ?? def.stats ?? null;
        const mergedResourceId = effectSpec.effectOverrides?.resourceId ?? (def as any).resourceId ?? null;
        await this.applyInstantEffect(ctx, { ...def, value: mergedValue, stats: mergedStats as any, resourceId: mergedResourceId }, resolvedTargetId, effectTargetType);
      } else {
        const result = await this.effectService.applyEffect(
          {
            effectDefId: def.id,
            userId: ctx.userId,
            targetType: effectTargetType,
            targetId: resolvedTargetId,
            sourceType: EffectSourceType.CONSUMABLE,
            sourceId: item.definitionId,
            valueOverrides: effectSpec.effectOverrides as any,
          },
          ctx.tx,
        );
        if ('active' in result) {
          pb.upsertActiveEffect(result.active);
          for (const removedId of result.removedIds) {
            pb.delete('activeEffect', removedId);
          }
        }
      }
    }

    const preConsumeSnapshot = await txDb(ctx.tx).itemInstance.findMany({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    const preIds = new Set<string>(preConsumeSnapshot.map((i: { id: string }) => i.id));

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
      await txDb(ctx.tx).itemInstance.delete({ where: { id: itemInstanceId } });
    }

    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const postConsumeItems = await txDb(ctx.tx).itemInstance.findMany({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    const postIds = new Set(postConsumeItems.map((i: { id: string }) => i.id));
    for (const oldId of preIds) {
      if (!postIds.has(oldId)) {
        pb.delete('item', oldId);
      }
    }

    if (targetId) {
      const owned = await txDb(ctx.tx).entity.findFirst({
        where: { id: targetId, ownerUserId: ctx.userId },
        select: { id: true },
      });
      if (owned) await buildEntityPatch(pb, ctx.tx, targetId);
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
    def: { id: string; name: string; category: string; value: number | null; stats: Record<string, number> | null; resourceId?: string },
    targetId: string,
    targetType: EffectTargetType,
  ): Promise<void> {
    const value = def.value ?? 0;
    const stats: Record<string, number> = (def.stats && typeof def.stats === 'object') ? def.stats : {};

    switch (def.category as EffectCategory) {
      case EffectCategory.XP_MULTIPLIER:
      case EffectCategory.STAT_BOOST: {
        if (targetType === EffectTargetType.ENTITY && Object.keys(stats).length > 0) {
          const entity = await txDb(ctx.tx).entity.findUnique({ where: { id: targetId } });
          if (!entity) break;
          const currentStats = (entity.stats as Record<string, number>) || {};
          const newStats = { ...currentStats };
          // Resolve RND before applying so it never persists as a stat key.
          const resolvedStats = resolveRnd(stats);
          for (const [key, val] of Object.entries(resolvedStats)) {
            newStats[key] = (newStats[key] ?? 0) + val;
          }
          await txDb(ctx.tx).entity.update({
            where: { id: targetId },
            data: { stats: newStats },
          });
        }
        if (targetType === EffectTargetType.ENTITY && value > 0 &&
            def.category === EffectCategory.XP_MULTIPLIER) {
          await this.entityService.addEntityXp(targetId, ctx.userId, value, ctx.tx);
        }
        break;
      }

      case EffectCategory.KEEPER_XP_MULTIPLIER: {
        if (value > 0) {
          const user = await txDb(ctx.tx).user.findUnique({ where: { id: ctx.userId } });
          if (user) {
            const newXp = BigInt(user.keeperXp) + BigInt(Math.floor(value));
            await txDb(ctx.tx).user.update({
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
