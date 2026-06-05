import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch, buildCurrencyPatches, buildItemPatches } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class StartMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { defId, entityIds } = payload;

    const result = await this.missionService.startMission(ctx.userId, defId, entityIds || [], ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    for (const entityId of (entityIds || [])) {
      await buildEntityPatch(pb, ctx.tx, entityId);
    }

    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'mission_started',
      category: 'missions',
      title: 'Mission Started',
      body: 'Your mission is underway.',
      deepLink: { missionRunId: result.id },
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [{ type: 'notification' as const, notificationId: notification.id }],
      meta: {
        synergyPreview: result.synergyPreview,
      },
    };
  }
}
