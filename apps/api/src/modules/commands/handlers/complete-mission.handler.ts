import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchCurrencyMap } from '../patch-builder';
import { MissionService } from '../../mission/mission.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CompleteMissionHandler implements CommandHandler {
  constructor(
    private missionService: MissionService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;
    const tx = ctx.tx as any;

    const result = await this.missionService.completeMission(ctx.userId, jobId, tx);

    const pb = new PatchBuilder();

    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    const entityIds = result.missionResult?.entityIds || [];
    for (const entityId of entityIds) {
      const entity = await tx.entity.findUnique({
        where: { id: entityId },
        include: { equipment: true },
      });
      if (entity) pb.upsertEntity(entity);
    }

    const user = await tx.user.findUnique({ where: { id: ctx.userId } });
    if (user) pb.upsertPlayer(user);

    const currencyMap = await fetchCurrencyMap(tx, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const items = await tx.itemInstance.findMany({
      where: { userId: ctx.userId },
      include: { definition: true },
    });
    for (const item of items) pb.upsertItem(item);

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
