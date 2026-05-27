import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { AdaRateService } from './ada-rate.service';
import { PatchBuilder, buildCurrencyPatches } from '../commands/patch-builder';

const CNT_POLICY_ID_DEFAULT = 'd9d59e71eb99e653a493956a6826a406060706bd8c9a2427b3564f6';
const CNT_ASSET_NAME_DEFAULT = '45525020434f494e';
const CURRENCY_ID = 'crypto_derp';
const BLOCKFROST_BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';
const POLL_INTERVAL_MS = 20_000;

function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const key of Object.keys(obj)) result[key] = serializeBigInts(obj[key]);
    return result;
  }
  return obj;
}

@Injectable()
export class CryptoWalletService {
  private readonly logger = new Logger(CryptoWalletService.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    private readonly pubsub: PubSubService,
    private readonly adaRateService: AdaRateService,
  ) {}

  onModuleInit() {
    this.intervalRef = setInterval(() => {
      this.pollDeposits().catch((err) => {
        this.logger.error(`CNT deposit poll error: ${err}`);
      });
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  async getConfig() {
    const config = await (this.prisma as any).cryptoWalletConfig.findUnique({
      where: { id: 'default' },
    });
    if (!config) {
      const created = await (this.prisma as any).cryptoWalletConfig.create({
        data: {
          id: 'default',
          cntPolicyId: CNT_POLICY_ID_DEFAULT,
          cntAssetName: CNT_ASSET_NAME_DEFAULT,
        },
      });
      return serializeBigInts(created);
    }
    return serializeBigInts(config);
  }

  async updateConfig(data: {
    hotWalletAddress?: string;
    cntPolicyId?: string;
    cntAssetName?: string;
    cntPriceAda?: number;
    minWithdrawalType?: string;
    minWithdrawalAmount?: number;
    withdrawalFee?: number;
    autoApprovalThreshold?: number;
  }) {
    const updateData: any = {};
    if (data.hotWalletAddress !== undefined) updateData.hotWalletAddress = data.hotWalletAddress;
    if (data.cntPolicyId !== undefined) updateData.cntPolicyId = data.cntPolicyId;
    if (data.cntAssetName !== undefined) updateData.cntAssetName = data.cntAssetName;
    if ((data as any).blockfrostProjectId !== undefined) updateData.blockfrostProjectId = (data as any).blockfrostProjectId;
    if (data.cntPriceAda !== undefined) updateData.cntPriceAda = data.cntPriceAda;
    if (data.minWithdrawalType !== undefined) updateData.minWithdrawalType = data.minWithdrawalType;
    if (data.minWithdrawalAmount !== undefined) updateData.minWithdrawalAmount = data.minWithdrawalAmount;
    if (data.withdrawalFee !== undefined) updateData.withdrawalFee = BigInt(Math.round(data.withdrawalFee));
    if (data.autoApprovalThreshold !== undefined) updateData.autoApprovalThreshold = BigInt(Math.round(data.autoApprovalThreshold));

    const saved = await (this.prisma as any).cryptoWalletConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...updateData },
      update: updateData,
    });
    return serializeBigInts(saved);
  }

  private getBlockfrostApiKey(config: any): string | null {
    return config.blockfrostProjectId?.trim() || process.env.BLOCKFROST_API_KEY || null;
  }

