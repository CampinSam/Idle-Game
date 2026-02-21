import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchCurrencyMap } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StartMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { defId, entityIds } = payload;
    const tx = ctx.tx as any;

    const result = await this.missionService.startMission(ctx.userId, defId, entityIds || [], tx);

    const pb = new PatchBuilder();

    const job = await tx.job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    for (const entityId of (entityIds || [])) {
      const entity = await tx.entity.findUnique({
        where: { id: entityId },
        include: { equipment: true },
      });
      if (entity) pb.upsertEntity(entity);
    }

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'info' as const,
          message: `Mission started!`,
        },
      ],
    };
  }
}
