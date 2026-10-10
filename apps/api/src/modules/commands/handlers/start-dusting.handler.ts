import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildCurrencyPatches, buildItemPatches } from '../patch-builder';
import { DustingService } from '../../dusting/dusting.service';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class StartDustingHandler implements CommandHandler {
  constructor(
    private dustingService: DustingService,
    private notificationService: NotificationService,
  ) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { itemInstanceId, quantity } = payload;

    const result = await this.dustingService.startDusting(
      ctx.userId,
      { itemInstanceId, quantity: quantity ?? 1 },
      ctx.tx,
    );

    const pb = new PatchBuilder();

    const job = await (ctx.tx as any).job.findUnique({ where: { id: result.job.id } });
    if (job) pb.upsertJob(job);

    await buildCurrencyPatches(pb, ctx.tx, ctx.userId);
    await buildItemPatches(pb, ctx.tx, ctx.userId);

    const instantRewards = result.instantRewards;

    if (!instantRewards) {
      const notification = await this.notificationService.upsertJobNotification({
        userId: ctx.userId,
        jobId: result.job.id,
        type: 'dusting_started',
        category: 'inventory',
        priority: 'normal',
        title: 'Dusting Started',
        body: 'Dusting job has begun.',
        deepLink: { jobId: result.job.id },
        readAt: new Date(),
      }, ctx.tx);
      pb.upsertNotification(notification);
    }

    return {
      patches: pb.build(),
      ui: [],
      meta: instantRewards ? { instantRewards, jobId: result.job.id } : undefined,
    };
  }
}
