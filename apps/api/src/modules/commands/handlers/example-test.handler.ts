import { Injectable } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';

@Injectable()
export class ExampleTestCommandHandler implements CommandHandler {
  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const user = await (ctx.tx as any).user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, username: true, keeperLevel: true },
    });

    return {
      patches: [
        {
          op: 'upsert' as const,
          entity: 'player',
          id: ctx.userId,
          data: {
            id: user.id,
            username: user.username,
            keeperLevel: user.keeperLevel,
            lastPing: new Date().toISOString(),
          },
        },
      ],
      ui: [
        {
          type: 'toast' as const,
          tone: 'success' as const,
          message: `Test command executed for ${user.username}`,
        },
      ],
    };
  }
}
