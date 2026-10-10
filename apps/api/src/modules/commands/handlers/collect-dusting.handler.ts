import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildPlayerPatch } from '../patch-builder';
import { DustingService } from '../../dusting/dusting.service';

@Injectable()
export class CollectDustingHandler implements CommandHandler {
  constructor(private dustingService: DustingService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    const result = await this.dustingService.collectDusting(ctx.userId, { jobId }, ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    await buildPlayerPatch(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    if (result.updatedNotification) pb.upsertNotification(result.updatedNotification);

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
