import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildItemPatches, buildCurrencyPatches, buildActiveEffectPatches, buildPlayerPatch } from '../patch-builder';
import { QuestService } from '../../quest/quest.service';
import { buildGrantsRewardsBlock } from './grant-label.util';

@Injectable()
export class ClaimQuestRewardHandler implements CommandHandler {
  constructor(private questService: QuestService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { questInstanceId } = payload;

    const { grants, permanentEffectId, readNotifications } = await this.questService.claimReward(ctx.userId, questInstanceId, ctx.tx);

    const updatedInstance = await (ctx.tx as any).questInstance.findUnique({
      where: { id: questInstanceId },
      include: { questDef: true },
    });

    const pb = new PatchBuilder();
    if (updatedInstance) {
      const isAchievement = updatedInstance.questDef?.category === 'achievement';
      pb.upsert(isAchievement ? 'achievement' : 'quest', updatedInstance.id, updatedInstance);
    }
    for (const notif of readNotifications ?? []) {
      pb.upsertNotification(notif);
    }
    await buildPlayerPatch(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    if (permanentEffectId) {
      await buildActiveEffectPatches(pb, ctx.tx, ctx.userId);
    }

    const rewardsBlock = await buildGrantsRewardsBlock(ctx.tx, grants);
    const bodyBlock = rewardsBlock ?? {
      type: 'richText',
      doc: [{ t: 'p', c: [{ t: 'text', v: 'Rewards collected.' }] }],
    };

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
