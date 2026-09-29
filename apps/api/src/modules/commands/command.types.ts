import { Prisma } from '@prisma/client';
import type { CommandHandlerResult as SharedCommandHandlerResult, Patch, UiIntent } from '@derp/shared';

export type { Patch, UiIntent };

export interface CommandHandlerResult extends SharedCommandHandlerResult {
  meta?: Record<string, any>;
}

export interface CommandContext {
  userId: string;
  tx: Prisma.TransactionClient;
}

export interface CommandHandler {
  execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult>;
}
