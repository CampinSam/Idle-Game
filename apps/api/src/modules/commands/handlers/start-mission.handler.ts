import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildEntityPatch } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';

@Injectable()
export class StartMissionHandler implements CommandHandler {
  constructor(private missionService: MissionService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { defId, entityIds } = payload;

    const result = await this.missionService.startMission(ctx.userId, defId, entityIds || [], ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    for (const entityId of (entityIds || [])) {
      await buildEntityPatch(pb, ctx.tx, entityId);
    }

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: 'Mission started!' }],
    };
  }
}
