import { Injectable, BadRequestException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder } from '../patch-builder';
import { CheckInService } from '../../checkin/checkin.service';

@Injectable()
export class ClaimCheckInHandler implements CommandHandler {
  constructor(private checkInService: CheckInService) {}

  async execute(ctx: CommandContext, _payload: any): Promise<CommandHandlerResult> {
    const issuedGiftIds = await this.checkInService.autoCheck(ctx.userId);

    if (issuedGiftIds.length === 0) {
      throw new BadRequestException('Already checked in for the current window');
    }

    const pb = new PatchBuilder();

    const updatedInstances = await (ctx.tx as any).checkInInstance.findMany({
      where: { userId: ctx.userId },
      include: { checkInDef: true },
    });
    for (const inst of updatedInstances) {
      pb.upsert('checkIn', inst.id, inst);
    }

    const newGifts = await (ctx.tx as any).gift.findMany({
      where: { id: { in: issuedGiftIds } },
    });
    for (const gift of newGifts) {
      pb.upsert('gift', gift.id, gift);
    }

    const streaks = updatedInstances
      .map((i: any) => i.streak)
      .filter((s: any) => typeof s === 'number');
    const maxStreak = streaks.length > 0 ? Math.max(...streaks) : 0;

    return {
      patches: pb.build(),
      ui: [
        {
          type: 'local_toast' as const,
          tone: 'success' as const,
          title: 'Checked In!',
          body: 'Streak: ' + maxStreak,
        },
      ],
    };
  }
}
