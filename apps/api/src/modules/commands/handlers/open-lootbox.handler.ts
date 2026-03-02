import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildPlayerPatch } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { TelemetryService } from '../../telemetry/telemetry.service';
import { GameRulesService } from '../../game-rules/game-rules.service';
import * as crypto from 'crypto';

@Injectable()
export class OpenLootBoxHandler implements CommandHandler {
  constructor(
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
    private gameRules: GameRulesService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { itemInstanceId } = payload;
    if (!itemInstanceId) throw new BadRequestException('itemInstanceId is required');

    const item = await (ctx.tx as any).itemInstance.findUnique({
      where: { id: itemInstanceId },
      include: { definition: true },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.userId !== ctx.userId) throw new ForbiddenException('Item does not belong to you');
    if (item.definition?.type !== 'LOOTBOX') {
      throw new BadRequestException('Item is not a lootbox');
    }

    const itemData = (item.definition?.data as any) ?? (item.data as any) ?? {};
    const lootboxDefId = itemData.lootboxDefId;
    if (!lootboxDefId) throw new BadRequestException('Item has no lootboxDefId');

    const lootboxDef = await (ctx.tx as any).lootboxDef.findUnique({ where: { id: lootboxDefId } });
    if (!lootboxDef) throw new NotFoundException(`LootboxDef "${lootboxDefId}" not found`);
    if (!lootboxDef.enabled) throw new BadRequestException('This lootbox is currently disabled');

    const seed = crypto
      .createHash('sha256')
      .update(`${itemInstanceId}${ctx.userId}`)
      .digest('hex');

    const seedNum = parseInt(seed.slice(0, 8), 16);
    let _state = seedNum;
    const rng = {
      chance(p: number): boolean {
        _state = (_state * 1664525 + 1013904223) & 0xffffffff;
        return (_state >>> 0) % 100 < p;
      },
      nextInt(min: number, max: number): number {
        _state = (_state * 1664525 + 1013904223) & 0xffffffff;
        return min + ((_state >>> 0) % (max - min + 1));
      },
    };

    const outcomes = Array.isArray(lootboxDef.outcomes) ? lootboxDef.outcomes : [];
    const rollCount = lootboxDef.rollCount ?? 1;

    const user = await (ctx.tx as any).user.findUnique({ where: { id: ctx.userId } });
    const reqContext = this.gameRules.buildRequirementContext(user);

    const allGrants: any[] = [];

    for (let i = 0; i < rollCount; i++) {
      const { resolved } = this.gameRules.resolveOutcomes(outcomes, reqContext, rng);
      for (const { entry, amount } of resolved) {
        if (entry.type === 'currency') {
          await this.currencyService.creditTx(ctx.tx, {
            userId: ctx.userId,
            currencyId: entry.key,
            amount: amount ?? 1,
            reason: `Lootbox: ${lootboxDef.name}`,
            sourceType: 'lootbox',
            sourceId: itemInstanceId,
          });
          allGrants.push({ type: 'currency', currencyId: entry.key, amount: amount ?? 1 });
        } else if (entry.type === 'item') {
          await this.inventoryService.addItemTx(ctx.tx, {
            userId: ctx.userId,
            itemId: entry.key,
            quantity: amount ?? 1,
            reason: `Lootbox: ${lootboxDef.name}`,
            sourceType: 'lootbox',
            sourceId: itemInstanceId,
          });
          allGrants.push({ type: 'item', itemDefId: entry.key, qty: amount ?? 1 });
        }
      }
    }

    await (ctx.tx as any).itemInstance.delete({ where: { id: itemInstanceId } });

    try {
      await this.telemetryService.record(
        ctx.userId,
        'lootbox_opened',
        lootboxDefId,
        1,
        {},
        ctx.tx,
      );
    } catch (_) {}

    const pb = new PatchBuilder();
    pb.deleteItem(itemInstanceId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

    const rewardSummary = allGrants
      .map((g: any) => `${g.amount ?? g.qty ?? 1}x ${g.currencyId ?? g.itemDefId ?? g.type}`)
      .join(', ');

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          key: `lootbox-opened-${itemInstanceId}`,
          title: `${lootboxDef.name} Opened!`,
          body: rewardSummary || 'No rewards this time.',
          buttons: [{ label: 'Collect', action: 'close' }],
        },
      ],
    };
  }
}
