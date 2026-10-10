-- AddColumn: adaWithdrawalFee and adaMinWithdrawalAmount on crypto_wallet_configs
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "adaWithdrawalFee" BIGINT NOT NULL DEFAULT 5000000;
ALTER TABLE "crypto_wallet_configs" ADD COLUMN IF NOT EXISTS "adaMinWithdrawalAmount" BIGINT NOT NULL DEFAULT 2000000;

-- AddColumn: adaServiceFee and adaNetworkFee on crypto_withdrawals
ALTER TABLE "crypto_withdrawals" ADD COLUMN IF NOT EXISTS "adaServiceFee" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "crypto_withdrawals" ADD COLUMN IF NOT EXISTS "adaNetworkFee" BIGINT NOT NULL DEFAULT 0;

-- CreateTable: unresolved_deposits (camelCase columns — repo convention, no @map needed)
CREATE TABLE IF NOT EXISTS "unresolved_deposits" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "senderAddresses" JSONB NOT NULL,
    "amounts" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "creditedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unresolved_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unresolved_deposits)
CREATE UNIQUE INDEX IF NOT EXISTS "unresolved_deposits_txHash_key" ON "unresolved_deposits"("txHash");
CREATE INDEX IF NOT EXISTS "unresolved_deposits_resolvedAt_idx" ON "unresolved_deposits"("resolvedAt");

-- CreateUniqueIndex: enforce one Currency row per CNT (policyId, assetName) pair.
-- NULL values are excluded from enforcement (PostgreSQL unique indexes allow multiple NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS "currencies_cntPolicyId_cntAssetName_key" ON "currencies"("cntPolicyId", "cntAssetName");

-- AddForeignKey (idempotent: skip if constraint already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unresolved_deposits_resolvedByUserId_fkey'
  ) THEN
    ALTER TABLE "unresolved_deposits" ADD CONSTRAINT "unresolved_deposits_resolvedByUserId_fkey"
      FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unresolved_deposits_creditedUserId_fkey'
  ) THEN
    ALTER TABLE "unresolved_deposits" ADD CONSTRAINT "unresolved_deposits_creditedUserId_fkey"
      FOREIGN KEY ("creditedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
