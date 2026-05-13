import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches } from '../patch-builder';
import { QuestService } from '../../quest/quest.service';

@Injectable()
export class ClaimQuestRewardHandler implements CommandHandler {
  constructor(private questService: QuestService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { questInstanceId } = payload;

    const { grants } = await this.questService.claimReward(ctx.userId, questInstanceId, ctx.tx);

    const updatedInstance = await (ctx.tx as any).questInstance.findUnique({
      where: { id: questInstanceId },
    });

    const pb = new PatchBuilder();
    if (updatedInstance) {
      pb.upsert('quest', updatedInstance.id, updatedInstance);
    }
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);

    const rewardSummary = grants
      .map((g: any) => `${g.amount ?? g.qty ?? 1}x ${g.key ?? g.currencyId ?? g.itemDefId ?? g.type}`)
      .join(', ');

    const questBodyText = rewardSummary || 'Rewards collected.';

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          spec: {
            version: 1,
            id: `quest-reward-${questInstanceId}`,
            kind: 'quest_reward',
            dismiss: { backdrop: true, x: true, escape: true },
            header: { title: 'Quest Reward Claimed!' },
            pages: [
              {
                body: [
                  {
                    type: 'richText',
                    doc: [{ t: 'p', c: [{ t: 'text', v: questBodyText }] }],
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
