import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildPlayerPatch } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { TelemetryService } from '../../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../../telemetry/telemetry-context-builder.service';

const PAYMENT_COST_TYPES = ['usd', 'ada', 'cnt'] as const;
type PaymentCostType = typeof PAYMENT_COST_TYPES[number];

function isPaymentCostType(type: string): type is PaymentCostType {
  return (PAYMENT_COST_TYPES as readonly string[]).includes(type);
}

function describePaymentCostEntry(cost: any): string {
  switch (cost.type) {
    case 'usd':
      return cost.allowAda
        ? `$${cost.amount} USD (ADA payment supported)`
        : `$${cost.amount} USD (Stripe)`;
    case 'ada':
      return `${(cost.lovelaceAmount / 1_000_000).toFixed(6)} ADA`;
    case 'cnt':
      return `${cost.amount} CNT (${cost.assetName ?? cost.policyId})`;
    default:
      return cost.type;
  }
}

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

    const costEntries: Array<any> = Array.isArray(item.cost) ? item.cost : [];
    const contentEntries: Array<{ type: string; id: string; amount: number }> = Array.isArray(item.contents) ? item.contents : [];

    // Real-money cost types (usd, ada, cnt) require the payment API, not a game command.
    // Detect them early so we never silently skip the charge.
    const paymentCosts = costEntries.filter((c) => isPaymentCostType(c.type));
    if (paymentCosts.length > 0) {
      const descriptions = paymentCosts.map(describePaymentCostEntry).join(', ');
      throw new BadRequestException(
        `"${item.name}" requires payment (${descriptions}). ` +
          `Use POST /v1/purchases to create a payment session, then submit the ` +
          `transaction before claiming the item.`,
      );
    }

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
      } else if (content.type === 'outpost_slots') {
        const allSlotKeys = ['location_slot.1', 'location_slot.2', 'location_slot.3'];
        const existing: { key: string }[] = await (ctx.tx as any).userUnlock.findMany({
          where: { userId: ctx.userId, key: { in: allSlotKeys } },
          select: { key: true },
        });
        const existingKeys = new Set(existing.map((u: any) => u.key));
        const toGrant = allSlotKeys.filter(k => !existingKeys.has(k)).slice(0, content.amount);
        for (const key of toGrant) {
          await (ctx.tx as any).userUnlock.upsert({
            where: { userId_key: { userId: ctx.userId, key } },
            create: { userId: ctx.userId, key, source: 'shop' },
            update: {},
          });
        }
        grants.push(`${toGrant.length} Outpost Slot${toGrant.length !== 1 ? 's' : ''}`);
      }
    }

    try {
      const telemetryContext = await this.telemetryContextBuilder.buildContext(ctx.userId);
      await this.telemetryService.record(ctx.userId, 'shop_purchase', shopItemDefId, 1, {}, ctx.tx, telemetryContext);
    } catch (_) {}

    const pb = new PatchBuilder();
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

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
