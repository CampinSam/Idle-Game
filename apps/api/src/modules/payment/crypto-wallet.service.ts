import { Injectable, Logger, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { PubSubService } from '../infrastructure/pubsub.service';
import { AdaRateService } from './ada-rate.service';
import { NotificationService } from '../notification/notification.service';
import { PatchBuilder, buildCurrencyPatches } from '../commands/patch-builder';
import * as nodeCrypto from 'crypto';

const CURRENCY_ID = 'crypto_derp';
const BLOCKFROST_BASE = 'https://cardano-mainnet.blockfrost.io/api/v0';
const POLL_INTERVAL_MS = 20_000;
const WITHDRAWAL_POLL_INTERVAL_MS = 30_000;

// Minimum ADA (lovelace) that must accompany a native-asset output
const MIN_ADA_LOVELACE = 2_000_000n;
// Estimated max tx fee in lovelace (0.2 ADA); CSL calculates the real fee but we need
// this for UTXO selection before building the tx.
const ESTIMATED_FEE_LOVELACE = 200_000n;

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

// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption helpers for the hot wallet signing key
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a 32-byte AES key from ENCRYPTION_SECRET env var (primary)
 * or JWT_SECRET (fallback). Both are required env vars in production.
 */
function deriveEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new InternalServerErrorException(
      'ENCRYPTION_SECRET (or JWT_SECRET) env var is required to encrypt the hot wallet signing key',
    );
  }
  return nodeCrypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a colon-delimited string: `iv_hex:authTag_hex:ciphertext_hex`.
 */
