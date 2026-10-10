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
import { buildGrantsRewardsBlock } from './grant-label.util';
import { DefinitionCacheService } from '../../definition-cache/definition-cache.service';

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
  constructor(
    private questService: QuestService,
    private definitionCache: DefinitionCacheService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const questInstanceId = payload.achievementInstanceId ?? payload.questInstanceId;

    const { grants, permanentEffectId, readNotifications } = await this.questService.claimReward(
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
    for (const notif of readNotifications ?? []) {
      pb.upsertNotification(notif);
    }
    await buildItemPatches(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    if (permanentEffectId) {
      await buildActiveEffectPatches(pb, ctx.tx, ctx.userId);
    }

    const rewardsBlock = buildGrantsRewardsBlock(grants, this.definitionCache);
    const bodyBlock = rewardsBlock ?? {
      type: 'richText',
      doc: [{ t: 'p', c: [{ t: 'text', v: 'Achievement claimed.' }] }],
    };

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
                body: [bodyBlock as any],
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
