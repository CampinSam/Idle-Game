-- Remediation: add missing 'key' columns to UI/system definition tables
-- that were not covered by the 20260621200000/20260621200001 remediation passes.
-- All operations are fully idempotent.

-- display_defs ----------------------------------------------------------------
ALTER TABLE "display_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "display_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='display_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "display_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "display_defs_key_key" ON "display_defs"("key");

-- event_definitions -----------------------------------------------------------
ALTER TABLE "event_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "event_definitions" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_definitions' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "event_definitions" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "event_definitions_key_key" ON "event_definitions"("key");

-- modal_defs ------------------------------------------------------------------
ALTER TABLE "modal_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "modal_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='modal_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "modal_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "modal_defs_key_key" ON "modal_defs"("key");

-- default_modal_defs ----------------------------------------------------------
ALTER TABLE "default_modal_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "default_modal_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='default_modal_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "default_modal_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "default_modal_defs_key_key" ON "default_modal_defs"("key");

-- home_banner_defs ------------------------------------------------------------
ALTER TABLE "home_banner_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "home_banner_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='home_banner_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "home_banner_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "home_banner_defs_key_key" ON "home_banner_defs"("key");

-- system_icon_defs ------------------------------------------------------------
ALTER TABLE "system_icon_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "system_icon_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_icon_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "system_icon_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "system_icon_defs_key_key" ON "system_icon_defs"("key");

-- synergy_rules ---------------------------------------------------------------
ALTER TABLE "synergy_rules" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "synergy_rules" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='synergy_rules' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "synergy_rules" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "synergy_rules_key_key" ON "synergy_rules"("key");

-- nft_collection_defs ---------------------------------------------------------
ALTER TABLE "nft_collection_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "nft_collection_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nft_collection_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "nft_collection_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "nft_collection_defs_key_key" ON "nft_collection_defs"("key");
