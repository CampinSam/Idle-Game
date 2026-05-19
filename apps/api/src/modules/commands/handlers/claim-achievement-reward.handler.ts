import { Injectable } from '@nestjs/common';
import {
  CommandHandler,
  CommandContext,
  CommandHandlerResult,
} from '../command.types';
import {
  PatchBuilder,
  buildItemPatches,
  buildCurrencyPatches,
  buildActiveEffectPatches,
} from '../patch-builder';
import { QuestService } from '../../quest/quest.service';

/**
 * ClaimAchievementReward — thin alias over ClaimQuestReward.
 *
 * Achievement instances are now unified with quest instances (they are
 * QuestInstance rows with category = 'achievement'). This handler accepts
 * the legacy `achievementInstanceId` payload key for backward compatibility
 * and delegates to QuestService.claimReward.
 *
 * The frontend can also call ClaimQuestReward with questInstanceId directly.
 */
@Injectable()
export class ClaimAchievementRewardHandler implements CommandHandler {
  constructor(private questService: QuestService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const questInstanceId = payload.achievementInstanceId ?? payload.questInstanceId;

    const { grants, permanentEffectId, markedReadNotif } = await this.questService.claimReward(
      ctx.userId,
      questInstanceId,
      ctx.tx,
    );

    const updatedInstance = await (ctx.tx as any).questInstance.findUnique({
      where: { id: questInstanceId },
      include: { questDef: true },
    });

    const pb = new PatchBuilder();
    if (updatedInstance) {
      pb.upsert('achievement', updatedInstance.id, updatedInstance);
    }
    if (markedReadNotif) pb.upsertNotification(markedReadNotif);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    if (permanentEffectId) {
      await buildActiveEffectPatches(pb, ctx.tx, ctx.userId);
    }

    const rewardSummary = grants
      .map((g: any) => `${g.amount ?? 1}x ${g.key ?? g.type}`)
      .join(', ');

    const bodyText = rewardSummary
      ? `Rewards: ${rewardSummary}`
      : 'Achievement claimed.';

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'modal' as const,
          spec: {
            version: 1,
            id: `achievement-reward-${questInstanceId}`,
            kind: 'achievement_reward',
            dismiss: { backdrop: true, x: true, escape: true },
            header: {
              title: 'Achievement Unlocked!',
              subtitle: updatedInstance?.questDef?.name ?? undefined,
            },
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
              {
                id: 'close',
                label: 'Collect',
                variant: 'primary',
                action: { type: 'CLOSE_MODAL' },
              },
            ],
          },
        },
      ],
    };
  }
}
