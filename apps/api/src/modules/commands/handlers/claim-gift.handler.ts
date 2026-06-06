import { Injectable, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildEntityPatch, buildPlayerPatch } from '../patch-builder';
import { GiftService } from '../../gift/gift.service';
import { buildGrantsRewardsBlock } from './grant-label.util';

@Injectable()
export class ClaimGiftHandler implements CommandHandler {
  constructor(private giftService: GiftService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { giftId } = payload;
    if (!giftId) throw new BadRequestException('giftId is required');

    const { gift, claimTx } = await this.giftService.claimGift(ctx.userId, giftId, ctx.tx);

    const pb = new PatchBuilder();
    pb.delete('gift', giftId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);

    const grants = (claimTx?.grants as any[]) ?? [];
    for (const grant of grants) {
      if (grant.type === 'entity' && grant.entityId) {
        await buildEntityPatch(pb, ctx.tx, grant.entityId);
      }
    }

    const snapshot = (gift.snapshot as any) ?? {};
    const presentation = snapshot.presentation ?? {};

    const rewardsBlock = await buildGrantsRewardsBlock(ctx.tx, grants);
    const bodyBlock = rewardsBlock ?? {
      type: 'richText',
      doc: [{ t: 'p', c: [{ t: 'text', v: 'Your rewards have been added.' }] }],
    };

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          spec: {
            version: 1,
            id: `gift-claimed-${giftId}`,
            kind: 'gift_claimed',
            dismiss: { backdrop: true, x: true, escape: true },
            header: { title: presentation.title || 'Gift Claimed!' },
            pages: [
              {
                body: [bodyBlock as any],
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
