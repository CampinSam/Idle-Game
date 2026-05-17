import { Prisma } from '@prisma/client';
import type { ModalSpecV1 } from '@derp/shared';

export type Patch =
  | { op: 'upsert'; entity: string; id: string; data: any }
  | { op: 'delete'; entity: string; id: string };

export type UiIntent =
  | { type: 'modal'; spec: ModalSpecV1 }
  | { type: 'toast'; tone: 'success' | 'error' | 'info'; message: string }
  | { type: 'navigate'; deepLink: string };

export interface CommandHandlerResult {
  patches: Patch[];
  ui: UiIntent[];
  meta?: Record<string, any>;
}

export interface CommandContext {
  userId: string;
  tx: Prisma.TransactionClient;
}

export interface CommandHandler {
  execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult>;
}
