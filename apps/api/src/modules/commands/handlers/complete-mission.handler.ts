import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildPlayerPatch, buildEntityPatch } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';

@Injectable()
export class CompleteMissionHandler implements CommandHandler {
  constructor(private missionService: MissionService) {}

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

    const missionResult = result.missionResult;
    const success = missionResult?.success;

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: success ? 'success' as const : 'info' as const,
          message: success
            ? `Mission complete! ${missionResult?.rewards?.map((r: any) => `${r.amount}x ${r.name || r.key || r.type}`).join(', ') || ''}`
            : 'Mission failed — better luck next time',
        },
      ],
    };
  }
}
