import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch, buildCurrencyPatches, buildItemPatches } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class AbandonMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;
    if (!jobId) throw new BadRequestException('jobId is required');

    const result = await this.missionService.abandonMission(ctx.userId, jobId, ctx.tx);

    const pb = new PatchBuilder();
    const updatedJob = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
    if (updatedJob) pb.upsertJob(updatedJob);

    const entityIds: string[] = result.entityIds || [];
    for (const entityId of entityIds) {
      await buildEntityPatch(pb, ctx.tx, entityId);
    }

    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const removedEffectIds: string[] = result.removedEffectIds || [];
    for (const effectId of removedEffectIds) {
      pb.deleteActiveEffect(effectId);
    }

    const notification = await this.notificationService.upsertJobNotification({
      userId: ctx.userId,
      jobId,
      type: 'mission_abandoned',
      category: 'missions',
      priority: 'normal',
      title: 'Expedition Abandoned',
      body: 'Expedition abandoned — all progress forfeited.',
      deepLink: { jobId },
      readAt: new Date(),
    }, ctx.tx);
    pb.upsertNotification(notification);

    return { patches: pb.build(), ui: [] };
  }
}
