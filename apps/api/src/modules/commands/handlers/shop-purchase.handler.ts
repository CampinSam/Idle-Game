import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { TelemetryService } from '../../telemetry/telemetry.service';

@Injectable()
export class ShopPurchaseHandler implements CommandHandler {
  constructor(
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { shopItemDefId } = payload;
    if (!shopItemDefId) throw new BadRequestException('shopItemDefId is required');

    const item = await (ctx.tx as any).shopItemDef.findUnique({ where: { id: shopItemDefId } });
    if (!item) throw new NotFoundException(`Shop item "${shopItemDefId}" not found`);
    if (!item.enabled) throw new BadRequestException('This item is currently unavailable');
    if (item.limitedUntil && new Date(item.limitedUntil) < new Date()) {
      throw new BadRequestException('This offer has expired');
    }

    const costEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(item.cost) ? item.cost : [];
    const contentEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(item.contents) ? item.contents : [];

    for (const cost of costEntries) {
      if (!cost.amount || cost.amount <= 0) continue;
      if (cost.type === 'currency') {
        await this.currencyService.spendTx(ctx.tx, {
          userId: ctx.userId,
          currencyId: cost.id,
          amount: cost.amount,
          reason: `Shop: ${item.name}`,
          sourceType: 'shop',
          sourceId: item.id,
        });
      } else if (cost.type === 'item') {
        await this.inventoryService.removeItemTx(ctx.tx, {
          userId: ctx.userId,
          itemId: cost.id,
          quantity: cost.amount,
          reason: `Shop: ${item.name}`,
          sourceType: 'shop',
          sourceId: item.id,
        });
      }
    }

    const grants: string[] = [];

    for (const content of contentEntries) {
      if (!content.amount || content.amount <= 0) continue;
      if (content.type === 'currency') {
        await this.currencyService.creditTx(ctx.tx, {
          userId: ctx.userId,
          currencyId: content.id,
          amount: content.amount,
          reason: `Shop: ${item.name}`,
          sourceType: 'shop',
          sourceId: item.id,
        });
        grants.push(`${content.amount.toLocaleString()} ${content.id.replace(/_/g, ' ')}`);
      } else if (content.type === 'item') {
        await this.inventoryService.addItemTx(ctx.tx, {
          userId: ctx.userId,
          itemId: content.id,
          quantity: content.amount,
          reason: `Shop: ${item.name}`,
          sourceType: 'shop',
          sourceId: item.id,
        });
        grants.push(`${content.amount}x ${content.id}`);
      }
    }

    try {
      await this.telemetryService.record(ctx.userId, 'shop_purchase', shopItemDefId, 1, {}, ctx.tx);
    } catch (_) {}

    const pb = new PatchBuilder();
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          key: `shop-purchase-${shopItemDefId}-${Date.now()}`,
          title: `${item.name} Purchased!`,
          body: grants.length > 0 ? `You received: ${grants.join(', ')}` : 'Purchase complete.',
          buttons: [{ label: 'Collect', action: 'close' }],
        },
      ],
    };
  }
}
