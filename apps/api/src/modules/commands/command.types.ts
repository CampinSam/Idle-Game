import { Prisma } from '@prisma/client';

export type Patch =
  | { op: 'upsert'; entity: string; id: string; data: any }
  | { op: 'delete'; entity: string; id: string };

export type UiIntent =
  | { type: 'modal'; key: string; title: string; body: any; buttons: any[] }
  | { type: 'toast'; tone: 'success' | 'error' | 'info'; message: string }
  | { type: 'navigate'; deepLink: string };

export interface CommandHandlerResult {
  patches: Patch[];
  ui: UiIntent[];
}

export interface CommandContext {
  userId: string;
  tx: Prisma.TransactionClient;
}

export interface CommandHandler {
  execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult>;
}
