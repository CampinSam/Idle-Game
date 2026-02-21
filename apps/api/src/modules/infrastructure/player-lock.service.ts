import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlayerLockService {
  private readonly logger = new Logger(PlayerLockService.name);

  constructor(private prisma: PrismaService) {}

  async executeWithLock<T>(
    userId: string,
    tx: Prisma.TransactionClient,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    await tx.$queryRawUnsafe(
      `SELECT id FROM "users" WHERE id = $1 FOR UPDATE`,
      userId,
    );
    return fn(tx);
  }
}
