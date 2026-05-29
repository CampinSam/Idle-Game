import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PurchaseStatus, PurchasePaymentMethod } from '@prisma/client';

const POLL_INTERVAL_MS = 15_000;
const BLOCKFROST_BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';
// Approximate seconds per block for each chain (used to estimate fromBlock).
const ETH_BLOCK_TIME_S = 12;
const BLOCK_SCAN_BUFFER = 20; // extra blocks of safety margin

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

        // Fetch the player's linked wallets to validate the payer address.
        const linkedWallets: Array<{ chain: string; address: string }> =
          await (this.prisma as any).linkedWallet.findMany({
            where: { userId: purchase.userId },
            select: { chain: true, address: true },
          });

        if (linkedWallets.length === 0) continue;

        let txHash: string | null = null;

        if (purchase.paymentMethod === PurchasePaymentMethod.CRYPTO_CARDANO) {
          const cardanoAddresses = linkedWallets
            .filter((w) => w.chain === 'CARDANO')
            .map((w) => w.address);
          if (cardanoAddresses.length === 0) continue;

          // Extract CNT token identity from rateSnapshot (if this is a CNT purchase).
          const snap = purchase.rateSnapshot as any;
          const cntMeta: { policyId: string; assetName: string; amountExpected: string } | null =
            snap?.CNT?.denomination === 'CNT' ? snap.CNT : null;

          txHash = await this.checkCardanoPayment(
            purchase.destinationAddress,
            purchase.amountExpected,
            purchase.createdAt,
            cardanoAddresses,
            cntMeta ?? undefined,
          );
        } else if (purchase.paymentMethod === PurchasePaymentMethod.CRYPTO_EVM) {
          const evmAddresses = linkedWallets
            .filter((w) => w.chain !== 'CARDANO')
            .map((w) => w.address.toLowerCase());
          if (evmAddresses.length === 0) continue;

          txHash = await this.checkEvmPayment(
            purchase.destinationAddress,
            purchase.amountExpected,
            purchase.chain ?? 'ETH',
            purchase.createdAt,
            evmAddresses,
          );
        }

        if (!txHash) continue;

        // fulfillPurchase atomically sets txHash + status=CONFIRMED inside a
        // single SQL UPDATE. The DB @unique constraint on txHash rejects any
        // second attempt to credit the same on-chain transaction.
        await this.paymentService.fulfillPurchase(purchase.id, txHash);
        this.logger.log(`Fulfilled crypto purchase ${purchase.id} via txHash ${txHash}`);
      } catch (err: any) {
        // A unique constraint violation means the txHash was already credited;
        // treat it as a safe duplicate and log a warning rather than an error.
        if (err?.code === 'P2002' || (typeof err?.message === 'string' && err.message.includes('unique constraint'))) {
          this.logger.warn(`txHash already credited — purchase ${purchase.id} skipped (safe duplicate)`);
        } else {
          this.logger.error(`Error processing purchase ${purchase.id}: ${err}`);
        }
      }
    }
  }

  /**
   * Check for a confirmed Cardano payment to the treasury address.
   *
   * @param cntToken - When provided, validates a Cardano Native Token transfer
   *   (policyId + assetName) instead of lovelace. The Blockfrost asset unit is
   *   constructed as `policyId + assetName` (hex-concatenated, no separator).
   *   If cntToken is omitted the check falls back to lovelace validation.
   */
  private async checkCardanoPayment(
    destinationAddress: string,
    amountExpected: bigint,
    createdAt: Date,
    allowedSenderAddresses: string[],
    cntToken?: { policyId: string; assetName: string; amountExpected: string },
  ): Promise<string | null> {
    const apiKey = process.env.BLOCKFROST_API_KEY;
    if (!apiKey) return null;

    const createdAtSec = Math.floor(createdAt.getTime() / 1000);

    // Blockfrost native-asset unit = policyId + assetName (hex, no separator).
    const cntUnit = cntToken ? `${cntToken.policyId}${cntToken.assetName}` : null;
    const cntRequired = cntToken ? BigInt(cntToken.amountExpected) : null;

    try {
      const resp = await fetch(
        `${BLOCKFROST_BASE}/addresses/${destinationAddress}/transactions?order=desc&count=20`,
        { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
      );
      if (!resp.ok) return null;

      const txList = (await resp.json()) as Array<{ tx_hash: string; block_time: number }>;

      for (const { tx_hash, block_time } of txList) {
        // Skip transactions that existed before the purchase was created.
        if (block_time < createdAtSec) continue;

        const utxoResp = await fetch(
          `${BLOCKFROST_BASE}/txs/${tx_hash}/utxos`,
          { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
        );
        if (!utxoResp.ok) continue;

        const utxos = (await utxoResp.json()) as {
          inputs: Array<{ address: string }>;
          outputs: Array<{ address: string; amount: Array<{ unit: string; quantity: string }> }>;
        };

        // Verify at least one input comes from one of the player's linked Cardano addresses.
        const senderMatch = (utxos.inputs ?? []).some((inp) =>
          allowedSenderAddresses.includes(inp.address),
        );
        if (!senderMatch) continue;

        // Verify at least one output sends the required token/amount to our treasury.
        for (const output of utxos.outputs ?? []) {
          if (output.address !== destinationAddress) continue;

          if (cntUnit && cntRequired !== null) {
            // CNT path: verify the specific native asset quantity.
            const cntAsset = output.amount?.find((a) => a.unit === cntUnit);
            if (cntAsset && BigInt(cntAsset.quantity) >= cntRequired) {
              return tx_hash;
            }
          } else {
            // ADA/lovelace path.
            const lovelace = output.amount?.find((a) => a.unit === 'lovelace');
            if (lovelace && BigInt(lovelace.quantity) >= amountExpected) {
              return tx_hash;
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Blockfrost check failed for ${destinationAddress}: ${err}`);
    }

    return null;
  }

  private async checkEvmPayment(
    destinationAddress: string,
    amountExpected: bigint,
    chain: string,
    createdAt: Date,
    allowedSenderAddresses: string[],
  ): Promise<string | null> {
    const rpcUrl = this.getEvmRpc(chain);
    if (!rpcUrl) return null;

    const usdcAddress = this.getUsdcAddress(chain);
    if (!usdcAddress) return null;

    const paddedTo = `0x000000000000000000000000${destinationAddress.toLowerCase().replace('0x', '')}`;
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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

      // Estimate the block number at purchase creation to bound the scan range.
      const ageSeconds = Math.max(0, (Date.now() - createdAt.getTime()) / 1000);
      const blocksAgo = Math.ceil(ageSeconds / ETH_BLOCK_TIME_S) + BLOCK_SCAN_BUFFER;
      const fromBlock = '0x' + Math.max(0, latestBlock - blocksAgo).toString(16);

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
      const logs: Array<{ transactionHash: string; topics: string[]; data: string }> =
        logsData.result ?? [];

      for (const log of logs) {
        // Decode `from` address from topics[1] (ABI-encoded, 32 bytes, address in last 20).
        const fromPadded = log.topics[1] ?? '';
        const fromAddress = '0x' + fromPadded.slice(-40).toLowerCase();

        // Verify the sender is one of the player's linked EVM wallets.
        if (!allowedSenderAddresses.includes(fromAddress)) continue;

        const amount = BigInt(log.data);
        if (amount >= amountExpected) {
          return log.transactionHash;
        }
      }
    } catch (err) {
      this.logger.warn(`EVM RPC check failed for ${destinationAddress} on ${chain}: ${err}`);
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
