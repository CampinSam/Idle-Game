import { Logger } from '@nestjs/common';

const logger = new Logger('StripeInit');

export async function initStripe(): Promise<void> {
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    const { getStripeSync } = await import('./stripe-client');

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      logger.warn('DATABASE_URL not set — skipping Stripe init');
      return;
    }

    logger.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl } as any);
    logger.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (domain) {
      const webhookBaseUrl = `https://${domain}`;
      // In production the global `/api` prefix is applied (see main.ts setGlobalPrefix).
      // The webhook controller is mounted at /v1/purchases/stripe/webhook, which becomes
      // /api/v1/purchases/stripe/webhook in production. Stripe must call the prefixed URL.
      const isProduction = process.env.NODE_ENV === 'production';
      const webhookPath = isProduction
        ? '/api/v1/purchases/stripe/webhook'
        : '/v1/purchases/stripe/webhook';
      try {
        await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}${webhookPath}`);
        logger.log(`Stripe webhook configured at ${webhookBaseUrl}${webhookPath}`);
      } catch (err) {
        logger.warn(`Could not configure managed webhook (non-fatal): ${err}`);
      }
    }

    stripeSync
      .syncBackfill()
      .then(() => logger.log('Stripe data backfill complete'))
      .catch((err) => logger.warn(`Stripe backfill error (non-fatal): ${err}`));
  } catch (err: any) {
    // Stripe not connected yet — log and continue. The app boots normally;
    // payment endpoints will return errors until the integration is connected.
    logger.warn(
      `Stripe init skipped — integration not connected or credentials missing. ` +
      `Connect Stripe via the Integrations tab to enable payments. (${err?.message ?? err})`,
    );
  }
}
