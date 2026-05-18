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
import { AchievementService } from '../../achievement/achievement.service';

@Injectable()
export class ClaimAchievementRewardHandler implements CommandHandler {
  constructor(private achievementService: AchievementService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { achievementInstanceId } = payload;

    const { grants, markedReadNotif } = await this.achievementService.claimReward(
      ctx.userId,
      achievementInstanceId,
      ctx.tx,
    );

    const updatedInstance = await (ctx.tx as any).achievementInstance.findUnique({
      where: { id: achievementInstanceId },
      include: { achievementDef: true },
    });

    const pb = new PatchBuilder();
    if (updatedInstance) {
      pb.upsertAchievement(updatedInstance);
    }
    if (markedReadNotif) pb.upsertNotification(markedReadNotif);
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    // Sync the new permanent effect (if any) so the UI sees the bonus
    // appear in the active-effects list immediately.
    await buildActiveEffectPatches(pb, ctx.tx, ctx.userId);

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
            id: `achievement-reward-${achievementInstanceId}`,
            kind: 'achievement_reward',
            dismiss: { backdrop: true, x: true, escape: true },
            header: {
              title: 'Achievement Unlocked!',
              subtitle: updatedInstance?.achievementDef?.name ?? undefined,
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
