import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { PurchaseEventBus } from './purchase-event.bus';
import { AdaRateService } from './ada-rate.service';
import { getUncachableStripeClient } from '../../stripe/stripe-client';
import { PurchaseStatus, PurchasePaymentMethod } from '@prisma/client';
import type { CreatePurchaseResult, GemPack, PurchaseStatusResult } from './payment.types';

// EVM crypto price map: USDC has 6 decimals ($0.99 = 990_000).
const CRYPTO_EVM_PRICES: Record<string, { usdcAmount: bigint }> = {
  gems_100:  { usdcAmount: 990_000n    },
  gems_500:  { usdcAmount: 4_990_000n  },
  gems_1200: { usdcAmount: 9_990_000n  },
  gems_2000: { usdcAmount: 14_990_000n },
  gems_2500: { usdcAmount: 19_990_000n },
  gems_5000: { usdcAmount: 29_990_000n },
};

// USD prices per pack — used to derive live ADA amounts at purchase time.
const PACK_USD_PRICES: Record<string, number> = {
  gems_100: 0.99, gems_500: 4.99, gems_1200: 9.99,
  gems_2000: 14.99, gems_2500: 19.99, gems_5000: 29.99,
};

// Gem amounts by pack (duplicates Stripe metadata — avoids a Stripe round-trip for crypto path).
const PACK_GEM_AMOUNTS: Record<string, number> = {
  gems_100: 100, gems_500: 500, gems_1200: 1200,
  gems_2000: 2000, gems_2500: 2500, gems_5000: 5000,
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private currencyService: CurrencyService,
    private purchaseEventBus: PurchaseEventBus,
    private adaRateService: AdaRateService,
  ) {}

  // Sentinel account ID used by the bootstrap seed — never a real Stripe account.
  private static readonly DEMO_ACCOUNT_ID = 'acct_derp_demo';

  async listGemPacks(): Promise<GemPack[]> {
    // DISTINCT ON deduplicates by packId and always prefers live Stripe rows
    // (non-demo account) over the bootstrap-seeded demo rows. The outer query
    // then re-sorts by unit_amount for consistent display order.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT product_id, product_name, product_description, product_metadata,
             price_id, unit_amount, currency
      FROM (
        SELECT DISTINCT ON (p.metadata->>'packId')
          p.id               AS product_id,
          p.name             AS product_name,
          p.description      AS product_description,
          p.metadata         AS product_metadata,
          pr.id              AS price_id,
          pr.unit_amount,
          pr.currency
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
          AND p.metadata->>'game' = 'derp-universe'
        ORDER BY
          p.metadata->>'packId',
          CASE WHEN p._account_id = $1 THEN 1 ELSE 0 END ASC,
          pr.unit_amount ASC
      ) deduped
      ORDER BY unit_amount ASC
    `, PaymentService.DEMO_ACCOUNT_ID);

    return rows.map((row, idx) => ({
      id: row.product_metadata?.packId ?? row.product_id,
      name: row.product_name,
      description: row.product_description ?? '',
      gemAmount: Number(row.product_metadata?.gemAmount ?? 0),
      priceId: row.price_id,
      unitAmount: Number(row.unit_amount),
      currency: row.currency ?? 'usd',
      displayOrder: idx,
    }));
  }

  async createPurchase(
    userId: string,
    packId: string,
    paymentMethod: 'stripe' | 'crypto_evm' | 'crypto_cardano',
    successUrl: string,
    cancelUrl: string,
  ): Promise<CreatePurchaseResult> {
    if (paymentMethod === 'stripe') {
      return this.createStripePurchase(userId, packId, successUrl, cancelUrl);
    }
    if (paymentMethod === 'crypto_evm') {
      return this.createCryptoPurchase(userId, packId, 'CRYPTO_EVM');
    }
    if (paymentMethod === 'crypto_cardano') {
      return this.createCryptoPurchase(userId, packId, 'CRYPTO_CARDANO');
    }
    throw new BadRequestException(`Payment method "${paymentMethod}" is not yet supported`);
  }

  private async createCryptoPurchase(
    userId: string,
    packId: string,
    method: 'CRYPTO_EVM' | 'CRYPTO_CARDANO',
  ): Promise<CreatePurchaseResult> {
    const isEvm = method === 'CRYPTO_EVM';
    const envKey = isEvm ? 'PAYMENT_ADDRESS_EVM' : 'PAYMENT_ADDRESS_CARDANO';
    const configuredAddress = process.env[envKey];
    // Demo placeholder addresses used when treasury is not yet configured.
    // The frontend renders a "Coming Soon" banner so no funds are lost.
    const DEMO_EVM_ADDRESS = '0xdEAD000000000000000042069420694206942069';
    const DEMO_ADA_ADDRESS =
      'addr1qxy6nqz5kzqkxwkdqze3e0fq0ztq0xxjhx5z3t0pqzq5fkqzx0zqtq0qderpuniverse00000000000000000000000000000s67zjs';
    const destinationAddress = configuredAddress ?? (isEvm ? DEMO_EVM_ADDRESS : DEMO_ADA_ADDRESS);
    const comingSoon = !configuredAddress;

    const evmPrices = CRYPTO_EVM_PRICES[packId];
    if (!evmPrices) {
      throw new NotFoundException(`No crypto pricing found for pack "${packId}"`);
    }
    const usdPrice = PACK_USD_PRICES[packId];
    if (usdPrice === undefined) {
      throw new NotFoundException(`No USD price defined for pack "${packId}"`);
    }
    const gemAmount = PACK_GEM_AMOUNTS[packId];
    if (!gemAmount) {
      throw new NotFoundException(`Unknown pack "${packId}"`);
    }

    let amountExpected: bigint;
    if (isEvm) {
      amountExpected = evmPrices.usdcAmount;
    } else {
      const lovelacePerUsd = await this.adaRateService.getLovelacePerUsd();
      amountExpected = BigInt(Math.ceil(usdPrice * lovelacePerUsd));
    }
    const chain = isEvm ? 'ETH' : 'CARDANO';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        packId,
        gemAmount,
        paymentMethod: method,
        status: PurchaseStatus.PENDING,
        chain,
        destinationAddress,
        amountExpected,
        expiresAt,
      },
    });

    const amountDisplay = isEvm
      ? `${(Number(amountExpected) / 1_000_000).toFixed(6)} USDC`
      : `${(Number(amountExpected) / 1_000_000).toFixed(6)} ADA`;

    return {
      purchaseId: purchase.id,
      comingSoon: comingSoon || undefined,
      action: {
        type: 'payment_address',
        address: destinationAddress,
        amountExpected: amountExpected.toString(),
        amountDisplay,
        chain,
        expiresAt: expiresAt.toISOString(),
      } as any,
    };
  }

  private async createStripePurchase(
    userId: string,
    packId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CreatePurchaseResult> {
    const packs = await this.listGemPacks();
    const pack = packs.find((p) => p.id === packId);
    if (!pack) throw new NotFoundException(`Gem pack "${packId}" not found`);

    let stripe: any;
    try {
      stripe = await getUncachableStripeClient();
    } catch (err: any) {
      // Only treat known "integration not configured" errors as coming-soon.
      // Re-throw transient network failures or other unexpected errors so they
      // surface normally and don't silently degrade a live Stripe environment.
      const msg: string = err?.message ?? '';
      const isNotConfigured =
        msg.includes('Missing Replit environment variables') ||
        msg.includes('Stripe integration not connected or missing secret key');
      if (!isNotConfigured) throw err;
      return { purchaseId: 'demo', action: { type: 'coming_soon' }, comingSoon: true };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let stripeCustomerId = user.stripeCustomerId ?? undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId },
      });
    }

    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        packId,
        gemAmount: pack.gemAmount,
        paymentMethod: PurchasePaymentMethod.STRIPE,
        status: PurchaseStatus.PENDING,
      },
    });

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: pack.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}purchaseId=${purchase.id}`,
      cancel_url: cancelUrl,
      metadata: {
        purchaseId: purchase.id,
        userId,
        packId,
        gemAmount: String(pack.gemAmount),
      },
    });

    await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: { stripeSessionId: session.id },
    });

    return {
      purchaseId: purchase.id,
      action: { type: 'redirect', url: session.url! },
    };
  }

  async fulfillPurchase(purchaseId: string, txHash?: string): Promise<void> {
    let confirmedPurchase: { purchaseId: string; userId: string; gemAmount: number; packId: string; paymentMethod: string } | null = null;

    await this.prisma.$transaction(async (tx) => {
      // Atomically claim the purchase: only one concurrent caller will observe
      // count=1 from the conditional UPDATE. Any subsequent caller sees count=0
      // and returns early — this is the idempotency guard that prevents
      // double-crediting even when duplicate webhook events arrive concurrently.
      // For crypto purchases txHash is set here inside the transaction so the
      // DB @unique constraint prevents the same on-chain tx from crediting twice
      // even across concurrent workers.
      const result = txHash
        ? await tx.$executeRaw`
            UPDATE "purchases"
            SET    status  = 'CONFIRMED',
                   "txHash" = ${txHash}
            WHERE  id       = ${purchaseId}
            AND    status   = 'PENDING'
          `
        : await tx.$executeRaw`
            UPDATE "purchases"
            SET    status = 'CONFIRMED'
            WHERE  id     = ${purchaseId}
            AND    status = 'PENDING'
          `;

      if (result === 0) {
        // Either already fulfilled (CONFIRMED/FAILED/EXPIRED) or does not exist.
        // Both cases are safe to skip — log at INFO so ops can audit.
        const existing = await tx.purchase.findUnique({ where: { id: purchaseId } });
        if (!existing) {
          this.logger.warn(`fulfillPurchase: purchase "${purchaseId}" not found — skipping`);
        } else {
          this.logger.log(`fulfillPurchase: purchase "${purchaseId}" already ${existing.status} — skipping (idempotent)`);
        }
        return;
      }

      // We won the race — read the row to get userId/gemAmount for crediting.
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });

      await this.currencyService.creditTx(tx as any, {
        userId: purchase.userId,
        currencyId: 'premium_gems',
        amount: purchase.gemAmount,
        reason: `Gem purchase: ${purchase.packId}`,
        sourceType: 'purchase',
        sourceId: purchaseId,
      });

      confirmedPurchase = {
        purchaseId: purchase.id,
        userId: purchase.userId,
        gemAmount: purchase.gemAmount,
        packId: purchase.packId,
        paymentMethod: purchase.paymentMethod,
      };
    });

    // Emit after transaction commits — ensures SSE fires only on durable state.
    if (confirmedPurchase) {
      this.purchaseEventBus.emit(confirmedPurchase);
    }
  }

  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const isProduction = process.env.NODE_ENV === 'production';

    // Forward payload to stripe-replit-sync for table hydration (non-fatal).
    try {
      const { getStripeSync } = await import('../../stripe/stripe-client');
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (err) {
      this.logger.warn(`stripe-replit-sync processWebhook error (non-fatal): ${err}`);
    }

    // Verify signature and construct the event.
    // In production we ALWAYS require a webhook secret; without it we reject
    // the request to prevent forged events from crediting gems.
    // In development (NODE_ENV !== 'production') we allow unsigned events so
    // the Stripe CLI `stripe listen --forward-to ...` flow works without secrets.
    const webhookSecret = await this.getWebhookSecret();
    let event: any;

    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } catch (err: any) {
        throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
      }
    } else if (!isProduction) {
      event = JSON.parse(payload.toString());
      this.logger.warn('No webhook secret — skipping signature verification (dev only, never in production)');
    } else {
      // Production with no secret: reject. This prevents credit-without-auth.
      throw new BadRequestException(
        'Webhook secret not configured. Connect the Stripe integration and ensure webhook_secret is set.',
      );
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const purchaseId = session.metadata?.purchaseId;
      if (!purchaseId) {
        this.logger.warn(`checkout.session.completed missing purchaseId in metadata — session ${session.id}`);
        return;
      }
      await this.fulfillPurchase(purchaseId);
      this.logger.log(`Fulfilled purchase ${purchaseId} via Stripe session ${session.id}`);
    }
  }

  async getPurchaseStatus(purchaseId: string, userId: string): Promise<PurchaseStatusResult> {
    const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) throw new NotFoundException(`Purchase "${purchaseId}" not found`);
    if (purchase.userId !== userId) throw new ForbiddenException('Access denied');

    return {
      id: purchase.id,
      packId: purchase.packId,
      gemAmount: purchase.gemAmount,
      paymentMethod: purchase.paymentMethod,
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
    };
  }

  private async getWebhookSecret(): Promise<string | undefined> {
    try {
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY
        ? 'repl ' + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL
          ? 'depl ' + process.env.WEB_REPL_RENEWAL
          : null;
      if (!hostname || !xReplitToken) return undefined;
      const resp = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
        { headers: { Accept: 'application/json', X_REPLIT_TOKEN: xReplitToken }, signal: AbortSignal.timeout(5_000) },
      );
      if (!resp.ok) return undefined;
      const data = await resp.json() as any;
      return data.items?.[0]?.settings?.webhook_secret ?? undefined;
    } catch {
      return undefined;
    }
  }
}