  async getHotWalletBalance(): Promise<{ ada: string; cnt: string } | null> {
    const config = await this.getConfig();
    const apiKey = this.getBlockfrostApiKey(config);
    if (!apiKey || !config.hotWalletAddress) return null;

    try {
      const resp = await fetch(
        `${BLOCKFROST_BASE}/addresses/${config.hotWalletAddress}`,
        { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
      );
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const amounts: Array<{ unit: string; quantity: string }> = data.amount ?? [];

      const lovelace = amounts.find((a) => a.unit === 'lovelace');
      const adaNum = lovelace ? (Number(lovelace.quantity) / 1_000_000).toFixed(6) : '0.000000';

      const policyId = config.cntPolicyId || CNT_POLICY_ID_DEFAULT;
      const assetName = config.cntAssetName || CNT_ASSET_NAME_DEFAULT;
      const unit = `${policyId}${assetName}`;
      const cntEntry = amounts.find((a) => a.unit === unit);
      const cnt = cntEntry ? cntEntry.quantity : '0';

      return { ada: adaNum, cnt };
    } catch (err) {
      this.logger.warn(`getHotWalletBalance failed: ${err}`);
      return null;
    }
  }

  async requestWithdrawal(userId: string, amount: number, destinationAddress: string): Promise<any> {
    if (!destinationAddress?.trim()) {
      throw new BadRequestException('destinationAddress is required');
    }
    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const amountInt = Math.floor(amount);
    if (amountInt !== amount) {
      throw new BadRequestException('amount must be a whole number (no decimals)');
    }

    const config = await this.getConfig();
    const fee = Number(config.withdrawalFee ?? 0);
    const net = amount - fee;

    if (net <= 0) {
      throw new BadRequestException(`Amount must be greater than the fee (${fee})`);
    }

    await this.validateMinWithdrawal(config, amount);

    const autoApprovalThreshold = Number(config.autoApprovalThreshold ?? 0);
    const isAutoApproved = autoApprovalThreshold > 0 && amount <= autoApprovalThreshold;

    // Atomic: deduct balance + create withdrawal record in a single transaction
    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const currency = await tx.currency.findUnique({ where: { id: CURRENCY_ID } });
      if (!currency) throw new BadRequestException(`Currency ${CURRENCY_ID} not found`);

      const balanceRow = await tx.userCurrencyBalance.findUnique({
        where: { userId_currencyId: { userId, currencyId: CURRENCY_ID } },
      });
      const currentBalance = Number(balanceRow?.balance ?? 0);
      if (currentBalance < amount) {
        throw new BadRequestException('Insufficient DERP balance');
      }

      await tx.userCurrencyBalance.update({
        where: { userId_currencyId: { userId, currencyId: CURRENCY_ID } },
        data: { balance: { decrement: BigInt(amount) } },
      });

      await tx.currencyLedger.create({
        data: {
          userId,
          currencyId: CURRENCY_ID,
          delta: BigInt(-amount),
          reason: 'DERP withdrawal request (on-chain)',
          sourceType: 'crypto_withdrawal',
          sourceId: null,
          metadata: { destinationAddress, fee },
        },
      });

      return (tx as any).cryptoWithdrawal.create({
        data: {
          userId,
          currencyId: CURRENCY_ID,
          amount: BigInt(amount),
          fee: BigInt(fee),
          destinationAddress,
          status: isAutoApproved ? 'APPROVED' : 'PENDING',
          autoApproved: isAutoApproved,
        },
      });
    });

