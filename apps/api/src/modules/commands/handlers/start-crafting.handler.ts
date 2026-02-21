import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, fetchCurrencyMap } from '../patch-builder';
import { CraftingService } from '../../crafting/crafting.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StartCraftingHandler implements CommandHandler {
  constructor(
    private craftingService: CraftingService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { recipeId, entityId } = payload;

    const result = await this.craftingService.startCrafting(ctx.userId, recipeId, entityId);

    const pb = new PatchBuilder();

    const job = await this.prisma.job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    const entity = await (this.prisma as any).entity.findUnique({
      where: { id: entityId },
      include: { equipment: true },
    });
    if (entity) pb.upsertEntity(entity);

    const currencyMap = await fetchCurrencyMap(this.prisma, ctx.userId);
    pb.upsertCurrencyBalances(currencyMap);

    const items = await this.prisma.itemInstance.findMany({
      where: { userId: ctx.userId },
      include: { definition: true },
    });
    for (const item of items) pb.upsertItem(item);

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'toast' as const,
          tone: 'info' as const,
          message: 'Crafting started!',
        },
      ],
    };
  }
}
