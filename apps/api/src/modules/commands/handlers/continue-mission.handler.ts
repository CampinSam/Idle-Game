import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildPlayerPatch, buildEntityPatch } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class ContinueMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;
    if (!jobId) throw new BadRequestException('jobId is required');

    const job = await (ctx.tx as any).job.findFirst({
      where: { id: jobId, userId: ctx.userId, type: 'MissionJob', status: 'phase_ready' },
    });
    if (!job) throw new NotFoundException('No phase_ready mission found with that id');

    const def = await (ctx.tx as any).missionDef.findFirst({ where: { OR: [{ id: job.defId }, { key: job.defId }] } });
    const phases: any[] = Array.isArray(def?.phases) ? def.phases : [];
    const nextPhaseIndex = (job.currentPhase ?? 0) + 1;

    const pb = new PatchBuilder();
    let notifTitle: string;
    let notifBody: string;

    if (nextPhaseIndex < phases.length) {
      await this.missionService.advanceToNextPhase(ctx.userId, jobId, ctx.tx);
      const updatedJob = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
      if (updatedJob) pb.upsertJob(updatedJob);
      notifTitle = 'Next Phase Begun';
      notifBody = `Phase ${nextPhaseIndex + 1} of ${phases.length} underway.`;
    } else {
      const result = await this.missionService.completeMission(ctx.userId, jobId, ctx.tx);
      const updatedJob = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
      if (updatedJob) pb.upsertJob(updatedJob);
      const entityIds: string[] = result.missionResult?.entityIds || [];
      for (const entityId of entityIds) {
        await buildEntityPatch(pb, ctx.tx, entityId);
      }
      await buildPlayerPatch(pb, ctx.tx, ctx.userId);
      await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
      await buildItemPatches(pb, ctx.tx, ctx.userId);
      const removedEffectIds: string[] = result.missionResult?.removedEffectIds || [];
      for (const effectId of removedEffectIds) {
        pb.deleteActiveEffect(effectId);
      }
      notifTitle = result.missionResult?.success ? 'Expedition Complete!' : 'Expedition Failed';
      notifBody = result.missionResult?.rewards?.map((r: any) => `${r.amount}x ${r.name || r.key || r.type}`).join(', ') || 'Expedition concluded.';
    }

    const notification = await this.notificationService.upsertJobNotification({
      userId: ctx.userId,
      jobId,
      type: 'mission_continue',
      category: 'missions',
      priority: 'low',
      title: notifTitle,
      body: notifBody,
      deepLink: { jobId },
      readAt: new Date(),
    }, ctx.tx);
    pb.upsertNotification(notification);

    return { patches: pb.build(), ui: [] };
  }
}
