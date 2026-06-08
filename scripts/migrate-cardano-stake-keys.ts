/**
 * One-off data migration: normalize Cardano linked_wallets to stake keys.
 *
 * For every Cardano linked_wallets row whose `address` is a payment address
 * (addr1...), extract the stake key and:
 *   - If the same user already has a stake-key row for that stake key:
 *     move `isPrimary` to the stake-key row if needed, then delete the
 *     payment-address row.
 *   - Otherwise: update the row in place — set address = stake key, set
 *     paymentAddress = old payment address.
 *   - If the stake key cannot be extracted (enterprise / script address):
 *     leave the row unchanged.
 *
 * Run with:
 *   npx ts-node --project apps/api/tsconfig.json scripts/migrate-cardano-stake-keys.ts
 */

import { PrismaClient } from '@prisma/client';
import { extractStakeKeyFromAddress } from '../apps/api/src/modules/auth/cardano.utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
// Run with: npx ts-node --project apps/api/tsconfig.json -e "require('./scripts/migrate-cardano-stake-keys')"

const prisma = new PrismaClient();

async function main() {
  const rows: Array<{
    id: string;
    userId: string;
    chain: string;
    address: string;
    isPrimary: boolean;
  }> = await (prisma as any).linkedWallet.findMany({
    where: {
      chain: 'CARDANO',
      address: { startsWith: 'addr1' },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${rows.length} Cardano payment-address rows to process.`);
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const row of rows) {
    const stakeKey = extractStakeKeyFromAddress(row.address);
    if (!stakeKey || stakeKey === row.address) {
      console.log(`  SKIP (no stake key) id=${row.id} address=${row.address}`);
      skipped++;
      continue;
    }

    const existingStakeRow: { id: string; isPrimary: boolean } | null =
      await (prisma as any).linkedWallet.findUnique({
        where: { chain_address: { chain: 'CARDANO', address: stakeKey } },
        select: { id: true, isPrimary: true },
      });

    if (existingStakeRow) {
      if (existingStakeRow.userId !== row.userId) {
        console.log(
          `  SKIP (stake key ${stakeKey} belongs to a different user) id=${row.id}`,
        );
        skipped++;
        continue;
      }
      if (row.isPrimary && !existingStakeRow.isPrimary) {
        await (prisma as any).linkedWallet.update({
          where: { id: existingStakeRow.id },
          data: { isPrimary: true },
        });
        console.log(`  Promoted stake-key row ${existingStakeRow.id} to primary`);
      }
      await (prisma as any).linkedWallet.delete({ where: { id: row.id } });
      console.log(
        `  DELETED payment-address row id=${row.id} (stake-key row ${existingStakeRow.id} already exists)`,
      );
      deleted++;
    } else {
      await (prisma as any).linkedWallet.update({
        where: { id: row.id },
        data: { address: stakeKey, paymentAddress: row.address },
      });
      console.log(
        `  UPDATED id=${row.id} address=${row.address} → ${stakeKey}`,
      );
      updated++;
    }
  }

  console.log(`\nDone. updated=${updated}  deleted=${deleted}  skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
