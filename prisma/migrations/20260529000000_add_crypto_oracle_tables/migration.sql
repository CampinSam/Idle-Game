-- Add rateSnapshot column to purchases
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "rateSnapshot" JSONB;

-- CreateTable: crypto_rate_configs
CREATE TABLE IF NOT EXISTS "crypto_rate_configs" (
    "currencyCode" TEXT NOT NULL,
    "oracleUrl" TEXT NOT NULL,
    "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "twaWindowSeconds" INTEGER NOT NULL DEFAULT 3600,
    "fallbackLovelacePerUsd" BIGINT NOT NULL DEFAULT 2000000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_rate_configs_pkey" PRIMARY KEY ("currencyCode")
);

-- CreateTable: crypto_rate_samples
CREATE TABLE IF NOT EXISTS "crypto_rate_samples" (
    "id" BIGSERIAL NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "usdPrice" DOUBLE PRECISION NOT NULL,
    "lovelacePerUsd" BIGINT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_rate_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crypto_rate_samples_currencyCode_fetchedAt_idx" ON "crypto_rate_samples"("currencyCode", "fetchedAt" DESC);
