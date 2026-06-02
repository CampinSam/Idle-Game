/**
 * One-off migration: copies per-token fields from CryptoWalletConfig to the
 * crypto_derp Currency row.
 *
 * This script uses raw SQL to read legacy CryptoWalletConfig columns so it
 * remains safe to run regardless of whether those columns still exist in the
 * current Prisma schema — the query simply returns nulls for absent columns.
 *
 * Run with:
 *   node -e "require('./apps/api/src/seeds/migrations/migrate-crypto-config')"
 *
 * Or source it from a ts-node context after `pnpm prisma generate`.
 *
 * NOTE: The migration was already executed during the Task #901 deploy. This
 * script is retained as a reference and for any environment that still has
 * the old columns present.
 */
import { PrismaClient } from '@prisma/client';

const CNT_POLICY_ID_DEFAULT = 'd9d59e71eb99e653a493956a6826a406060706bd8c9a2427b3564f6';
const CNT_ASSET_NAME_DEFAULT = '45525020434f494e';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Use raw SQL so we can read columns that may no longer exist in the Prisma
    // schema without Prisma throwing a "Unknown field" error.
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         cnt_policy_id         AS "cntPolicyId",
         cnt_asset_name        AS "cntAssetName",
         cnt_price_ada         AS "cntPriceAda",
         min_withdrawal_type   AS "minWithdrawalType",
         min_withdrawal_amount AS "minWithdrawalAmount",
         withdrawal_fee        AS "withdrawalFee",
         auto_approval_threshold AS "autoApprovalThreshold"
       FROM crypto_wallet_configs
       WHERE id = 'default'
       LIMIT 1`,
    ).catch(() => [] as any[]);

    const config = rows[0] ?? null;

    const updateData: any = {
      cntEcosystem: 'CARDANO',
      cntWalletType: 'CIP30',
      cntPolicyId: config?.cntPolicyId || CNT_POLICY_ID_DEFAULT,
      cntAssetName: config?.cntAssetName || CNT_ASSET_NAME_DEFAULT,
    };

    if (config?.cntPriceAda != null) updateData.cntPriceAda = Number(config.cntPriceAda);
    if (config?.minWithdrawalType) updateData.cntMinWithdrawalType = config.minWithdrawalType;
    if (config?.minWithdrawalAmount != null) updateData.cntMinWithdrawalAmount = Number(config.minWithdrawalAmount);
    if (config?.withdrawalFee != null) updateData.cntWithdrawalFee = BigInt(config.withdrawalFee);
    if (config?.autoApprovalThreshold != null) updateData.cntAutoApprovalThreshold = BigInt(config.autoApprovalThreshold);

    const currency = await prisma.currency.findUnique({ where: { id: 'crypto_derp' } });
    if (!currency) {
      console.error('crypto_derp Currency row not found — run the definitions seed first');
      process.exit(1);
    }

    await prisma.currency.update({
      where: { id: 'crypto_derp' },
      data: updateData,
    });

    console.log('✓ Migrated crypto config to crypto_derp Currency row:');
    console.log('  cntEcosystem:', updateData.cntEcosystem);
    console.log('  cntWalletType:', updateData.cntWalletType);
    console.log('  cntPolicyId:', updateData.cntPolicyId);
    console.log('  cntAssetName:', updateData.cntAssetName);
    if (updateData.cntMinWithdrawalType) console.log('  cntMinWithdrawalType:', updateData.cntMinWithdrawalType);
    if (updateData.cntMinWithdrawalAmount != null) console.log('  cntMinWithdrawalAmount:', updateData.cntMinWithdrawalAmount);
    if (updateData.cntWithdrawalFee != null) console.log('  cntWithdrawalFee:', updateData.cntWithdrawalFee.toString());
    if (updateData.cntAutoApprovalThreshold != null) console.log('  cntAutoApprovalThreshold:', updateData.cntAutoApprovalThreshold.toString());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
