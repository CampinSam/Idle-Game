import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches } from '../patch-builder';
import { DustingService } from '../../dusting/dusting.service';

@Injectable()
export class SkipDustingHandler implements CommandHandler {
  constructor(private dustingService: DustingService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    const result = await this.dustingService.skipDusting(ctx.userId, { jobId }, ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: 'Dusting skipped! Ready to collect.' }],
    };
  }
}
