-- Remediation (part 2): add missing 'key' columns to all remaining tables
-- affected by the incorrect baselining of UUID migrations 20260614000000,
-- 20260614000002, 20260614000004, and 20260614000005.
-- All operations are fully idempotent.

-- ── migration 20260614000000 ─────────────────────────────────────────────────

ALTER TABLE "effect_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "effect_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='effect_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "effect_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "effect_defs_key_key" ON "effect_defs"("key");

ALTER TABLE "power_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "power_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='power_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "power_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "power_defs_key_key" ON "power_defs"("key");

-- ── migration 20260614000002 ─────────────────────────────────────────────────

ALTER TABLE "quest_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "quest_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "quest_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "quest_defs_key_key" ON "quest_defs"("key");

ALTER TABLE "checkin_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "checkin_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='checkin_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "checkin_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "checkin_defs_key_key" ON "checkin_defs"("key");

ALTER TABLE "gift_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "gift_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "gift_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "gift_defs_key_key" ON "gift_defs"("key");

-- ── migration 20260614000004 ─────────────────────────────────────────────────

ALTER TABLE "region_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "region_definitions" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='region_definitions' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "region_definitions" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "region_definitions_key_key" ON "region_definitions"("key");

ALTER TABLE "location_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "location_definitions" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='location_definitions' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "location_definitions" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "location_definitions_key_key" ON "location_definitions"("key");

ALTER TABLE "building_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "building_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='building_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "building_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "building_defs_key_key" ON "building_defs"("key");

ALTER TABLE "room_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "room_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='room_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "room_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "room_defs_key_key" ON "room_defs"("key");

ALTER TABLE "entity_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "entity_definitions" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='entity_definitions' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "entity_definitions" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "entity_definitions_key_key" ON "entity_definitions"("key");

-- ── migration 20260614000005 ─────────────────────────────────────────────────

ALTER TABLE "mission_category_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "mission_category_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mission_category_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "mission_category_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "mission_category_defs_key_key" ON "mission_category_defs"("key");

ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "mission_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mission_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "mission_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "mission_defs_key_key" ON "mission_defs"("key");

ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "recipe_defs" SET "key" = "id" WHERE "key" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipe_defs' AND column_name='key' AND is_nullable='YES') THEN
    ALTER TABLE "recipe_defs" ALTER COLUMN "key" SET NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_defs_key_key" ON "recipe_defs"("key");
