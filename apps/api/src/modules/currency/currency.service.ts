import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface CreditParams {
  userId: string;
  currencyId: string;
  amount: number;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export interface SpendParams {
  userId: string;
  currencyId: string;
  amount: number;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  /** Resolve a slug or UUID to the canonical UUID id of a currency.
   *  Returns null if not found (instead of throwing). */
  private async tryResolveCurrencyUuid(slugOrUuid: string, client?: any): Promise<string | null> {
    const db = client ?? this.prisma;
    const row = await (db as any).currency.findFirst({
      where: { OR: [{ id: slugOrUuid }, { key: slugOrUuid }] },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Resolve a slug or UUID to the canonical UUID id of a currency.
   *  Throws NotFoundException if not found. */
  async resolveCurrencyUuid(slugOrUuid: string, client?: any): Promise<string> {
    const id = await this.tryResolveCurrencyUuid(slugOrUuid, client);
    if (!id) throw new NotFoundException(`Currency "${slugOrUuid}" not found`);
    return id;
  }

  async listCurrencies() {
    return this.prisma.currency.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getBalance(userId: string, currencyId: string): Promise<number> {
    const uuid = await this.tryResolveCurrencyUuid(currencyId);
    if (!uuid) return 0;
    const row = await this.prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId, currencyId: uuid } },
    });
    return Number(row?.balance ?? 0);
  }

  /** Returns a map keyed by currency slug (key) for backward-compat with game-rule lookups. */
  async getBalances(userId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.userCurrencyBalance.findMany({
      where: { userId },
      include: { currency: { select: { key: true } } },
    });
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[(row as any).currency.key] = Number(row.balance);
    }
    return result;
  }

  async credit(params: CreditParams): Promise<number> {
    const { userId, amount, reason, sourceType, sourceId, metadata } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const currencyId = await this.resolveCurrencyUuid(params.currencyId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.userCurrencyBalance.upsert({
        where: { userId_currencyId: { userId, currencyId } },
        create: { userId, currencyId, balance: BigInt(amount) },
        update: { balance: { increment: BigInt(amount) } },
      });

      await tx.currencyLedger.create({
        data: {
          userId,
          currencyId,
          delta: BigInt(amount),
          reason,
          sourceType: sourceType ?? null,
          sourceId: sourceId ?? null,
          metadata: metadata ?? {},
        },
      });

      const updated = await tx.userCurrencyBalance.findUnique({
        where: { userId_currencyId: { userId, currencyId } },
      });

      return Number(updated!.balance);
    });

    return result;
  }

  async spend(params: SpendParams): Promise<number> {
    const { userId, amount, reason, sourceType, sourceId, metadata } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const currencyId = await this.resolveCurrencyUuid(params.currencyId);
    const currency = await this.prisma.currency.findUnique({ where: { id: currencyId } });
    if (currency && !currency.isSpendable) {
      throw new BadRequestException(`${currency.name} is not spendable`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.userCurrencyBalance.findUnique({
        where: { userId_currencyId: { userId, currencyId } },
      });

      const currentBalance = Number(row?.balance ?? 0);
      if (currentBalance < amount) {
        throw new BadRequestException(`Insufficient ${currency?.name ?? params.currencyId}`);
      }

      await tx.userCurrencyBalance.update({
        where: { userId_currencyId: { userId, currencyId } },
        data: { balance: { decrement: BigInt(amount) } },
      });

      await tx.currencyLedger.create({
        data: {
          userId,
          currencyId,
          delta: BigInt(-amount),
          reason,
          sourceType: sourceType ?? null,
          sourceId: sourceId ?? null,
          metadata: metadata ?? {},
        },
      });

      const updated = await tx.userCurrencyBalance.findUnique({
        where: { userId_currencyId: { userId, currencyId } },
      });

      return Number(updated!.balance);
    });

    return result;
  }

  async getLedger(userId: string, currencyIdInput: string, limit = 50, offset = 0) {
    const currencyId = await this.resolveCurrencyUuid(currencyIdInput);

    const entries = await this.prisma.currencyLedger.findMany({
      where: { userId, currencyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return entries.map((e) => ({
      id: e.id.toString(),
      userId: e.userId,
      currencyId: e.currencyId,
      delta: Number(e.delta),
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async creditTx(tx: TxClient, params: CreditParams): Promise<bigint> {
    const { userId, amount, reason, sourceType, sourceId, metadata } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const currency = await (tx as any).currency.findFirst({
      where: { OR: [{ id: params.currencyId }, { key: params.currencyId }] },
    });
    if (!currency) throw new NotFoundException(`Currency "${params.currencyId}" not found`);
    const currencyId: string = currency.id;

    await tx.userCurrencyBalance.upsert({
      where: { userId_currencyId: { userId, currencyId } },
      create: { userId, currencyId, balance: BigInt(amount) },
      update: { balance: { increment: BigInt(amount) } },
    });

    await tx.currencyLedger.create({
      data: {
        userId,
        currencyId,
        delta: BigInt(amount),
        reason,
        sourceType: sourceType ?? null,
        sourceId: sourceId ?? null,
        metadata: metadata ?? {},
      },
    });

    const updated = await tx.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId, currencyId } },
    });

    return updated!.balance;
  }

  async spendTx(tx: TxClient, params: SpendParams): Promise<bigint> {
    const { userId, amount, reason, sourceType, sourceId, metadata } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const currency = await (tx as any).currency.findFirst({
      where: { OR: [{ id: params.currencyId }, { key: params.currencyId }] },
    });
    if (!currency) throw new NotFoundException(`Currency "${params.currencyId}" not found`);
    const currencyId: string = currency.id;

    if (!currency.isSpendable) {
      throw new BadRequestException(`${currency.name} is not spendable`);
    }

    const row = await tx.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId, currencyId } },
    });

    const currentBalance = Number(row?.balance ?? 0);
    if (currentBalance < amount) {
      throw new BadRequestException(`Insufficient ${currency.name}`);
    }

    await tx.userCurrencyBalance.update({
      where: { userId_currencyId: { userId, currencyId } },
      data: { balance: { decrement: BigInt(amount) } },
    });

    await tx.currencyLedger.create({
      data: {
        userId,
        currencyId,
        delta: BigInt(-amount),
        reason,
        sourceType: sourceType ?? null,
        sourceId: sourceId ?? null,
        metadata: metadata ?? {},
      },
    });

    const updated = await tx.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId, currencyId } },
    });

    return updated!.balance;
  }
}
