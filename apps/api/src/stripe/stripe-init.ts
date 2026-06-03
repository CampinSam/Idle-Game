import { Logger } from '@nestjs/common';

const logger = new Logger('StripeInit');

export async function initStripe(): Promise<void> {
  logger.log(
    'Stripe sync disabled — stripe-replit-sync not installed. ' +
    'Set STRIPE_SECRET_KEY to enable Stripe checkout; crypto payments are always available.',
  );
}
