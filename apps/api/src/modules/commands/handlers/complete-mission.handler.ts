import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildPlayerPatch, buildEntityPatch, buildMissionDefStatusPatches } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { NotificationService } from '../../notification/notification.service';
import { GameRulesService } from '../../game-rules/game-rules.service';

@Injectable()
export class CompleteMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private notificationService: NotificationService,
    private gameRules: GameRulesService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    const result = await this.missionService.completeMission(ctx.userId, jobId, ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    const entityIds = result.missionResult?.entityIds || [];
    for (const entityId of entityIds) {
      await buildEntityPatch(pb, ctx.tx, entityId);
    }

    await buildPlayerPatch(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    // If mission completion resolved any player flags, push updated requirement
    // status for all category/mission defs so the client can unlock gated
    // content in the same render cycle — no separate HTTP refetch needed.
    if ((result.missionResult as any)?.resolvedFlagCount > 0) {
      await buildMissionDefStatusPatches(pb, ctx.tx, ctx.userId, this.gameRules);
    }

    const removedEffectIds: string[] = result.missionResult?.removedEffectIds || [];
    for (const effectId of removedEffectIds) {
      pb.deleteActiveEffect(effectId);
    }

    const missionResult = result.missionResult;
    const success = missionResult?.success;
    const title = success ? 'Mission Complete!' : 'Mission Failed';
    const body = success
      ? (missionResult?.rewards?.map((r: any) => `${r.amount}x ${r.name || r.key || r.type}`).join(', ') || 'Rewards collected.')
      : 'Better luck next time.';

    const notification = await this.notificationService.upsertJobNotification({
      userId: ctx.userId,
      jobId,
      type: 'mission_complete',
      category: 'missions',
      priority: 'normal',
      title,
      body,
      deepLink: { jobId },
      readAt: new Date(),
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
