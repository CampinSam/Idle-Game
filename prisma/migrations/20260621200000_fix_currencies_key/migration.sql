-- Remediation: add missing 'key' columns to currencies, lootbox_defs, bundle_defs, item_defs.
-- Migration 20260614000003 was incorrectly baselined in production because its
-- ADD CONSTRAINT statements matched pre-existing constraint names, even though
-- the ADD COLUMN IF NOT EXISTS "key" steps never actually ran.
-- All operations here are fully idempotent.

-- currencies ------------------------------------------------------------------

ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "currencies" SET "key" = "id" WHERE "key" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'currencies'
      AND column_name = 'key' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "currencies" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "currencies_key_key" ON "currencies"("key");

-- lootbox_defs ----------------------------------------------------------------

ALTER TABLE "lootbox_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "lootbox_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lootbox_defs'
      AND column_name = 'key' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "lootbox_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "lootbox_defs_key_key" ON "lootbox_defs"("key");

-- bundle_defs -----------------------------------------------------------------

ALTER TABLE "bundle_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "bundle_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bundle_defs'
      AND column_name = 'key' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "bundle_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "bundle_defs_key_key" ON "bundle_defs"("key");

-- item_defs -------------------------------------------------------------------

ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "item_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'item_defs'
      AND column_name = 'key' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "item_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "item_defs_key_key" ON "item_defs"("key");
