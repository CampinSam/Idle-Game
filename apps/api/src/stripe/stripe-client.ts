import Stripe from 'stripe';

export async function getUncachableStripeClient(): Promise<InstanceType<typeof Stripe>> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
      'Set STRIPE_SECRET_KEY to enable Stripe payments.',
    );
  }
  return new Stripe(secretKey);
}