function encryptSkey(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value produced by `encryptSkey`.
 * Throws if the ciphertext is malformed or authentication fails.
 */
function decryptSkey(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new InternalServerErrorException('Stored signing key has unexpected format — cannot decrypt');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = deriveEncryptionKey();
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

const PENDING_KEY_ESCALATION_INTERVAL_MS = 15 * 60_000; // 15 minutes

@Injectable()
export class CryptoWalletService {
  private readonly logger = new Logger(CryptoWalletService.name);
  private depositIntervalRef: NodeJS.Timeout | null = null;
  private withdrawalIntervalRef: NodeJS.Timeout | null = null;
  private withdrawalProcessing = false;
  private pendingKeyEscalationRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    private readonly pubsub: PubSubService,
    private readonly adaRateService: AdaRateService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    this.depositIntervalRef = setInterval(() => {
      this.pollDeposits().catch((err) => {
        this.logger.error(`CNT deposit poll error: ${err}`);
      });
    }, POLL_INTERVAL_MS);

    this.withdrawalIntervalRef = setInterval(() => {
      this.processApprovedWithdrawals().catch((err) => {
        this.logger.error(`Withdrawal processor error: ${err}`);
      });
    }, WITHDRAWAL_POLL_INTERVAL_MS);

    this.autoGenerateHotWalletIfNeeded().catch((err) => {
      this.logger.error(`Hot wallet auto-generation check failed: ${err}`);
    });

    this.pendingKeyEscalationRef = setInterval(() => {
      this.escalatePendingKeyWarning().catch((err) => {
        this.logger.error(`Pending key escalation check failed: ${err}`);
      });
    }, PENDING_KEY_ESCALATION_INTERVAL_MS);
  }

  /**
   * On startup, if no signing key exists, auto-generate a hot wallet.
   * The plaintext key is NOT stored — the admin must retrieve it via the
   * claim endpoint in the admin panel. A clear warning is logged.
   */
  private async autoGenerateHotWalletIfNeeded(): Promise<void> {
    const config = await (this.prisma as any).cryptoWalletConfig.findUnique({
      where: { id: 'default' },
      select: { hotWalletSkeyEncrypted: true },
    });

    const hasKey = config?.hotWalletSkeyEncrypted && config.hotWalletSkeyEncrypted.length > 0;
    if (hasKey) return;

    this.logger.warn(
      '[HotWallet] No signing key found — auto-generating a new Cardano enterprise wallet. ' +
      'The admin MUST download the private key from the admin panel (Crypto → Config → Download Private Key) immediately.',
    );

    await this.generateHotWallet();

    this.logger.warn(
      '[HotWallet] Auto-generated wallet is ready. ' +
      'Navigate to Admin → Crypto → Config and download the private key before it is lost.',
    );
  }

  /**
   * Fires every PENDING_KEY_ESCALATION_INTERVAL_MS.
   * If the hot wallet private key is still pending download, escalates to ERROR
   * so the condition is visible in error-monitoring dashboards and log alerts.
   */
  private async escalatePendingKeyWarning(): Promise<void> {
    const config = await (this.prisma as any).cryptoWalletConfig.findUnique({
      where: { id: 'default' },
      select: { hotWalletKeyPendingDownload: true },
    });
    if (config?.hotWalletKeyPendingDownload) {
      this.logger.error(
        '[HotWallet] CRITICAL: The hot wallet private key has not been downloaded. ' +
        'If the server restarts before the key is claimed, it will be permanently lost. ' +
        'Navigate to Admin → System → Crypto → Config and download the private key immediately.',
      );
    }
  }

  onModuleDestroy() {
    if (this.depositIntervalRef) {
      clearInterval(this.depositIntervalRef);
      this.depositIntervalRef = null;
    }
    if (this.withdrawalIntervalRef) {
      clearInterval(this.withdrawalIntervalRef);
      this.withdrawalIntervalRef = null;
    }
    if (this.pendingKeyEscalationRef) {
      clearInterval(this.pendingKeyEscalationRef);
      this.pendingKeyEscalationRef = null;
    }
  }

  /**
   * Returns the wallet config for display purposes.
   * `hotWalletSkeyEncrypted` is stripped from the response and replaced with
   * a `hasStoredSigningKey` boolean so the UI can show "Key stored" without
   * ever exposing the ciphertext to the client.
   */
  async getConfig() {
    const config = await (this.prisma as any).cryptoWalletConfig.findUnique({
      where: { id: 'default' },
    });
    if (!config) {
      const created = await (this.prisma as any).cryptoWalletConfig.create({
        data: { id: 'default' },
      });
      return this.sanitizeConfig(serializeBigInts(created));
    }
    return this.sanitizeConfig(serializeBigInts(config));
  }

  /** Strips the encrypted key and injects a boolean indicator instead. */
  private sanitizeConfig(config: any): any {
    const { hotWalletSkeyEncrypted, ...rest } = config;
    return {
      ...rest,
      hasStoredSigningKey: !!(hotWalletSkeyEncrypted && hotWalletSkeyEncrypted.length > 0),
    };
  }

  /**
   * Generates a fresh Cardano enterprise wallet (mainnet).
   * Stores the encrypted key + derived address, marks `hotWalletKeyPendingDownload: true`.
   * Returns the plaintext skey hex and address to the caller — this is the ONLY moment
   * the plaintext is available outside of `claimPendingKeyDownload`.
   */
  async generateHotWallet(): Promise<{ skeyHex: string; address: string }> {
    const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

    const privateKey = CSL.PrivateKey.generate_ed25519extended();
    const skeyHex: string = Buffer.from(privateKey.as_bytes()).toString('hex');

    const pubKey = privateKey.to_public();
    const pubKeyHash = pubKey.hash();

    // CSL v12+ renamed StakeCredential → Credential; fall back for older builds
    const CredClass = CSL.Credential ?? CSL.StakeCredential;
    const credential = CredClass.from_keyhash(pubKeyHash);

    const enterpriseAddress = CSL.EnterpriseAddress.new(
      1, // mainnet network id
      credential,
    );
    const address: string = enterpriseAddress.to_address().to_bech32();

    const encryptedKey = encryptSkey(skeyHex);

    await (this.prisma as any).cryptoWalletConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        hotWalletSkeyEncrypted: encryptedKey,
        hotWalletAddress: address,
        hotWalletKeyPendingDownload: true,
      },
      update: {
        hotWalletSkeyEncrypted: encryptedKey,
        hotWalletAddress: address,
        hotWalletKeyPendingDownload: true,
      },
    });

    return { skeyHex, address };
  }

  /**
   * One-time atomic claim: reads and decrypts the key, then conditionally clears
   * `hotWalletKeyPendingDownload` — all inside a single Prisma transaction.
   *
   * Safety guarantees:
   * 1. `decryptSkey` is called *before* the conditional `updateMany`. If decryption
   *    fails for any reason (e.g. bad encryption secret), the transaction is thrown
   *    and rolls back, leaving `hotWalletKeyPendingDownload = true` so the admin
   *    can retry after fixing the configuration.
   * 2. `updateMany({ where: { hotWalletKeyPendingDownload: true } })` is a
   *    conditional DB-level UPDATE. Of any number of concurrent callers that reach
   *    this point simultaneously, exactly one will get `count === 1`; the rest will
   *    get `count === 0` and receive `BadRequestException`.
   */
  async claimPendingKeyDownload(): Promise<{ skeyHex: string }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const config = await (tx as any).cryptoWalletConfig.findUnique({
        where: { id: 'default' },
        select: { hotWalletSkeyEncrypted: true, hotWalletKeyPendingDownload: true },
      });

      if (!config?.hotWalletKeyPendingDownload) {
        return null;
      }

      // Decrypt BEFORE committing the flag change — a decrypt failure rolls back.
      const skeyHex = decryptSkey(config.hotWalletSkeyEncrypted);

      // Conditional update: only succeeds if flag is still true (races lose here).
      const updated = await (tx as any).cryptoWalletConfig.updateMany({
        where: { id: 'default', hotWalletKeyPendingDownload: true },
        data: { hotWalletKeyPendingDownload: false },
      });

      if (updated.count === 0) {
        // Another concurrent caller claimed it between findUnique and updateMany.
        return null;
      }

      return { skeyHex };
    });

    if (!result) {
      throw new BadRequestException('Key has already been claimed or no pending key exists');
    }

    return result;
  }

  /**
   * Updates system-level wallet configuration (hotWalletAddress, blockfrostProjectId,
   * signing key). Per-currency token settings (policyId, assetName, price, withdrawal
   * rules) are now stored on the Currency row and managed via the Currency admin CRUD.
   */
  async updateConfig(data: {
    hotWalletAddress?: string;
    blockfrostProjectId?: string;
    hotWalletSkeyHex?: string;
  }) {
    const updateData: any = {};
    if (data.hotWalletAddress !== undefined) updateData.hotWalletAddress = data.hotWalletAddress;
    if (data.blockfrostProjectId !== undefined) updateData.blockfrostProjectId = data.blockfrostProjectId;
    if (data.hotWalletSkeyHex !== undefined && data.hotWalletSkeyHex.trim() !== '') {
      updateData.hotWalletSkeyEncrypted = encryptSkey(data.hotWalletSkeyHex.trim());
    }

    const saved = await (this.prisma as any).cryptoWalletConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...updateData },
      update: updateData,
    });
    return this.sanitizeConfig(serializeBigInts(saved));
  }

  /**
   * Loads the Currency row for the given currencyId and asserts it is CRYPTO-typed.
   * Throws InternalServerErrorException if the row is missing or not CRYPTO type.
   */
  private async getCryptoCurrencyRow(currencyId: string): Promise<any> {
    const row = await this.prisma.currency.findUnique({ where: { id: currencyId } });
    if (!row) {
      throw new InternalServerErrorException(`Currency "${currencyId}" not found`);
    }
    if ((row as any).type !== 'CRYPTO') {
      throw new InternalServerErrorException(`Currency "${currencyId}" is not a CRYPTO-type currency`);
    }
    return row;
  }

  /**
   * Resolves the hot wallet signing key for the withdrawal processor.
   * Priority: encrypted DB value → HOT_WALLET_SKEY_HEX env var.
   */
  private async getDecryptedSkeyHex(): Promise<string | undefined> {
    try {
      const config = await (this.prisma as any).cryptoWalletConfig.findUnique({
        where: { id: 'default' },
        select: { hotWalletSkeyEncrypted: true },
      });
      if (config?.hotWalletSkeyEncrypted) {
        return decryptSkey(config.hotWalletSkeyEncrypted);
      }
    } catch (err) {
      this.logger.error(`Failed to decrypt stored signing key: ${err}`);
    }
    return process.env.HOT_WALLET_SKEY_HEX?.trim() || undefined;
  }

  private getBlockfrostApiKey(config: any): string | null {
    return config.blockfrostProjectId?.trim() || process.env.BLOCKFROST_API_KEY || null;
  }

  /** Returns the sum of CNT across all APPROVED (queued) withdrawals. */
  private async getApprovedWithdrawalTotalCnt(): Promise<bigint> {
    const rows = await (this.prisma as any).cryptoWithdrawal.findMany({
      where: { status: 'APPROVED' },
      select: { amount: true },
    });
    return rows.reduce((acc: bigint, r: any) => acc + BigInt(r.amount), 0n);
  }

  async getHotWalletBalance(): Promise<{ ada: string; cnt: string; totalApprovedCnt: string } | null> {
    const config = await this.getConfig();
    const apiKey = this.getBlockfrostApiKey(config);
    if (!apiKey || !config.hotWalletAddress) return null;

    try {
      const [resp, totalApprovedCnt] = await Promise.all([
        fetch(
          `${BLOCKFROST_BASE}/addresses/${config.hotWalletAddress}`,
          { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
        ),
        this.getApprovedWithdrawalTotalCnt(),
      ]);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const amounts: Array<{ unit: string; quantity: string }> = data.amount ?? [];

      const lovelace = amounts.find((a) => a.unit === 'lovelace');
      const adaNum = lovelace ? (Number(lovelace.quantity) / 1_000_000).toFixed(6) : '0.000000';

      const cryptoRow = await this.getCryptoCurrencyRow(CURRENCY_ID);
      const unit = `${cryptoRow.cntPolicyId}${cryptoRow.cntAssetName}`;
      const cntEntry = amounts.find((a) => a.unit === unit);
      const cnt = cntEntry ? cntEntry.quantity : '0';

      return { ada: adaNum, cnt, totalApprovedCnt: totalApprovedCnt.toString() };
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

    const cryptoRow = await this.getCryptoCurrencyRow(CURRENCY_ID);
    const fee = Number(cryptoRow.cntWithdrawalFee ?? 0);
    const net = amount - fee;

    if (net <= 0) {
      throw new BadRequestException(`Amount must be greater than the fee (${fee})`);
    }

    await this.validateMinWithdrawal(cryptoRow, amount);

    const autoApprovalThreshold = Number(cryptoRow.cntAutoApprovalThreshold ?? 0);
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

    // If the withdrawal was auto-approved, trigger processing immediately
    // (fire-and-forget — the boolean flag prevents concurrent runs).
    if (isAutoApproved) {
      this.processApprovedWithdrawals().catch((err) => {
        this.logger.warn(`Background withdrawal processor error (post-request): ${err}`);
      });
    }

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Automated on-chain withdrawal sender
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Scheduler: processes all APPROVED withdrawals by submitting them on-chain.
   *
   * A simple boolean flag (`withdrawalProcessing`) prevents concurrent runs.
   * Each withdrawal is atomically moved to PROCESSING before any on-chain work
   * begins, so a server restart or crash cannot double-send.
   */
  async processApprovedWithdrawals(): Promise<void> {
    if (this.withdrawalProcessing) return;
    this.withdrawalProcessing = true;
    try {
      const config = await this.getConfig();
      const apiKey = this.getBlockfrostApiKey(config);
      const hotWalletAddress: string = config.hotWalletAddress;
      const skeyHex: string | undefined = await this.getDecryptedSkeyHex();

      if (!apiKey || !hotWalletAddress || !skeyHex) {
        // Not fully configured — silently skip; admin must set up hot-wallet keys.
        return;
      }

      // Reaper: reset stale PROCESSING rows (older than 15 min) to FAILED.
      // This recovers withdrawals that were locked by a prior process that
      // crashed before completing the on-chain submission or the final DB update.
      // FAILED is chosen over APPROVED because we cannot know whether the TX
      // was actually broadcast; an admin must inspect the blockchain before
      // re-queuing to APPROVED or manually marking as SENT.
      const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
      // Fetch stale records first so we have userId for per-player notifications.
      // Then update each record individually so we only notify players whose
      // withdrawal actually transitioned (guarding against concurrent changes
      // between the findMany and the update).
      const staleRecords = await (this.prisma as any).cryptoWithdrawal.findMany({
        where: { status: 'PROCESSING', updatedAt: { lt: staleThreshold } },
        select: { id: true, userId: true },
      });
      let reaperCount = 0;
      for (const record of staleRecords) {
        const result = await (this.prisma as any).cryptoWithdrawal.updateMany({
          where: { id: record.id, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            adminNote: 'Auto-recovered from stale PROCESSING by scheduler reaper. ' +
              'Check blockchain for a broadcast transaction before re-queueing.',
          },
        });
        if (result.count > 0) {
          reaperCount++;
          await this.emitWithdrawalNotification(
            record.userId,
            record.id,
            'withdrawal_failed',
            'Withdrawal Failed',
            'Your DERP withdrawal could not be sent. Please contact support.',
            { screen: '/wallet' },
            { withdrawalId: record.id },
          );
        }
      }
      if (reaperCount > 0) {
        this.logger.warn(
          `[Withdrawals] Recovered ${reaperCount} stale PROCESSING withdrawal(s) → FAILED`,
        );
      }

      const approved = await (this.prisma as any).cryptoWithdrawal.findMany({
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'asc' },
      });

      if (approved.length > 0) {
        // ── Balance safety check ─────────────────────────────────────────────
        // Fetch the live hot-wallet balance and compare against queued totals.
        // If funds are insufficient, emit a WARNING and skip all on-chain work
        // until an operator tops up the wallet.
        const balance = await this.getHotWalletBalance();
        if (balance) {
          const adaBalance = parseFloat(balance.ada);
          const cntBalance = BigInt(balance.cnt);
          const totalApprovedCnt = BigInt(balance.totalApprovedCnt);
          const ADA_WARNING_THRESHOLD = 5; // ADA

          const cntShort = cntBalance < totalApprovedCnt;
          const adaLow = adaBalance < ADA_WARNING_THRESHOLD;

          if (cntShort || adaLow) {
            const reasons: string[] = [];
            if (cntShort) {
              reasons.push(
                `CNT balance (${cntBalance.toString()}) is below total queued withdrawals (${totalApprovedCnt.toString()})`,
              );
            }
            if (adaLow) {
              reasons.push(
                `ADA balance (${adaBalance.toFixed(6)} ₳) is below the ${ADA_WARNING_THRESHOLD} ₳ safety threshold`,
              );
            }
            this.logger.warn(
              `[Withdrawals] HOT WALLET LOW BALANCE — skipping ${approved.length} queued withdrawal(s). ` +
              reasons.join('; ') +
              '. Top up the hot wallet before the next cycle.',
            );
            return;
          }
        }
      }

      for (const withdrawal of approved) {
        await this.sendWithdrawalOnChain(withdrawal, apiKey, hotWalletAddress, skeyHex);
      }
    } finally {
      this.withdrawalProcessing = false;
    }
  }

  /**
   * Sends a single approved withdrawal on-chain.
   *
   * Flow:
   * 1. Atomically move status APPROVED → PROCESSING (acts as a distributed lock;
   *    if update returns 0 rows another process already grabbed it).
   * 2. Fetch UTXOs from the hot wallet via Blockfrost.
   * 3. Build + sign the Cardano transaction using CSL.
   * 4. Submit via Blockfrost `/tx/submit`.
   * 5. On success → SENT + txHash.  On failure → FAILED + adminNote with error.
   *
   * @param withdrawal  Raw Prisma `CryptoWithdrawal` record
   * @param apiKey      Blockfrost project ID
   * @param hotWalletAddress  Bech32 hot wallet address
   * @param skeyHex     Hot wallet extended spending key as hex CBOR (enterprise or base addr)
   */
  private async sendWithdrawalOnChain(
    withdrawal: any,
    apiKey: string,
    hotWalletAddress: string,
    skeyHex: string,
  ): Promise<void> {
    const id: string = withdrawal.id;
    const netAmount: bigint = BigInt(withdrawal.amount) - BigInt(withdrawal.fee);
    const destination: string = withdrawal.destinationAddress;

    // ── Step 1: atomic lock — move APPROVED → PROCESSING ─────────────────────
    const locked = await (this.prisma as any).cryptoWithdrawal.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'PROCESSING' },
    });
    if (locked.count === 0) {
      // Another process already grabbed this withdrawal
      return;
    }

    try {
      // ── Step 2: fetch UTXOs from hot wallet ─────────────────────────────────
      const utxos = await this.fetchHotWalletUtxos(hotWalletAddress, apiKey);
      if (utxos.length === 0) {
        throw new Error('Hot wallet has no UTXOs — cannot build transaction');
      }

      const cryptoRow = await this.getCryptoCurrencyRow(withdrawal.currencyId);
      const policyId = cryptoRow.cntPolicyId as string;
      const assetName = cryptoRow.cntAssetName as string;
      const unit = `${policyId}${assetName}`;

      // ── Step 3: select UTXOs and build the transaction ────────────────────
      const txHex = await this.buildAndSignCntTransfer({
        utxos,
        destinationAddress: destination,
        hotWalletAddress,
        cntAmount: netAmount,
        policyIdHex: policyId,
        assetNameHex: assetName,
        skeyHex,
        apiKey,
      });

      // ── Step 4: pre-submit status recheck ───────────────────────────────────
      // Admin may have intervened between our PROCESSING lock and now.
      // If the record is no longer PROCESSING we must not submit — the admin's
      // action (e.g. setting back to APPROVED to defer) takes precedence.
      const current = await (this.prisma as any).cryptoWithdrawal.findUnique({ where: { id } });
      if (!current || current.status !== 'PROCESSING') {
        this.logger.warn(
          `Withdrawal ${id} is no longer PROCESSING (now: ${current?.status ?? 'deleted'}) — aborting send`,
        );
        return;
      }

      // ── Step 5: submit via Blockfrost ─────────────────────────────────────
      const txHash = await this.submitTransaction(txHex, apiKey);

      // ── Step 6: conditional SENT update ───────────────────────────────────
      // Use updateMany with status guard so we never overwrite a status that
      // was changed concurrently (e.g., admin forcefully moved it elsewhere).
      const sentUpdate = await (this.prisma as any).cryptoWithdrawal.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'SENT', txHash },
      });
      if (sentUpdate.count === 0) {
        // TX was submitted on-chain but status changed under us — log critical
        // warning so admins can reconcile manually.
        this.logger.error(
          `CRITICAL: Withdrawal ${id} was sent on-chain (txHash: ${txHash}) but ` +
          `status had already changed — manual reconciliation required`,
        );
      } else {
        this.logger.log(`Withdrawal ${id} sent on-chain — txHash: ${txHash}`);
        const cardanoscanUrl = `https://cardanoscan.io/transaction/${txHash}`;
        const shortHash = `${txHash.slice(0, 8)}…${txHash.slice(-8)}`;
        await this.emitWithdrawalNotification(
          withdrawal.userId,
          id,
          'withdrawal_sent',
          'Withdrawal Sent!',
          `Your DERP is on-chain. Tx: ${shortHash} — ${cardanoscanUrl}`,
          { screen: '/wallet', txHash, cardanoscanUrl },
          { txHash, withdrawalId: id, cardanoscanUrl },
        );
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      this.logger.error(`Withdrawal ${id} failed: ${msg}`);

      // Conditional update: only move to FAILED if still PROCESSING.
      // If status changed (e.g. admin intervened), skip the FAILED write.
      const failedUpdate = await (this.prisma as any).cryptoWithdrawal.updateMany({
        where: { id, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          adminNote: `Auto-send failed: ${msg.slice(0, 500)}`,
        },
      });
      if (failedUpdate.count > 0) {
        await this.emitWithdrawalNotification(
          withdrawal.userId,
          id,
          'withdrawal_failed',
          'Withdrawal Failed',
          'Your DERP withdrawal could not be sent. Please contact support.',
          { screen: '/wallet' },
          { withdrawalId: id },
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Guided CIP-30 tx builder — shared helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Decodes an array of CIP-30 CBOR UTXO hex strings into a normalised
   * Blockfrost-style array.  Malformed entries are skipped with a warning.
   */
  private decodeCip30Utxos(
    utxosCborHex: string[],
    CSL: any,
  ): Array<{ tx_hash: string; tx_index: number; amount: Array<{ unit: string; quantity: string }> }> {
    const utxos: any[] = [];
    for (const cbor of utxosCborHex) {
      try {
        const txUnspentOut = CSL.TransactionUnspentOutput.from_bytes(Buffer.from(cbor, 'hex'));
        const input = txUnspentOut.input();
        const output = txUnspentOut.output();
        const amountVal = output.amount();

        const amountArr: Array<{ unit: string; quantity: string }> = [];
        amountArr.push({ unit: 'lovelace', quantity: amountVal.coin().to_str() });

        const ma = amountVal.multiasset();
        if (ma) {
          const policies = ma.keys();
          for (let pi = 0; pi < policies.len(); pi++) {
            const pid = policies.get(pi);
            const assets = ma.get(pid)!;
            const assetNames = assets.keys();
            for (let ai = 0; ai < assetNames.len(); ai++) {
              const an = assetNames.get(ai);
              const qty = assets.get(an)!;
              amountArr.push({
                unit: `${Buffer.from(pid.to_bytes()).toString('hex')}${Buffer.from(an.name()).toString('hex')}`,
                quantity: qty.to_str(),
              });
            }
          }
        }

        utxos.push({
          tx_hash: Buffer.from(input.transaction_id().to_bytes()).toString('hex'),
          tx_index: input.index(),
          amount: amountArr,
        });
      } catch (err) {
        this.logger.warn(`Could not decode UTXO CBOR (skipping): ${err}`);
      }
    }
    return utxos;
  }

  /**
   * Builds an unsigned CNT transfer transaction where the **player's** wallet
   * is the sender.  Selects UTXOs, adds inputs/outputs, and returns the
   * unsigned tx as hex CBOR ready for CIP-30 `signTx()`.
   *
   * Works for both deposits (→ hot wallet) and purchases (→ purchase address).
   */
  private async buildUnsignedPlayerCntTx(params: {
    utxos: Array<{ tx_hash: string; tx_index: number; amount: Array<{ unit: string; quantity: string }> }>;
    senderAddress: string;
    recipientAddress: string;
    cntAmount: bigint;
    policyIdHex: string;
    assetNameHex: string;
    apiKey: string;
    CSL: any;
  }): Promise<string> {
    const { utxos, senderAddress, recipientAddress, cntAmount, policyIdHex, assetNameHex, apiKey, CSL } = params;
    const assetUnit = `${policyIdHex}${assetNameHex}`;

    // Validate total CNT available
    const totalCnt = utxos.reduce((acc, u) => {
      const entry = u.amount.find((a) => a.unit === assetUnit);
      return acc + BigInt(entry?.quantity ?? 0);
    }, 0n);
    if (totalCnt < cntAmount) {
      throw new BadRequestException(`Insufficient CNT: need ${cntAmount}, wallet has ${totalCnt}`);
    }

    const pp = await this.fetchProtocolParams(apiKey);

    const linearFee = CSL.LinearFee.new(
      CSL.BigNum.from_str(String(pp.min_fee_a ?? 44)),
      CSL.BigNum.from_str(String(pp.min_fee_b ?? 155381)),
    );
    const txBuilderCfg = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(linearFee)
      .pool_deposit(CSL.BigNum.from_str(String(pp.pool_deposit ?? 500000000)))
      .key_deposit(CSL.BigNum.from_str(String(pp.key_deposit ?? 2000000)))
      .max_value_size(pp.max_val_size ?? 5000)
      .max_tx_size(pp.max_tx_size ?? 16384)
      .coins_per_utxo_byte(CSL.BigNum.from_str(String(pp.coins_per_utxo_size ?? pp.coins_per_utxo_word ?? 4310)))
      .build();

    const txBuilder = CSL.TransactionBuilder.new(txBuilderCfg);

    const senderAddr = CSL.Address.from_bech32(senderAddress);
    const recipientAddr = CSL.Address.from_bech32(recipientAddress);
    const policyId = CSL.ScriptHash.from_bytes(Buffer.from(policyIdHex, 'hex'));
    const assetName = CSL.AssetName.new(Buffer.from(assetNameHex, 'hex'));
    const cntAmountCSL = CSL.BigNum.from_str(String(cntAmount));

    // UTXO selection: prefer UTXOs carrying CNT, then by ADA descending
    const neededLovelace = MIN_ADA_LOVELACE + ESTIMATED_FEE_LOVELACE;
    let selectedLovelace = 0n;
    let selectedCnt = 0n;
    const selectedInputs: any[] = [];

    const sorted = [...utxos].sort((a, b) => {
      const aHasCnt = a.amount.some((e) => e.unit === assetUnit);
      const bHasCnt = b.amount.some((e) => e.unit === assetUnit);
      if (aHasCnt && !bHasCnt) return -1;
      if (!aHasCnt && bHasCnt) return 1;
      const aAda = BigInt(a.amount.find((e) => e.unit === 'lovelace')?.quantity ?? 0);
      const bAda = BigInt(b.amount.find((e) => e.unit === 'lovelace')?.quantity ?? 0);
      return bAda > aAda ? 1 : -1;
    });

    for (const utxo of sorted) {
      if (selectedCnt >= cntAmount && selectedLovelace >= neededLovelace) break;
      const lovelace = BigInt(utxo.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? 0);
      const cnt = BigInt(utxo.amount.find((a: any) => a.unit === assetUnit)?.quantity ?? 0);
      selectedLovelace += lovelace;
      selectedCnt += cnt;
      selectedInputs.push(utxo);
    }

    if (selectedCnt < cntAmount) {
      throw new BadRequestException(`Insufficient CNT after selection: need ${cntAmount}, selected ${selectedCnt}`);
    }
    if (selectedLovelace < neededLovelace) {
      throw new BadRequestException('Insufficient ADA to cover fee and min-ADA output');
    }

    // Add selected inputs
    for (const utxo of selectedInputs) {
      const txInput = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.tx_index,
      );
      const inputLovelace = BigInt(utxo.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? 0);
      const inputValue = CSL.Value.new(CSL.BigNum.from_str(String(inputLovelace)));
      const utxoMa = CSL.MultiAsset.new();
      for (const entry of utxo.amount) {
        if (entry.unit === 'lovelace') continue;
        const ep = CSL.ScriptHash.from_bytes(Buffer.from(entry.unit.slice(0, 56), 'hex'));
        const ea = CSL.AssetName.new(Buffer.from(entry.unit.slice(56), 'hex'));
        const eAssets = CSL.Assets.new();
        eAssets.insert(ea, CSL.BigNum.from_str(entry.quantity));
        utxoMa.insert(ep, eAssets);
      }
      if (utxoMa.len() > 0) inputValue.set_multiasset(utxoMa);
      txBuilder.add_regular_input(senderAddr, txInput, inputValue);
    }

    // Output: send CNT + min-ADA to recipient
    const outputMa = CSL.MultiAsset.new();
    const outputAssets = CSL.Assets.new();
    outputAssets.insert(assetName, cntAmountCSL);
    outputMa.insert(policyId, outputAssets);
    const outputValue = CSL.Value.new(CSL.BigNum.from_str(String(MIN_ADA_LOVELACE)));
    outputValue.set_multiasset(outputMa);
    txBuilder.add_output(CSL.TransactionOutput.new(recipientAddr, outputValue));

    // Change back to sender
    txBuilder.add_change_if_needed(senderAddr);

    const txBody = txBuilder.build();
    const unsignedTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new(), undefined);
    return Buffer.from(unsignedTx.to_bytes()).toString('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Guided deposit (player → hot wallet)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Builds an unsigned deposit tx from the player's CIP-30 UTXOs to the hot
   * wallet.  Returns the CBOR hex for the client to sign with wallet.signTx().
   * Credit is only applied after Blockfrost confirms the tx via the deposit poller.
   */
  async buildDepositTx(
    userId: string,
    amount: bigint,
    utxosCborHex: string[],
    tokenOverride?: { policyId: string; assetName: string },
  ): Promise<{ unsignedTxCborHex: string }> {
    const walletConfig = await (this.prisma as any).cryptoWalletConfig.findUnique({ where: { id: 'default' } });
    if (!walletConfig?.hotWalletAddress) throw new BadRequestException('Hot wallet not configured');

    const apiKey = this.getBlockfrostApiKey(walletConfig);
    if (!apiKey) throw new BadRequestException('Blockfrost API key not configured');

    const cryptoRow = await this.getCryptoCurrencyRow(CURRENCY_ID);
    if (!tokenOverride && (!cryptoRow.cntPolicyId || !cryptoRow.cntAssetName)) {
      throw new BadRequestException('Token policy/asset not configured for this currency');
    }

    const linkedWallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { userId, chain: 'CARDANO', isPrimary: true },
    }) ?? await (this.prisma as any).linkedWallet.findFirst({
      where: { userId, chain: 'CARDANO' },
    });
    if (!linkedWallet) throw new BadRequestException('No linked Cardano wallet found');

    const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
    const utxos = this.decodeCip30Utxos(utxosCborHex, CSL);
    if (utxos.length === 0) throw new BadRequestException('No usable UTXOs supplied');

    const unsignedTxCborHex = await this.buildUnsignedPlayerCntTx({
      utxos,
      senderAddress: linkedWallet.address,
      recipientAddress: walletConfig.hotWalletAddress,
      cntAmount: amount,
      policyIdHex: tokenOverride?.policyId ?? cryptoRow.cntPolicyId,
      assetNameHex: tokenOverride?.assetName ?? cryptoRow.cntAssetName,
      apiKey,
      CSL,
    });

    return { unsignedTxCborHex };
  }

  /**
   * Decodes a hex-encoded Cardano address (as returned by CIP-30 `getChangeAddress()`)
   * into a bech32 string (addr1... for mainnet, addr_test1... for testnet).
   */
  async decodeCardanoAddressHex(hexAddr: string): Promise<{ bech32: string }> {
    try {
      const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
      const bytes = Buffer.from(hexAddr, 'hex');
      if (bytes.length === 0) throw new Error('Empty address bytes');
      // Network tag is in the low nibble of the first header byte: 0 = testnet, 1 = mainnet
      const networkId = bytes[0] & 0x0f;
      const prefix = networkId === 1 ? 'addr' : 'addr_test';
      const addr = CSL.Address.from_bytes(bytes);
      const bech32 = addr.to_bech32(prefix);
      return { bech32 };
    } catch {
      throw new BadRequestException('Invalid Cardano address hex');
    }
  }

  /**
   * Submits a player-signed deposit tx to Blockfrost.  The deposit poller
   * detects the on-chain confirmation and credits the player automatically.
   * This method intentionally does NOT credit the player directly.
   */
  async submitDepositTx(signedTxCborHex: string): Promise<{ txHash: string }> {
    const config = await (this.prisma as any).cryptoWalletConfig.findUnique({ where: { id: 'default' } });
    if (!config?.hotWalletAddress) throw new BadRequestException('Hot wallet not configured');
    const apiKey = this.getBlockfrostApiKey(config);
    if (!apiKey) throw new BadRequestException('Blockfrost API key not configured');

    const txHash = await this.submitTransaction(signedTxCborHex, apiKey);
    return { txHash };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Guided purchase payment (player → purchase destination address)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Builds an unsigned tx that pays for an existing PENDING purchase using the
   * player's CIP-30 UTXOs.  Token identity and destination address come from
   * the purchase record so this works with any CNT.
   *
   * Credit is only granted when the CryptoPollerService detects the confirmed
   * tx on-chain and calls fulfillPurchase — this method does NOT credit directly.
   */
  async buildPurchaseTx(
    userId: string,
    purchaseId: string,
    utxosCborHex: string[],
  ): Promise<{ unsignedTxCborHex: string }> {
    const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.userId !== userId) throw new BadRequestException('Purchase does not belong to this user');
    if (purchase.status !== 'PENDING') throw new BadRequestException(`Purchase is no longer pending (status: ${purchase.status})`);
    if (!purchase.destinationAddress) throw new BadRequestException('Purchase has no destination address');
    if (purchase.amountExpected == null) throw new BadRequestException('Purchase has no expected amount');

    const snap = purchase.rateSnapshot as any;
    const cntMeta = snap?.CNT?.denomination === 'CNT' ? snap.CNT : null;
    if (!cntMeta?.policyId || !cntMeta?.assetName) {
      throw new BadRequestException('Purchase does not have CNT token metadata — cannot build guided tx');
    }

    const apiKey = this.getBlockfrostApiKey(
      await (this.prisma as any).cryptoWalletConfig.findUnique({ where: { id: 'default' } }) ?? {},
    ) ?? process.env.BLOCKFROST_API_KEY;
    if (!apiKey) throw new BadRequestException('Blockfrost API key not configured');

    const linkedWallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { userId, chain: 'CARDANO', isPrimary: true },
    }) ?? await (this.prisma as any).linkedWallet.findFirst({
      where: { userId, chain: 'CARDANO' },
    });
    if (!linkedWallet) throw new BadRequestException('No linked Cardano wallet found');

    const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
    const utxos = this.decodeCip30Utxos(utxosCborHex, CSL);
    if (utxos.length === 0) throw new BadRequestException('No usable UTXOs supplied');

    const cntAmount = BigInt(cntMeta.amountExpected ?? purchase.amountExpected);

    const unsignedTxCborHex = await this.buildUnsignedPlayerCntTx({
      utxos,
      senderAddress: linkedWallet.address,
      recipientAddress: purchase.destinationAddress,
      cntAmount,
      policyIdHex: cntMeta.policyId,
      assetNameHex: cntMeta.assetName,
      apiKey,
      CSL,
    });

    return { unsignedTxCborHex };
  }

  /**
   * Submits a player-signed purchase tx to Blockfrost.
   * Returns the txHash only — the CryptoPollerService detects the on-chain
   * confirmation and calls fulfillPurchase.  This method does NOT credit directly.
   */
  async submitPurchaseTx(
    userId: string,
    purchaseId: string,
    signedTxCborHex: string,
  ): Promise<{ txHash: string }> {
    const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.userId !== userId) throw new BadRequestException('Purchase does not belong to this user');
    if (purchase.status !== 'PENDING') throw new BadRequestException(`Purchase is no longer pending (status: ${purchase.status})`);

    const apiKey = this.getBlockfrostApiKey(
      await (this.prisma as any).cryptoWalletConfig.findUnique({ where: { id: 'default' } }) ?? {},
    ) ?? process.env.BLOCKFROST_API_KEY;
    if (!apiKey) throw new BadRequestException('Blockfrost API key not configured');

    const txHash = await this.submitTransaction(signedTxCborHex, apiKey);
    this.logger.log(`Purchase ${purchaseId} tx submitted by user ${userId} — txHash: ${txHash}`);
    return { txHash };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cardano transaction construction helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches all UTXOs for the hot wallet address via Blockfrost.
   * Returns raw Blockfrost UTXO objects.
   */
  private async fetchHotWalletUtxos(address: string, apiKey: string): Promise<any[]> {
    const resp = await fetch(
      `${BLOCKFROST_BASE}/addresses/${address}/utxos?count=100&order=asc`,
      { headers: { project_id: apiKey }, signal: AbortSignal.timeout(15_000) },
    );
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`Blockfrost UTXOs responded ${resp.status}`);
    return (await resp.json()) as any[];
  }

  /**
   * Fetches the latest protocol parameters from Blockfrost.
   */
  private async fetchProtocolParams(apiKey: string): Promise<any> {
    const resp = await fetch(
      `${BLOCKFROST_BASE}/epochs/latest/parameters`,
      { headers: { project_id: apiKey }, signal: AbortSignal.timeout(10_000) },
    );
    if (!resp.ok) throw new Error(`Blockfrost protocol params responded ${resp.status}`);
    return (await resp.json()) as any;
  }

  /**
   * Builds, balances, and signs a Cardano native-asset (CNT) transfer transaction
   * using `@emurgo/cardano-serialization-lib-nodejs`.
   *
   * Returns the signed transaction as hex CBOR, ready for Blockfrost submission.
   */
  private async buildAndSignCntTransfer(params: {
    utxos: any[];
    destinationAddress: string;
    hotWalletAddress: string;
    cntAmount: bigint;
    policyIdHex: string;
    assetNameHex: string;
    skeyHex: string;
    apiKey: string;
  }): Promise<string> {
    const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

    const {
      utxos,
      destinationAddress,
      hotWalletAddress,
      cntAmount,
      policyIdHex,
      assetNameHex,
      skeyHex,
      apiKey,
    } = params;

    // Fetch live protocol params for accurate fee calculation
    const pp = await this.fetchProtocolParams(apiKey);

    const linearFee = CSL.LinearFee.new(
      CSL.BigNum.from_str(String(pp.min_fee_a ?? 44)),
      CSL.BigNum.from_str(String(pp.min_fee_b ?? 155381)),
    );
    const txBuilderCfg = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(linearFee)
      .pool_deposit(CSL.BigNum.from_str(String(pp.pool_deposit ?? 500000000)))
      .key_deposit(CSL.BigNum.from_str(String(pp.key_deposit ?? 2000000)))
      .max_value_size(pp.max_val_size ?? 5000)
      .max_tx_size(pp.max_tx_size ?? 16384)
      .coins_per_utxo_byte(CSL.BigNum.from_str(String(pp.coins_per_utxo_size ?? pp.coins_per_utxo_word ?? 4310)))
      .build();

    const txBuilder = CSL.TransactionBuilder.new(txBuilderCfg);

    const policyId = CSL.ScriptHash.from_bytes(Buffer.from(policyIdHex, 'hex'));
    const assetNameBytes = CSL.AssetName.new(Buffer.from(assetNameHex, 'hex'));
    const cntAmountCSL = CSL.BigNum.from_str(String(cntAmount));

    // ── UTXO selection ────────────────────────────────────────────────────────
    // We need enough CNT and enough ADA (for min-ADA on output + tx fee).
    let selectedLovelace = 0n;
    let selectedCnt = 0n;
    const neededLovelace = MIN_ADA_LOVELACE + ESTIMATED_FEE_LOVELACE;
    const selectedInputs: any[] = [];

    // Sort: prefer UTXOs that carry CNT first, then by ADA descending
    const sorted = [...utxos].sort((a, b) => {
      const aHasCnt = (a.amount ?? []).some((e: any) => e.unit === `${policyIdHex}${assetNameHex}`);
      const bHasCnt = (b.amount ?? []).some((e: any) => e.unit === `${policyIdHex}${assetNameHex}`);
      if (aHasCnt && !bHasCnt) return -1;
      if (!aHasCnt && bHasCnt) return 1;
      const aAda = BigInt((a.amount ?? []).find((e: any) => e.unit === 'lovelace')?.quantity ?? 0);
      const bAda = BigInt((b.amount ?? []).find((e: any) => e.unit === 'lovelace')?.quantity ?? 0);
      return bAda > aAda ? 1 : -1;
    });

    for (const utxo of sorted) {
      if (selectedCnt >= cntAmount && selectedLovelace >= neededLovelace) break;

      const amounts: Array<{ unit: string; quantity: string }> = utxo.amount ?? [];
      const lovelace = BigInt(amounts.find((a) => a.unit === 'lovelace')?.quantity ?? 0);
      const cnt = BigInt(amounts.find((a) => a.unit === `${policyIdHex}${assetNameHex}`)?.quantity ?? 0);

      selectedLovelace += lovelace;
      selectedCnt += cnt;
      selectedInputs.push(utxo);
    }

    if (selectedCnt < cntAmount) {
      throw new Error(
        `Insufficient CNT in hot wallet: need ${cntAmount}, have ${selectedCnt}`,
      );
    }
    if (selectedLovelace < neededLovelace) {
      throw new Error(
        `Insufficient ADA in hot wallet: need ≥${neededLovelace} lovelace, have ${selectedLovelace}`,
      );
    }

    // ── Add inputs ────────────────────────────────────────────────────────────
    const hotAddr = CSL.Address.from_bech32(hotWalletAddress);
    for (const utxo of selectedInputs) {
      const txInput = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.tx_index,
      );

      // Build the input's Value (lovelace + any multi-assets on this UTXO)
      const inputAmounts: Array<{ unit: string; quantity: string }> = utxo.amount ?? [];
      const inputLovelace = BigInt(inputAmounts.find((a) => a.unit === 'lovelace')?.quantity ?? 0);
      const inputValue = CSL.Value.new(CSL.BigNum.from_str(String(inputLovelace)));
      const utxoMa = CSL.MultiAsset.new();
      for (const entry of inputAmounts) {
        if (entry.unit === 'lovelace') continue;
        const entryPolicyHex = entry.unit.slice(0, 56);
        const entryAssetHex = entry.unit.slice(56);
        const entryPolicy = CSL.ScriptHash.from_bytes(Buffer.from(entryPolicyHex, 'hex'));
        const entryAsset = CSL.AssetName.new(Buffer.from(entryAssetHex, 'hex'));
        const entryAssets = CSL.Assets.new();
        entryAssets.insert(entryAsset, CSL.BigNum.from_str(entry.quantity));
        utxoMa.insert(entryPolicy, entryAssets);
      }
      if (utxoMa.len() > 0) inputValue.set_multiasset(utxoMa);

      // CSL v15 uses add_regular_input(address, input, amount) for enterprise/base addr inputs
      txBuilder.add_regular_input(hotAddr, txInput, inputValue);
    }

    // ── Output: send CNT + min-ADA to destination ─────────────────────────────
    const destAddr = CSL.Address.from_bech32(destinationAddress);
    const outputMa = CSL.MultiAsset.new();
    const outputAssets = CSL.Assets.new();
    outputAssets.insert(assetNameBytes, cntAmountCSL);
    outputMa.insert(policyId, outputAssets);
    const outputValue = CSL.Value.new(CSL.BigNum.from_str(String(MIN_ADA_LOVELACE)));
    outputValue.set_multiasset(outputMa);
    txBuilder.add_output(CSL.TransactionOutput.new(destAddr, outputValue));

    // ── Change output: remaining CNT + ADA (CSL calculates exact fee) ─────────
    txBuilder.add_change_if_needed(hotAddr);

    // ── Sign ──────────────────────────────────────────────────────────────────
    const txBody = txBuilder.build();
    const txHash = CSL.hash_transaction(txBody);

    // Decode the spending key: accept raw 64-byte hex or hex-CBOR Ed25519 private key
    let privateKey: any;
    try {
      // Try as raw 64-byte hex first (most common export format)
      const skeyBytes = Buffer.from(skeyHex, 'hex');
      if (skeyBytes.length === 64) {
        privateKey = CSL.PrivateKey.from_extended_bytes(skeyBytes);
      } else if (skeyBytes.length === 32) {
        privateKey = CSL.PrivateKey.from_normal_bytes(skeyBytes);
      } else {
        // Try as bech32-encoded key (ed25519_sk... or addr_sk...)
        privateKey = CSL.PrivateKey.from_bech32(skeyHex);
      }
    } catch {
      // Final fallback: treat as hex-encoded CBOR envelope
      privateKey = CSL.PrivateKey.from_extended_bytes(Buffer.from(skeyHex, 'hex').slice(4));
    }

    const vkeyWitness = CSL.make_vkey_witness(txHash, privateKey);
    const witnesses = CSL.TransactionWitnessSet.new();
    const vkeys = CSL.Vkeywitnesses.new();
    vkeys.add(vkeyWitness);
    witnesses.set_vkeys(vkeys);

    const signedTx = CSL.Transaction.new(txBody, witnesses, undefined);
    return Buffer.from(signedTx.to_bytes()).toString('hex');
  }

  /**
   * Submits a signed transaction CBOR (hex) to Blockfrost.
   * Returns the on-chain transaction hash on success.
   */
  private async submitTransaction(txHex: string, apiKey: string): Promise<string> {
    const txBytes = Buffer.from(txHex, 'hex');
    const resp = await fetch(`${BLOCKFROST_BASE}/tx/submit`, {
      method: 'POST',
      headers: {
        project_id: apiKey,
        'Content-Type': 'application/cbor',
      },
      body: txBytes,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Blockfrost /tx/submit responded ${resp.status}: ${body.slice(0, 300)}`);
    }

    // Blockfrost returns the tx hash as a JSON string (with quotes)
    const raw = await resp.text();
    return raw.replace(/^"|"$/g, '').trim();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validates the withdrawal amount against the configured minimum.
   *
   * - QUANTITY:   plain CNT unit count check
   * - ADA_VALUE:  converts CNT → ADA using admin-set cntPriceAda; checks ADA value
   * - USD_VALUE:  converts CNT → ADA → USD using cntPriceAda + live AdaRateService
   */
  private async validateMinWithdrawal(currencyRow: any, amount: number): Promise<void> {
    const minType = (currencyRow.cntMinWithdrawalType ?? 'QUANTITY') as string;
    const minAmount = Number(currencyRow.cntMinWithdrawalAmount ?? 1);

    if (minType === 'QUANTITY') {
      if (amount < minAmount) {
        throw new BadRequestException(`Minimum withdrawal is ${minAmount} DERP`);
      }
      return;
    }

    if (minType === 'ADA_VALUE') {
      const cntPriceAda = Number(currencyRow.cntPriceAda ?? 0);
      if (cntPriceAda <= 0) {
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
      const cntPriceAda = Number(currencyRow.cntPriceAda ?? 0);
      if (cntPriceAda <= 0) {
        if (amount < minAmount) {
          throw new BadRequestException(`Minimum withdrawal is $${minAmount} USD (ADA price not configured)`);
        }
        return;
      }
      const adaValue = amount * cntPriceAda;
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Deposit poller (unchanged)
  // ─────────────────────────────────────────────────────────────────────────────

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

    const cryptoRow = await this.getCryptoCurrencyRow(CURRENCY_ID);
    if (!cryptoRow.cntPolicyId || !cryptoRow.cntAssetName) {
      this.logger.warn('pollDeposits: crypto_derp Currency missing cntPolicyId/cntAssetName — skipping');
      return;
    }
    const unit = `${cryptoRow.cntPolicyId}${cryptoRow.cntAssetName}`;
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
        this.notificationService.createNotification({
          userId: player.userId,
          type: 'crypto_deposit',
          category: 'wallet',
          priority: 'high',
          title: `DERP Deposit Received: +${cntAmount.toString()} DERP`,
          body: `Tx: ${tx_hash.slice(0, 8)}…${tx_hash.slice(-8)}`,
          deepLink: { screen: '/wallet' },
          meta: { txHash: tx_hash, amount: cntAmount.toString() },
          sourceType: 'CRYPTO_DEPOSIT',
          sourceId: tx_hash,
        }).catch((err) => {
          this.logger.warn(`Failed to create deposit notification for user ${player.userId}: ${err}`);
        });
      }
    } catch (err: any) {
      if (err?.code === 'P2002') {
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

  /**
   * Creates a withdrawal status notification in the DB and emits it as a
   * PlayerDelta patch so the client's notification bell and toast pipeline
   * update in real time via SSE without waiting for a re-bootstrap.
   */
  private async emitWithdrawalNotification(
    userId: string,
    withdrawalId: string,
    type: 'withdrawal_sent' | 'withdrawal_failed',
    title: string,
    body: string,
    deepLink: any,
    meta: any,
  ): Promise<void> {
    try {
      const notification = await this.notificationService.createNotification({
        userId,
        type,
        category: 'wallet',
        priority: 'high',
        title,
        body,
        deepLink,
        meta,
        sourceType: 'crypto_withdrawal',
        sourceId: withdrawalId,
      });

      const pb = new PatchBuilder();
      pb.upsertNotification(notification);
      const delta = await (this.prisma as any).playerDelta.create({
        data: { userId, patches: pb.build(), ui: [] },
      });
      this.pubsub.publish(`player:${userId}`, { userId, deltaId: delta.id.toString() });
    } catch (err) {
      this.logger.warn(`emitWithdrawalNotification failed for withdrawal ${withdrawalId}: ${err}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin methods
  // ─────────────────────────────────────────────────────────────────────────────

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

    // Explicit state-transition matrix — prevents financial integrity violations.
    //
    // Allowed admin transitions:
    //   PENDING    → APPROVED | REJECTED
    //   APPROVED   → REJECTED
    //   PROCESSING → FAILED (force-fail escape hatch; admin must verify blockchain
    //                before re-queueing to APPROVED or manually marking SENT)
    //   FAILED     → APPROVED | REJECTED
    //   REJECTED   → APPROVED
    //   SENT       → (txHash / adminNote edits only — status is immutable)
    //
    // SENT → anything: blocked (tokens already on-chain; status change would
    // misrepresent reality and REJECTED would double-pay the player).
    //
    // All status-change updates are additionally guarded at the DB level with
    // a conditional updateMany to close the TOCTOU race with the scheduler.
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      PENDING:    ['APPROVED', 'REJECTED'],
      APPROVED:   ['REJECTED'],
      PROCESSING: ['FAILED'],   // force-fail escape hatch only
      FAILED:     ['APPROVED', 'REJECTED'],
      REJECTED:   ['APPROVED'],
      SENT:       [],           // status immutable; txHash/adminNote edits via non-status path
    };

    if (data.status && data.status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status as string] ?? [];
      if (!allowed.includes(data.status)) {
        if (existing.status === 'SENT') {
          throw new BadRequestException(
            'Withdrawal is already SENT on-chain. Status cannot be changed; ' +
            'use adminNote to annotate the record.',
          );
        }
        if (existing.status === 'PROCESSING') {
          throw new BadRequestException(
            'Withdrawal is being submitted on-chain. The only allowed admin override is ' +
            'force-failing it to FAILED (set status: FAILED). Verify the blockchain first.',
          );
        }
        throw new BadRequestException(
          `Transition from ${existing.status} → ${data.status} is not permitted.`,
        );
      }
    }

    const isRejection = data.status === 'REJECTED' && existing.status !== 'REJECTED';

    if (isRejection) {
      // Statuses from which rejection (with refund) is allowed.
      // PROCESSING and SENT are excluded to prevent the double-payout race.
      const rejectableStatuses = ['PENDING', 'APPROVED', 'FAILED'];

      // Atomically reject + refund, guarded so that if the scheduler moved
      // the row to PROCESSING or SENT between our findUnique and now, the
      // update hits zero rows and we abort rather than double-pay.
      const updated = await this.prisma.$transaction(async (tx) => {
        // Guarded status flip — only succeeds if row is still in a rejectable state
        const guard = await (tx as any).cryptoWithdrawal.updateMany({
          where: { id, status: { in: rejectableStatuses } },
          data: {
            status: 'REJECTED',
            ...(data.txHash !== undefined ? { txHash: data.txHash } : {}),
            ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
          },
        });

        if (guard.count === 0) {
          // Status changed concurrently (likely moved to PROCESSING or SENT by scheduler)
          const current = await (tx as any).cryptoWithdrawal.findUnique({ where: { id } });
          throw new BadRequestException(
            `Withdrawal can no longer be rejected — current status is ${current?.status ?? 'unknown'}. ` +
            'Wait for the scheduler to complete (SENT/FAILED) before acting.',
          );
        }

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

        return (tx as any).cryptoWithdrawal.findUnique({ where: { id } });
      });

      await this.emitCurrencyDelta(existing.userId);
      return serializeBigInts(updated);
    }

    // Non-rejection update (e.g. FAILED → APPROVED re-queue, adding txHash/adminNote).
    // Also guarded: block the transition if status changed concurrently.
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.txHash !== undefined) updateData.txHash = data.txHash;
    if (data.adminNote !== undefined) updateData.adminNote = data.adminNote;

    // Guard non-status-change writes (txHash/adminNote on SENT rows) by id only.
    // Status changes are guarded against the expected prior status.
    const whereClause: any = data.status && data.status !== existing.status
      ? { id, status: existing.status }
      : { id };

    const nonRejectionResult = await (this.prisma as any).cryptoWithdrawal.updateMany({
      where: whereClause,
      data: updateData,
    });

    if (nonRejectionResult.count === 0 && data.status && data.status !== existing.status) {
      const current = await (this.prisma as any).cryptoWithdrawal.findUnique({ where: { id } });
      throw new BadRequestException(
        `Withdrawal status changed concurrently — current status is ${current?.status ?? 'unknown'}. Please refresh and retry.`,
      );
    }

    const updated = await (this.prisma as any).cryptoWithdrawal.findUnique({ where: { id } });
    return serializeBigInts(updated);
  }
}