    await this.emitCurrencyDelta(userId);
    return serializeBigInts(withdrawal);
  }

  async getPlayerWithdrawals(userId: string, limit = 20): Promise<any[]> {
    const rows = await (this.prisma as any).cryptoWithdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(serializeBigInts);
  }

  async getPlayerDepositHistory(userId: string, limit = 20): Promise<any[]> {
    const rows = await this.prisma.currencyLedger.findMany({
      where: { userId, currencyId: CURRENCY_ID, sourceType: 'CRYPTO_DEPOSIT' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((e) => ({
      id: e.id.toString(),
      delta: Number(e.delta),
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /**
   * Validates the withdrawal amount against the configured minimum.
   *
   * - QUANTITY:   plain CNT unit count check
   * - ADA_VALUE:  converts CNT → ADA using admin-set cntPriceAda; checks ADA value
   * - USD_VALUE:  converts CNT → ADA → USD using cntPriceAda + live AdaRateService
   */
  private async validateMinWithdrawal(config: any, amount: number): Promise<void> {
    const minType = config.minWithdrawalType as string;
    const minAmount = Number(config.minWithdrawalAmount ?? 1);

    if (minType === 'QUANTITY') {
      if (amount < minAmount) {
        throw new BadRequestException(`Minimum withdrawal is ${minAmount} DERP`);
      }
      return;
    }

    if (minType === 'ADA_VALUE') {
      const cntPriceAda = Number(config.cntPriceAda ?? 0);
      if (cntPriceAda <= 0) {
        // Fall back to quantity check if price is not configured
        if (amount < minAmount) {
          throw new BadRequestException(`Minimum withdrawal is ${minAmount} DERP (ADA price not configured)`);
        }
        return;
      }
      const adaValue = amount * cntPriceAda;
      if (adaValue < minAmount) {
        throw new BadRequestException(
          `Minimum withdrawal is ${minAmount} ADA (your withdrawal is worth ≈${adaValue.toFixed(4)} ADA)`,
        );
      }
      return;
    }

    if (minType === 'USD_VALUE') {
      const cntPriceAda = Number(config.cntPriceAda ?? 0);
      if (cntPriceAda <= 0) {
        if (amount < minAmount) {
          throw new BadRequestException(`Minimum withdrawal is $${minAmount} USD (ADA price not configured)`);
        }
        return;
      }
      const adaValue = amount * cntPriceAda;
      // adaValue in ADA → USD: lovelacePerUsd = lovelace per $1
      const lovelacePerUsd = await this.adaRateService.getLovelacePerUsd();
      const adaPerUsd = lovelacePerUsd / 1_000_000;
      const usdValue = adaValue / adaPerUsd;
      if (usdValue < minAmount) {
        throw new BadRequestException(
          `Minimum withdrawal is $${minAmount} USD (your withdrawal is worth ≈$${usdValue.toFixed(2)} USD)`,
        );
      }
      return;
    }

    // Unknown type — fall back to quantity
    if (amount < minAmount) {
      throw new BadRequestException(`Minimum withdrawal is ${minAmount}`);
    }
  }

  /**
   * Cursor-based deposit poller.
   *
   * Uses Blockfrost's ASC-ordered pagination with a persisted page cursor so:
   * - Every tx is visited exactly once (no missed or duplicate credits).
   * - On first run (depositScanPage = 0) it discovers the total page count and
   *   starts from the CURRENT page, skipping historical txs to prevent accidental
   *   back-crediting on first deployment.
   * - `ProcessedCryptoTx` (unique PK on txHash) is the single idempotency source
   *   of truth and also guards against concurrent pollers.
   */
  async pollDeposits(): Promise<void> {
    const config = await this.getConfig();
    const apiKey = this.getBlockfrostApiKey(config);

    if (!apiKey || !config.hotWalletAddress) return;

    const policyId = config.cntPolicyId || CNT_POLICY_ID_DEFAULT;
    const assetName = config.cntAssetName || CNT_ASSET_NAME_DEFAULT;
    const unit = `${policyId}${assetName}`;
    const PAGE_SIZE = 50;

    try {
      let scanPage: number = Number(config.depositScanPage ?? 0);

      // First-run initialization: start from the current latest page to skip history
      if (scanPage === 0) {
        const initPage = await this.discoverCurrentPage(config.hotWalletAddress, apiKey, PAGE_SIZE);
        scanPage = initPage;
        await this.saveScanPage(scanPage);
        this.logger.log(`CNT deposit poller initialized at page ${scanPage} (history skipped)`);
        return; // process new txs starting next poll
      }

      // Drain all pages from cursor forward
      while (true) {
        const resp = await fetch(
          `${BLOCKFROST_BASE}/addresses/${config.hotWalletAddress}/transactions?order=asc&count=${PAGE_SIZE}&page=${scanPage}`,
          { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
        );

        if (resp.status === 404) break; // address has no txs yet
        if (!resp.ok) {
          this.logger.warn(`Blockfrost page ${scanPage} responded ${resp.status}`);
          break;
        }

        const txList = (await resp.json()) as Array<{ tx_hash: string; block_time: number }>;

        for (const { tx_hash, block_time } of txList) {
          await this.processDepositTx(tx_hash, block_time, config.hotWalletAddress, apiKey, unit);
        }

        if (txList.length < PAGE_SIZE) {
          // At the tip — stay on this page for next poll (new txs may still arrive here)
          break;
        }

        // Full page — advance cursor
        scanPage += 1;
        await this.saveScanPage(scanPage);
      }
    } catch (err) {
      this.logger.warn(`pollDeposits error: ${err}`);
    }
  }

  private async discoverCurrentPage(address: string, apiKey: string, pageSize: number): Promise<number> {
    // Binary-search-style: fetch a large page number descending to find current tip page
    // Simple approach: start at page 1 asc, walk until we get a partial page
    let page = 1;
    while (true) {
      const resp = await fetch(
        `${BLOCKFROST_BASE}/addresses/${address}/transactions?order=asc&count=${pageSize}&page=${page}`,
        { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
      );
      if (!resp.ok || resp.status === 404) return page;
      const list = (await resp.json()) as any[];
      if (list.length < pageSize) return page; // partial page = tip
      page += 1;
    }
  }

  private async saveScanPage(page: number): Promise<void> {
    try {
      await (this.prisma as any).cryptoWalletConfig.update({
        where: { id: 'default' },
        data: { depositScanPage: page },
      });
    } catch (err) {
      this.logger.warn(`saveScanPage failed: ${err}`);
    }
  }

  private async processDepositTx(
    tx_hash: string,
    block_time: number,
    hotWalletAddress: string,
    apiKey: string,
    unit: string,
  ): Promise<void> {
    const utxoResp = await fetch(
      `${BLOCKFROST_BASE}/txs/${tx_hash}/utxos`,
      { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
    );
    if (!utxoResp.ok) return;

    const utxos = (await utxoResp.json()) as {
      inputs: Array<{ address: string }>;
      outputs: Array<{ address: string; amount: Array<{ unit: string; quantity: string }> }>;
    };

    const senderAddresses = (utxos.inputs ?? []).map((inp) => inp.address);

    let cntAmount = 0n;
    for (const output of utxos.outputs ?? []) {
      if (output.address !== hotWalletAddress) continue;
      const cntEntry = output.amount?.find((a) => a.unit === unit);
      if (cntEntry) cntAmount += BigInt(cntEntry.quantity);
    }

    if (cntAmount <= 0n) return; // not a CNT deposit tx — skip silently

    const player = await this.findPlayerBySenderAddresses(senderAddresses);
    if (!player) {
      this.logger.warn(`CNT deposit tx ${tx_hash}: no linked player for senders [${senderAddresses.join(', ')}]`);
      // Still mark processed via the ProcessedCryptoTx insert below so we don't re-examine it
    }

    // Atomic credit + idempotency gate.
    // ProcessedCryptoTx PK is the single source of truth; concurrent pollers get P2002 and skip.
    try {
      await this.prisma.$transaction(async (tx) => {
        await (tx as any).processedCryptoTx.create({ data: { txHash: tx_hash } });

        if (!player) return; // tx is sealed; no credit (unlinked sender)

        await tx.userCurrencyBalance.upsert({
          where: { userId_currencyId: { userId: player.userId, currencyId: CURRENCY_ID } },
          create: { userId: player.userId, currencyId: CURRENCY_ID, balance: cntAmount },
          update: { balance: { increment: cntAmount } },
        });

        await tx.currencyLedger.create({
          data: {
            userId: player.userId,
            currencyId: CURRENCY_ID,
            delta: cntAmount,
            reason: 'DERP deposit (on-chain)',
            sourceType: 'CRYPTO_DEPOSIT',
            sourceId: tx_hash,
            metadata: { txHash: tx_hash, blockTime: block_time, senderAddresses },
          },
        });
      });

      if (player) {
        this.logger.log(`Credited ${cntAmount} DERP to user ${player.userId} from tx ${tx_hash}`);
        await this.emitCurrencyDelta(player.userId);
      }
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Another concurrent poller already handled this tx
        this.logger.debug(`Tx ${tx_hash} already processed by concurrent poller — skipping`);
      } else {
        this.logger.error(`Failed to process deposit tx ${tx_hash}: ${err}`);
      }
    }
  }

  private async findPlayerBySenderAddresses(
    addresses: string[],
  ): Promise<{ userId: string } | null> {
    if (addresses.length === 0) return null;
    const wallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { chain: 'CARDANO', address: { in: addresses } },
      select: { userId: true },
    });
    return wallet ?? null;
  }

  private async emitCurrencyDelta(userId: string): Promise<void> {
    try {
      const pb = new PatchBuilder();
      await buildCurrencyPatches(pb, this.prisma, userId);
      const delta = await (this.prisma as any).playerDelta.create({
        data: { userId, patches: pb.build(), ui: [] },
      });
      this.pubsub.publish(`player:${userId}`, { userId, deltaId: delta.id.toString() });
    } catch (err) {
      this.logger.warn(`emitCurrencyDelta failed: ${err}`);
    }
  }

  async adminGetWithdrawals(status?: string, limit = 50): Promise<any[]> {
    const where: any = {};
    if (status) where.status = status;
    const rows = await (this.prisma as any).cryptoWithdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, username: true, email: true } } },
    });
    return rows.map(serializeBigInts);
  }

  async adminUpdateWithdrawal(id: string, data: { status?: string; txHash?: string; adminNote?: string }): Promise<any> {
    const existing = await (this.prisma as any).cryptoWithdrawal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Withdrawal ${id} not found`);

    const isRejection = data.status === 'REJECTED' && existing.status !== 'REJECTED';

    if (isRejection) {
      // Atomically reject + refund user balance to prevent fund loss
      const updated = await this.prisma.$transaction(async (tx) => {
        const w = await (tx as any).cryptoWithdrawal.update({
          where: { id },
          data: {
            status: 'REJECTED',
            ...(data.txHash !== undefined ? { txHash: data.txHash } : {}),
            ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
          },
        });

        await tx.userCurrencyBalance.update({
          where: { userId_currencyId: { userId: existing.userId, currencyId: existing.currencyId } },
          data: { balance: { increment: existing.amount } },
        });

        await tx.currencyLedger.create({
          data: {
            userId: existing.userId,
            currencyId: existing.currencyId,
            delta: existing.amount,
            reason: 'DERP withdrawal rejected — balance refunded',
            sourceType: 'crypto_withdrawal_refund',
            sourceId: id,
            metadata: { withdrawalId: id, adminNote: data.adminNote ?? null },
          },
        });

        return w;
      });

      await this.emitCurrencyDelta(existing.userId);
      return serializeBigInts(updated);
    }

    // Non-rejection update (e.g. APPROVED → SENT, adding txHash, adminNote)
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.txHash !== undefined) updateData.txHash = data.txHash;
    if (data.adminNote !== undefined) updateData.adminNote = data.adminNote;

    const updated = await (this.prisma as any).cryptoWithdrawal.update({
      where: { id },
      data: updateData,
    });
    return serializeBigInts(updated);
  }
}
