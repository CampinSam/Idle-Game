import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches, buildEntityPatch } from '../patch-builder';
import { CraftingService } from '../../crafting/crafting.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class StartCraftingHandler implements CommandHandler {
  constructor(
    private craftingService: CraftingService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { recipeId, entityId, locationId, quantity } = payload;

    const result = await this.craftingService.startCrafting(ctx.userId, recipeId, entityId, locationId, ctx.tx, quantity ?? 1);

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: result.id } });
    if (job) pb.upsertJob(job);

    await buildEntityPatch(pb, ctx.tx, entityId);
    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const notification = await this.notificationService.upsertJobNotification({
      userId: ctx.userId,
      jobId: result.id,
      type: 'crafting_started',
      category: 'crafting',
      priority: 'normal',
      title: 'Crafting Started',
      body: 'Crafting job has begun.',
      deepLink: { craftJobId: result.id },
    }, ctx.tx);
    pb.upsertNotification(notification);

    return {
      patches: pb.build(),
      ui: [
        { type: 'local_toast' as const, tone: 'info' as const, title: 'Crafting Started', body: 'Crafting job has begun.' },
        { type: 'notification' as const, notificationId: notification.id },
      ],
    };
  }
}
