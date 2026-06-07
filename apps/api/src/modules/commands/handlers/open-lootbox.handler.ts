import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildPlayerPatch } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { TelemetryService } from '../../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../../telemetry/telemetry-context-builder.service';
import { GameRulesService } from '../../game-rules/game-rules.service';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class OpenLootBoxHandler implements CommandHandler {
  constructor(
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private telemetryService: TelemetryService,
    private telemetryContextBuilder: TelemetryContextBuilderService,
    private gameRules: GameRulesService,
    private notificationService: NotificationService,
    private prisma: PrismaService,
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

    const lootboxDefId =
      (item.definition as any)?.lootboxDefId ??
      ((item.definition?.data as any) ?? (item.data as any) ?? {}).lootboxDefId;
    if (!lootboxDefId) throw new BadRequestException('Item has no lootboxDefId');

    const lootboxDef = await (ctx.tx as any).lootboxDef.findUnique({ where: { id: lootboxDefId } });
    if (!lootboxDef) throw new NotFoundException(`LootboxDef "${lootboxDefId}" not found`);
    if (!lootboxDef.enabled) throw new BadRequestException('This lootbox is currently disabled');

    const openNonce = crypto.randomBytes(4).toString('hex');
    const seed = crypto
      .createHash('sha256')
      .update(`${itemInstanceId}${ctx.userId}${openNonce}`)
      .digest('hex');

    const seedNum = parseInt(seed.slice(0, 8), 16);
    let _state = seedNum;
    const rng = {
      chance(p: number): boolean {
        _state = (_state * 1664525 + 1013904223) & 0xffffffff;
        return ((_state >>> 0) / 0x100000000) < p;
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
    let anyFlags = false;

    for (let i = 0; i < rollCount; i++) {
      const { resolved, flags: resolvedFlags } = await this.gameRules.resolveOutcomesAsync(outcomes, reqContext, rng);
      if (resolvedFlags.length > 0) anyFlags = true;
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

    if (anyFlags) {
      await (ctx.tx as any).user.update({ where: { id: ctx.userId }, data: { flags: reqContext.userFlags as any } });
    }

    if ((item.quantity ?? 1) > 1) {
      await (ctx.tx as any).itemInstance.update({
        where: { id: itemInstanceId },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await (ctx.tx as any).itemInstance.delete({ where: { id: itemInstanceId } });
    }

    try {
      const telemetryContext = await this.telemetryContextBuilder.buildContext(ctx.userId);
      await this.telemetryService.record(
        ctx.userId,
        'lootbox_opened',
        lootboxDefId,
        1,
        {},
        ctx.tx,
        telemetryContext,
      );
    } catch (_) {}

    const readNotifications = await this.notificationService.markReadBySource(ctx.userId, 'ItemInstance', itemInstanceId, ctx.tx);

    const pb = new PatchBuilder();
    if ((item.quantity ?? 1) <= 1) {
      pb.deleteItem(itemInstanceId);
    }
    for (const notif of readNotifications) {
      pb.upsertNotification(notif);
    }
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

    const rewardSummary = allGrants
      .map((g: any) => `${g.amount ?? g.qty ?? 1}x ${g.key ?? g.currencyId ?? g.itemDefId ?? g.type}`)
      .join(', ');

    const lootboxBodyText = rewardSummary || 'No rewards this time.';

    const generatedSpec: any = {
      version: 1,
      id: `lootbox-opened-${itemInstanceId}`,
      kind: 'lootbox_opened',
      dismiss: { backdrop: true, x: true, escape: true },
      header: { title: `${lootboxDef.name} Opened!` },
      pages: [
        {
          body: [
            {
              type: 'richText',
              doc: [{ t: 'p', c: [{ t: 'text', v: lootboxBodyText }] }],
            },
          ],
        },
      ],
      buttons: [
        { id: 'close', label: 'Collect', variant: 'primary', action: { type: 'CLOSE_MODAL' } },
      ],
    };

    // Apply default_lootbox_reveal template — lets operators customize header/buttons
    // via the admin panel. Generated pages (reward text) are preserved when the
    // default has no pages of its own.
    try {
      const templateRow = await (this.prisma as any).defaultModalDef.findUnique({
        where: { id: 'default_lootbox_reveal' },
      });
      if (templateRow?.enabled && templateRow.spec && typeof templateRow.spec === 'object') {
        const tpl = templateRow.spec as any;
        if (tpl.header && typeof tpl.header === 'object') {
          generatedSpec.header = { ...generatedSpec.header, ...tpl.header };
        }
        if (Array.isArray(tpl.pages) && tpl.pages.length > 0) {
          generatedSpec.pages = tpl.pages;
        }
        if (Array.isArray(tpl.buttons) && tpl.buttons.length > 0) {
          generatedSpec.buttons = tpl.buttons;
        }
      }
    } catch { /* ignore — fall back to inline spec */ }

    return {
      patches: pb.build(),
      ui: [{ type: 'modal' as const, spec: generatedSpec }],
    };
  }
}
