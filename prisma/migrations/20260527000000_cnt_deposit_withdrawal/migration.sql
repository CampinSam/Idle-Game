-- AddValue: CRYPTO to CurrencyType enum
ALTER TYPE "CurrencyType" ADD VALUE IF NOT EXISTS 'CRYPTO';

-- CreateEnum: WithdrawalStatus
DO $$ BEGIN
  CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: WithdrawalMinType
DO $$ BEGIN
  CREATE TYPE "WithdrawalMinType" AS ENUM ('QUANTITY', 'ADA_VALUE', 'USD_VALUE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: ProcessedCryptoTx (idempotency guard for deposit polling)
CREATE TABLE IF NOT EXISTS "processed_crypto_txs" (
    "txHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_crypto_txs_pkey" PRIMARY KEY ("txHash")
);

-- CreateTable: CryptoWalletConfig
CREATE TABLE IF NOT EXISTS "crypto_wallet_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hotWalletAddress" TEXT NOT NULL DEFAULT '',
    "cntPolicyId" TEXT NOT NULL DEFAULT '',
    "cntAssetName" TEXT NOT NULL DEFAULT '',
    "blockfrostProjectId" TEXT NOT NULL DEFAULT '',
    "cntPriceAda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minWithdrawalType" "WithdrawalMinType" NOT NULL DEFAULT 'QUANTITY',
    "minWithdrawalAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "withdrawalFee" BIGINT NOT NULL DEFAULT 0,
    "autoApprovalThreshold" BIGINT NOT NULL DEFAULT 0,
    "depositScanPage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crypto_wallet_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CryptoWithdrawal
CREATE TABLE IF NOT EXISTS "crypto_withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "destinationAddress" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "txHash" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crypto_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crypto_withdrawals_userId_idx" ON "crypto_withdrawals"("userId");
CREATE INDEX IF NOT EXISTS "crypto_withdrawals_status_idx" ON "crypto_withdrawals"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "crypto_withdrawals"
    ADD CONSTRAINT "crypto_withdrawals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
