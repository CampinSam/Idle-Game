import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildEntityPatch, buildPlayerPatch } from '../patch-builder';
import { CraftingService } from '../../crafting/crafting.service';

@Injectable()
export class CollectCraftingHandler implements CommandHandler {
  constructor(private craftingService: CraftingService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    const result = await this.craftingService.collectCrafting(ctx.userId, jobId, ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    if (result.entityId) {
      await buildEntityPatch(pb, ctx.tx, result.entityId);
    }

    await buildPlayerPatch(pb, ctx.tx, ctx.userId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    if (result.updatedNotification) pb.upsertNotification(result.updatedNotification);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'success' as const, message: 'Crafting complete!' }],
    };
  }
}
