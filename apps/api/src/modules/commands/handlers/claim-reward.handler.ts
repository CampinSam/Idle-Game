import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { Patch } from '../command.types';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class ClaimRewardHandler implements CommandHandler {
  constructor(private notificationService: NotificationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { jobId } = payload;

    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    const job = await (ctx.tx as any).job.findFirst({
      where: {
        id: jobId,
        userId: ctx.userId,
        status: 'active',
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found or already claimed');
    }

    const timer = job.timer as any;
    const now = Date.now();

    if (timer.endsAt && now < timer.endsAt) {
      throw new BadRequestException('Job timer has not completed yet');
    }

    await (ctx.tx as any).job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        results: { claimedAt: now },
      },
    });

    const patches: Patch[] = [
      {
        op: 'upsert',
        entity: 'job',
        id: job.id,
        data: {
          id: job.id,
          type: job.type,
          defId: job.defId,
          status: 'completed',
          results: { claimedAt: now },
        },
      },
    ];

    const notification = await this.notificationService.createForCommand({
      userId: ctx.userId,
      type: 'reward_claimed',
      category: 'general',
      title: 'Reward Claimed',
      body: 'Your reward has been collected.',
    }, ctx.tx);
    patches.push({ op: 'upsert', entity: 'notification', id: notification.id, data: notification });

    return { patches, ui: [{ type: 'notification' as const, notificationId: notification.id }] };
  }
}
