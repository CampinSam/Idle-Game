import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildActiveEffectPatches } from '../patch-builder';
import { QuestService } from '../../quest/quest.service';
import { formatGrantSummary } from './grant-label.util';

@Injectable()
export class ClaimQuestRewardHandler implements CommandHandler {
  constructor(private questService: QuestService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { questInstanceId } = payload;

    const { grants, permanentEffectId, markedReadNotif } = await this.questService.claimReward(ctx.userId, questInstanceId, ctx.tx);

    const updatedInstance = await (ctx.tx as any).questInstance.findUnique({
      where: { id: questInstanceId },
      include: { questDef: true },
    });

    const pb = new PatchBuilder();
    if (updatedInstance) {
      const isAchievement = updatedInstance.questDef?.category === 'achievement';
      pb.upsert(isAchievement ? 'achievement' : 'quest', updatedInstance.id, updatedInstance);
    }
    if (markedReadNotif) pb.upsertNotification(markedReadNotif);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    if (permanentEffectId) {
      await buildActiveEffectPatches(pb, ctx.tx, ctx.userId);
    }

    const rewardSummary = await formatGrantSummary(ctx.tx, grants);
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
