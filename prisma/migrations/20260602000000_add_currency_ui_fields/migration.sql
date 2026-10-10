-- Migration: Add enabled, showInTopBar, sortOrder columns to currencies table
-- These columns exist in the Prisma schema but were never added via a migration.
-- Uses ADD COLUMN IF NOT EXISTS throughout for idempotency.

ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "showInTopBar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Index matching @@index([enabled]) in schema
CREATE INDEX IF NOT EXISTS "currencies_enabled_idx" ON "currencies"("enabled");
