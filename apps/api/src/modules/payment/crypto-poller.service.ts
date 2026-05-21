import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PurchaseStatus, PurchasePaymentMethod } from '@prisma/client';

const POLL_INTERVAL_MS = 15_000;
const BLOCKFROST_BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';

@Injectable()
export class CryptoPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CryptoPollerService.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  onModuleInit() {
    this.intervalRef = setInterval(() => this.poll().catch((err) => {
      this.logger.error(`Crypto poll error: ${err}`);
    }), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private async poll(): Promise<void> {
    const now = new Date();

    const pending = await this.prisma.purchase.findMany({
      where: {
        status: PurchaseStatus.PENDING,
        paymentMethod: { in: [PurchasePaymentMethod.CRYPTO_EVM, PurchasePaymentMethod.CRYPTO_CARDANO] },
      },
    });

    for (const purchase of pending) {
      try {
        if (purchase.expiresAt && purchase.expiresAt < now) {
          await this.prisma.purchase.updateMany({
            where: { id: purchase.id, status: PurchaseStatus.PENDING },
            data: { status: PurchaseStatus.EXPIRED },
          });
          this.logger.log(`Purchase ${purchase.id} expired`);
          continue;
        }

        if (!purchase.destinationAddress || purchase.amountExpected == null) continue;

        let txHash: string | null = null;
        if (purchase.paymentMethod === PurchasePaymentMethod.CRYPTO_CARDANO) {
          txHash = await this.checkCardanoPayment(
            purchase.destinationAddress,
            purchase.amountExpected,
          );
        } else if (purchase.paymentMethod === PurchasePaymentMethod.CRYPTO_EVM) {
          txHash = await this.checkEvmPayment(
            purchase.destinationAddress,
            purchase.amountExpected,
            purchase.chain ?? 'ETH',
          );
        }

        if (!txHash) continue;

        const duplicate = await this.prisma.purchase.findFirst({
          where: {
            txHash,
            status: PurchaseStatus.CONFIRMED,
            id: { not: purchase.id },
          },
        });
        if (duplicate) {
          this.logger.warn(`txHash ${txHash} already used in purchase ${duplicate.id} — rejecting ${purchase.id}`);
          await this.prisma.purchase.updateMany({
            where: { id: purchase.id, status: PurchaseStatus.PENDING },
            data: { status: PurchaseStatus.FAILED },
          });
          continue;
        }

        await this.prisma.purchase.updateMany({
          where: { id: purchase.id, status: PurchaseStatus.PENDING },
          data: { txHash },
        });

        await this.paymentService.fulfillPurchase(purchase.id);
        this.logger.log(`Fulfilled crypto purchase ${purchase.id} via txHash ${txHash}`);
      } catch (err) {
        this.logger.error(`Error processing purchase ${purchase.id}: ${err}`);
      }
    }
  }

  private async checkCardanoPayment(
    address: string,
    amountExpected: bigint,
  ): Promise<string | null> {
    const apiKey = process.env.BLOCKFROST_API_KEY;
    if (!apiKey) return null;

    try {
      const resp = await fetch(
        `${BLOCKFROST_BASE}/addresses/${address}/transactions?order=desc&count=10`,
        { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
      );
      if (!resp.ok) return null;

      const txList = (await resp.json()) as Array<{ tx_hash: string }>;
      for (const { tx_hash } of txList) {
        const utxoResp = await fetch(
          `${BLOCKFROST_BASE}/txs/${tx_hash}/utxos`,
          { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
        );
        if (!utxoResp.ok) continue;

        const utxos = (await utxoResp.json()) as {
          outputs: Array<{ address: string; amount: Array<{ unit: string; quantity: string }> }>;
        };

        for (const output of utxos.outputs ?? []) {
          if (output.address !== address) continue;
          const lovelace = output.amount?.find((a) => a.unit === 'lovelace');
          if (lovelace && BigInt(lovelace.quantity) >= amountExpected) {
            return tx_hash;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Blockfrost check failed for ${address}: ${err}`);
    }

    return null;
  }

  private async checkEvmPayment(
    address: string,
    amountExpected: bigint,
    chain: string,
  ): Promise<string | null> {
    const rpcUrl = this.getEvmRpc(chain);
    if (!rpcUrl) return null;

    const usdcAddress = this.getUsdcAddress(chain);
    if (!usdcAddress) return null;

    const addressLower = address.toLowerCase();
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const paddedTo = `0x000000000000000000000000${addressLower.replace('0x', '')}`;

    try {
      const blockResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!blockResp.ok) return null;

      const blockData = (await blockResp.json()) as any;
      const latestBlock = Number(blockData.result);
      const fromBlock = '0x' + Math.max(0, latestBlock - 300).toString(16);

      const logsResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getLogs',
          params: [{
            fromBlock,
            toBlock: 'latest',
            address: usdcAddress,
            topics: [transferTopic, null, paddedTo],
          }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!logsResp.ok) return null;

      const logsData = (await logsResp.json()) as any;
      const logs: Array<{ transactionHash: string; data: string }> = logsData.result ?? [];

      for (const log of logs) {
        const amount = BigInt(log.data);
        if (amount >= amountExpected) {
          return log.transactionHash;
        }
      }
    } catch (err) {
      this.logger.warn(`EVM RPC check failed for ${address} on ${chain}: ${err}`);
    }

    return null;
  }

  private getEvmRpc(chain: string): string | null {
    const custom = process.env.EVM_RPC_URL;
    if (custom) return custom;

    switch (chain.toUpperCase()) {
      case 'ETH':
      case 'ETHEREUM':
        return 'https://cloudflare-eth.com';
      case 'POLYGON':
      case 'MATIC':
        return 'https://polygon-rpc.com';
      default:
        return 'https://cloudflare-eth.com';
    }
  }

  private getUsdcAddress(chain: string): string | null {
    const custom = process.env.EVM_USDC_ADDRESS;
    if (custom) return custom;

    switch (chain.toUpperCase()) {
      case 'ETH':
      case 'ETHEREUM':
        return '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      case 'POLYGON':
      case 'MATIC':
        return '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
      default:
        return '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    }
  }
}
