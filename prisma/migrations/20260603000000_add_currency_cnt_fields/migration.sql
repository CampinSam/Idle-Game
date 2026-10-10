-- Migration: Add crypto-token (cnt*) fields to currencies; remove old per-token fields from crypto_wallet_configs
-- Task #901: merged per-token config from CryptoWalletConfig into Currency model.
-- Uses ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS throughout for idempotency.

-- 1. Add new cnt* columns to currencies (all nullable)
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntEcosystem"             TEXT;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntWalletType"            TEXT;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntPolicyId"              TEXT;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntAssetName"             TEXT;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntPriceAda"              DOUBLE PRECISION;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntMinWithdrawalType"     "WithdrawalMinType";
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntMinWithdrawalAmount"   DOUBLE PRECISION;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntWithdrawalFee"         BIGINT;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "cntAutoApprovalThreshold" BIGINT;

-- 2. Drop old per-token columns from crypto_wallet_configs
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "cntPolicyId";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "cntAssetName";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "cntPriceAda";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "minWithdrawalType";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "minWithdrawalAmount";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "withdrawalFee";
ALTER TABLE "crypto_wallet_configs" DROP COLUMN IF EXISTS "autoApprovalThreshold";
