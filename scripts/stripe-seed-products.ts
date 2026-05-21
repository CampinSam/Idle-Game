import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getUncachableStripeClient() {
  const { getUncachableStripeClient } = await import(
    path.resolve(__dirname, '../apps/api/src/stripe/stripe-client.js')
  );
  return getUncachableStripeClient();
}

const GEM_PACKS = [
  { id: 'gems_100',  name: '100 Gems',   gemAmount: 100,  unitAmount: 99   },
  { id: 'gems_500',  name: '500 Gems',   gemAmount: 500,  unitAmount: 499  },
  { id: 'gems_1200', name: '1200 Gems',  gemAmount: 1200, unitAmount: 999  },
  { id: 'gems_2500', name: '2500 Gems',  gemAmount: 2500, unitAmount: 1999 },
];

async function main() {
  const stripe = await getUncachableStripeClient();

  for (const pack of GEM_PACKS) {
    const existing = await stripe.products.search({
      query: `metadata['packId']:'${pack.id}'`,
    });

    if (existing.data.length > 0) {
      console.log(`[skip] ${pack.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: pack.name,
      description: `${pack.gemAmount} premium gems for Derp Universe`,
      metadata: {
        packId: pack.id,
        gemAmount: String(pack.gemAmount),
        game: 'derp-universe',
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.unitAmount,
      currency: 'usd',
    });

    console.log(`[ok] ${pack.name} — product ${product.id}, price ${price.id} ($${(pack.unitAmount / 100).toFixed(2)})`);
  }

  console.log('Done. Webhooks will sync products to the local database automatically.');
}

main().catch((err) => {
  console.error('Error seeding Stripe products:', err.message);
  process.exit(1);
});
