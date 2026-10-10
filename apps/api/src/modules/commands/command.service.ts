import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { assertCommandRequest, assertCommandResponse } from '@derp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CommandRouter } from './command.router';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import { PlayerLockService } from '../infrastructure/player-lock.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { Patch, UiIntent } from './command.types';

export interface CommandInput {
  type: string;
  payload: Record<string, any>;
  idempotencyKey: string;
}

export interface CommandOutput {
  patches: Patch[];
  ui: UiIntent[];
  cursor: { delta: string };
  meta?: Record<string, any>;
}

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(
    private prisma: PrismaService,
    private router: CommandRouter,
    private idempotency: IdempotencyService,
    private playerLock: PlayerLockService,
    private pubsub: PubSubService,
  ) {}

  async execute(userId: string, input: CommandInput): Promise<CommandOutput> {
    try {
      assertCommandRequest(input);
    } catch (error) {
      throw new BadRequestException(
        `Invalid command request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const handler = this.router.resolve(input.type);
    const requestHash = this.idempotency.hashRequest(input.payload);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await this.idempotency.checkExisting(
          tx,
          userId,
          input.type,
          input.idempotencyKey,
          requestHash,
        );

        if (existing) {
          this.logger.debug(
            `Idempotent replay for user=${userId} cmd=${input.type} key=${input.idempotencyKey}`,
          );
          return this.validateResponse(existing.responseJson, 'Persisted idempotent replay');
        }

        return this.playerLock.executeWithLock(userId, tx, async (lockedTx) => {
          const handlerResult = await handler.execute(
            { userId, tx: lockedTx },
            input.payload,
          );
          // Validate handler output before any delta or idempotency write.
          this.validateResponse(
            {
              patches: handlerResult?.patches,
              ui: handlerResult?.ui,
              cursor: { delta: '0' },
              ...(handlerResult?.meta ? { meta: handlerResult.meta } : {}),
            },
            'Command handler',
          );

          const delta = await (lockedTx as any).playerDelta.create({
            data: {
              userId,
              patches: handlerResult.patches as any,
              ui: handlerResult.ui as any,
            },
          });

          const output: CommandOutput = {
            patches: handlerResult.patches,
            ui: handlerResult.ui,
            cursor: { delta: delta.id.toString() },
            ...(handlerResult.meta ? { meta: handlerResult.meta } : {}),
          };
          this.validateResponse(output, 'Command response');

          await this.idempotency.store(
            lockedTx,
            userId,
            input.type,
            input.idempotencyKey,
            requestHash,
            output,
          );

          return output;
        });
      },
      {
        maxWait: 10000,
        timeout: 60000,
        isolationLevel: 'ReadCommitted',
      },
    );

    this.pubsub.publish(`player:${userId}`, {
      userId,
      deltaId: result.cursor.delta,
    });

    return result;
  }

  private validateResponse(value: unknown, source: string): CommandOutput {
    try {
      assertCommandResponse(value);
      return value;
    } catch (error) {
      throw new InternalServerErrorException(
        `${source} produced an invalid command response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
