/**
 * One-off migration: copies per-token fields from CryptoWalletConfig to the
 * crypto_derp Currency row before those columns are removed from CryptoWalletConfig.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register apps/api/src/seeds/migrations/migrate-crypto-config.ts
 *
 * from the workspace root (after `pnpm prisma generate`).
 */
import { PrismaClient } from '@prisma/client';

const CNT_POLICY_ID_DEFAULT = 'd9d59e71eb99e653a493956a6826a406060706bd8c9a2427b3564f6';
const CNT_ASSET_NAME_DEFAULT = '45525020434f494e';

async function main() {
  const prisma = new PrismaClient();
  try {
    const config = await (prisma as any).cryptoWalletConfig.findUnique({
      where: { id: 'default' },
    });

    const updateData: any = {
      cntEcosystem: 'CARDANO',
      cntWalletType: 'CIP30',
      cntPolicyId: config?.cntPolicyId || CNT_POLICY_ID_DEFAULT,
      cntAssetName: config?.cntAssetName || CNT_ASSET_NAME_DEFAULT,
    };

    if (config?.cntPriceAda != null) updateData.cntPriceAda = config.cntPriceAda;
    if (config?.minWithdrawalType) updateData.cntMinWithdrawalType = config.minWithdrawalType;
    if (config?.minWithdrawalAmount != null) updateData.cntMinWithdrawalAmount = config.minWithdrawalAmount;
    if (config?.withdrawalFee != null) updateData.cntWithdrawalFee = config.withdrawalFee;
    if (config?.autoApprovalThreshold != null) updateData.cntAutoApprovalThreshold = config.autoApprovalThreshold;

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
