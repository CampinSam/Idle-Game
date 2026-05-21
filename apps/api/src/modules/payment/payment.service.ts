import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { getUncachableStripeClient } from '../../stripe/stripe-client';
import { PurchaseStatus, PurchasePaymentMethod } from '@prisma/client';
import type { CreatePurchaseResult, GemPack, PurchaseStatusResult } from './payment.types';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private currencyService: CurrencyService,
  ) {}

  async listGemPacks(): Promise<GemPack[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.metadata AS product_metadata,
        pr.id AS price_id,
        pr.unit_amount,
        pr.currency
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
        AND p.metadata->>'game' = 'derp-universe'
      ORDER BY pr.unit_amount ASC
    `);

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
    throw new BadRequestException(`Payment method "${paymentMethod}" is not yet supported`);
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

    const stripe = await getUncachableStripeClient();

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
      success_url: `${successUrl}?purchaseId=${purchase.id}`,
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

  async fulfillPurchase(purchaseId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
      if (!purchase) throw new NotFoundException(`Purchase "${purchaseId}" not found`);

      if (purchase.status !== PurchaseStatus.PENDING) {
        this.logger.log(`Purchase ${purchaseId} already in status ${purchase.status} — skipping (idempotent)`);
        return;
      }

      await this.currencyService.creditTx(tx as any, {
        userId: purchase.userId,
        currencyId: 'premium_gems',
        amount: purchase.gemAmount,
        reason: `Gem purchase: ${purchase.packId}`,
        sourceType: 'purchase',
        sourceId: purchaseId,
      });

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { status: PurchaseStatus.CONFIRMED },
      });
    });
  }

  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = await getUncachableStripeClient();

    let event: any;
    try {
      const { getStripeSync } = await import('../../stripe/stripe-client');
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (err) {
      this.logger.warn(`stripe-replit-sync processWebhook error (non-fatal): ${err}`);
    }

    try {
      const webhookSecret = await this.getWebhookSecret();
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } else {
        event = JSON.parse(payload.toString());
        this.logger.warn('No webhook secret configured — skipping signature verification (dev only)');
      }
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
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
