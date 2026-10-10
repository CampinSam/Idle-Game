-- Throttle marker for auto NFT sync. NULL means "never synced" so the next
-- login or background sweep will run a sync regardless of throttle window.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastNftSyncAt" TIMESTAMP(3);
