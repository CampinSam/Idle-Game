import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildEntityPatch } from '../patch-builder';
import { CraftingService } from '../../crafting/crafting.service';

@Injectable()
export class StartCraftingHandler implements CommandHandler {
  constructor(private craftingService: CraftingService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { recipeId, entityId, locationId } = payload;

    const result = await this.craftingService.startCrafting(ctx.userId, recipeId, entityId, locationId, ctx.tx);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    await buildEntityPatch(pb, ctx.tx, entityId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    return {
      patches: pb.build(),
      ui: [{ type: 'toast' as const, tone: 'info' as const, message: 'Crafting started!' }],
    };
  }
}
