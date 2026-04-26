import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildEntityPatch, buildPlayerPatch } from '../patch-builder';
import { CurrencyService } from '../../currency/currency.service';
import { InventoryService } from '../../inventory/inventory.service';
import { GameRulesService } from '../../game-rules/game-rules.service';
import { resolveRewardSpec } from '../../gift/reward-resolver.util';

@Injectable()
export class OpenGiftPackageHandler implements CommandHandler {
  constructor(
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
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
    if (item.definition?.type !== 'GIFT_PACKAGE') {
      throw new BadRequestException('Item is not a gift package');
    }

    const state = (item.state as any) ?? {};
    const rewardSpec = state.rewardSpec ?? {};

    const grants = await resolveRewardSpec(
      ctx.tx,
      this.currencyService,
      this.inventoryService,
      this.gameRules,
      ctx.userId,
      rewardSpec,
      itemInstanceId,
    );

    await (ctx.tx as any).itemInstance.delete({ where: { id: itemInstanceId } });

    const pb = new PatchBuilder();
    pb.deleteItem(itemInstanceId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

    for (const grant of grants) {
      if (grant.type === 'entity' && grant.entityId) {
        await buildEntityPatch(pb, ctx.tx, grant.entityId);
      }
    }

    const rewardSummary = grants
      .map((g: any) => `${g.amount ?? g.qty ?? 1}x ${g.currencyId ?? g.itemDefId ?? g.definitionId ?? g.type}`)
      .join(', ');

    const giftBodyText = rewardSummary || 'Your rewards have been added.';

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          spec: {
            version: 1,
            id: `gift-opened-${itemInstanceId}`,
            kind: 'gift_opened',
            dismiss: { backdrop: true, x: true, escape: true },
            header: { title: 'Gift Opened!' },
            body: [
              {
                type: 'richText',
                doc: [{ t: 'p', c: [{ t: 'text', v: giftBodyText }] }],
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
