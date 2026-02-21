import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchCurrencyMap } from '../patch-builder';
import { CraftingService } from '../../crafting/crafting.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CollectCraftingHandler implements CommandHandler {
  constructor(
    private craftingService: CraftingService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    const result = await this.craftingService.collectCrafting(ctx.userId, jobId);

    const pb = new PatchBuilder();

    const job = await ctx.tx.job.findUnique({ where: { id: jobId } });
    if (job) pb.upsertJob(job);

    const entityId = result.entityId;
    if (entityId) {
      const entity = await (ctx.tx as any).entity.findUnique({
        where: { id: entityId },
        include: { equipment: true },
      });
      if (entity) pb.upsertEntity(entity);
    }

    const user = await ctx.tx.user.findUnique({ where: { id: ctx.userId } });
    if (user) pb.upsertPlayer(user);

    const currencyMap = await fetchCurrencyMap(ctx.tx, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const items = await ctx.tx.itemInstance.findMany({
      where: { userId: ctx.userId },
      include: { definition: true },
    });
    for (const item of items) pb.upsertItem(item);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: `Crafting complete!`,
        },
      ],
    };
  }
}
