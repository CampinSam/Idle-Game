import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { Patch, UiIntent } from '../command.types';

@Injectable()
export class ClaimRewardHandler implements CommandHandler {
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

    const ui: UiIntent[] = [
      {
        type: 'toast',
        tone: 'success',
        message: 'Reward claimed!',
      },
    ];

    return { patches, ui };
  }
}
