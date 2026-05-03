import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private prisma: PrismaService) {}

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

  /**
   * Generic idempotency wrapper for REST endpoints OUTSIDE the /v1/commands
   * pipeline (e.g. /gifts/:id/claim, /jobs/:id/skip, /crafting/:id/collect).
   *
   * Contract:
   *  - If `key` is missing/empty, just runs `fn()` with no dedupe (callers
   *    decide whether the header is required).
   *  - If a row exists for (userId, endpoint, key) with the SAME requestHash:
   *      • completed (responseJson set)  → returns cached, fn NOT re-executed
   *      • in-flight (responseJson null) → throws 409 (concurrent duplicate)
   *  - If a row exists with a DIFFERENT requestHash, throws 409 Conflict.
   *  - Otherwise reserves the row, runs `fn()`, then writes the response.
   *
   * RESERVE-FIRST design: we INSERT a placeholder row BEFORE running fn().
   * This is the only way to make `executeIdempotent` safe under concurrent
   * retries with side-effecting fn — the previous "find / fn / create"
   * sequence had a TOCTOU window where two parallel requests could both
   * pass the find, both execute fn() (double spend!), and only THEN race
   * on the create. With reserve-first, the second concurrent request sees
   * a placeholder row and is rejected before fn() runs.
   *
   * `commandType` is set to `endpoint` (NOT empty string) so the existing
   * `@@unique([userId, commandType, id])` constraint discriminates across
   * REST endpoints — otherwise the same key reused on /gifts/:id/claim and
   * /crafting/:id/collect would falsely collide.
   */
  async executeIdempotent<T>(
    userId: string,
    endpoint: string,
    key: string | undefined | null,
    requestPayload: Record<string, any>,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return fn();
    }

    const requestHash = this.hashRequest(requestPayload ?? {});

    // Reserve the key with a placeholder. If this succeeds we own the slot
    // and may safely run fn(). If it fails on P2002, another request beat
    // us to it — read what's there and decide.
    try {
      await (this.prisma as any).idempotencyKey.create({
        data: {
          id: key,
          userId,
          endpoint,
          commandType: endpoint,
          requestHash,
          responseJson: Prisma.JsonNull,
        },
      });
    } catch (err: any) {
      if (err.code !== 'P2002') throw err;

      const existing = await (this.prisma as any).idempotencyKey.findFirst({
        where: { userId, endpoint, id: key },
      });
      if (!existing) throw err; // unique conflict but row gone — re-throw

      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          `Idempotency-Key "${key}" already used on ${endpoint} with a different payload`,
        );
      }

      if (existing.responseJson === null || existing.responseJson === undefined) {
        // Another request is in-flight with the same key. Refuse rather
        // than let the caller assume success or block indefinitely.
        throw new ConflictException(
          `Idempotency-Key "${key}" is in-flight on ${endpoint}; retry after the original request completes`,
        );
      }

      this.logger.debug(`Idempotent replay for user=${userId} endpoint=${endpoint} key=${key}`);
      return existing.responseJson as T;
    }

    // We own the slot. Run fn(). On failure, free the placeholder so the
    // caller can retry with the same key. On success, write the response.
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      try {
        await (this.prisma as any).idempotencyKey.deleteMany({
          where: { userId, endpoint, id: key, responseJson: { equals: Prisma.JsonNull } },
        });
      } catch (cleanupErr) {
        this.logger.warn(
          `Failed to release idempotency placeholder after fn() error (user=${userId} endpoint=${endpoint} key=${key}): ${cleanupErr}`,
        );
      }
      throw err;
    }

    await (this.prisma as any).idempotencyKey.update({
      where: { userId_endpoint_id: { userId, endpoint, id: key } },
      data: { responseJson: result as any },
    });

    return result;
  }
}
