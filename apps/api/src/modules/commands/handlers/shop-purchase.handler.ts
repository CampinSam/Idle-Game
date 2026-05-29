import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { TelemetryService } from '../../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../../telemetry/telemetry-context-builder.service';

@Injectable()
export class ShopPurchaseHandler implements CommandHandler {
  constructor(
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
    private telemetryContextBuilder: TelemetryContextBuilderService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { shopItemDefId } = payload;
    if (!shopItemDefId) throw new BadRequestException('shopItemDefId is required');

    const item = await (ctx.tx as any).shopItemDef.findUnique({ where: { id: shopItemDefId } });
    if (!item) throw new NotFoundException(`Shop item "${shopItemDefId}" not found`);
    if (!item.enabled) throw new BadRequestException('This item is currently unavailable');
    if (item.availableFrom && new Date(item.availableFrom) > new Date()) {
      throw new BadRequestException('This item is not yet available');
    }
    if (item.limitedUntil && new Date(item.limitedUntil) <= new Date()) {
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
      const telemetryContext = await this.telemetryContextBuilder.buildContext(ctx.userId);
      await this.telemetryService.record(ctx.userId, 'shop_purchase', shopItemDefId, 1, {}, ctx.tx, telemetryContext);
    } catch (_) {}

    const pb = new PatchBuilder();
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const bodyText = grants.length > 0 ? `You received: ${grants.join(', ')}` : 'Purchase complete.';

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          spec: {
            version: 1,
            id: `shop-purchase-${shopItemDefId}-${Date.now()}`,
            kind: 'shop_purchase',
            dismiss: { backdrop: true, x: true, escape: true },
            header: { title: `${item.name} Purchased!` },
            pages: [
              {
                body: [
                  {
                    type: 'richText',
                    doc: [{ t: 'p', c: [{ t: 'text', v: bodyText }] }],
                  },
                ],
              },
            ],
            buttons: [
              { id: 'close', label: 'Collect', variant: 'primary', action: { type: 'CLOSE_MODAL' } },
            ],
          },
        },
      ],
    };
  }
}
