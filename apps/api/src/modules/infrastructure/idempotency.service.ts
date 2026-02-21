import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  hashRequest(payload: Record<string, any>): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async checkExisting(
    tx: Prisma.TransactionClient,
    userId: string,
    commandType: string,
    key: string,
    currentRequestHash: string,
  ): Promise<{ responseJson: any } | null> {
    const existing = await (tx as any).idempotencyKey.findFirst({
      where: {
        userId,
        commandType,
        id: key,
      },
    });

    if (existing && existing.requestHash !== currentRequestHash) {
      throw new ConflictException(
        `Idempotency key "${key}" already used with a different payload`,
      );
    }

    return existing;
  }

  async store(
    tx: Prisma.TransactionClient,
    userId: string,
    commandType: string,
    key: string,
    requestHash: string,
    responseJson: any,
  ): Promise<void> {
    await (tx as any).idempotencyKey.create({
      data: {
        id: key,
        userId,
        endpoint: `cmd:${commandType}`,
        commandType,
        requestHash,
        responseJson,
      },
    });
  }
}
