-- Align production entity_definitions with the current Prisma schema.
--
-- Context: the EntityDefinition model was significantly refactored — the old
-- body/equipment/progression FK architecture (bodySchemaId → body_schemas,
-- equipmentSchemaId → equipment_schemas, progressionProfileId →
-- progression_profiles) was replaced with inline JSON columns. The Prisma
-- schema and dev database already reflect the new structure (via prisma db
-- push), but production still has the old columns, FKs, and orphaned tables.
-- Additionally, the trait_definitions table was removed from the schema.
--
-- Because no migration file was written for these changes at the time, the
-- Replit publish-time differ tries to generate DROP TABLE / DROP CONSTRAINT
-- statements out of order, causing constraint-not-found errors. This
-- migration handles the cleanup manually in the correct order.
--
-- The entire migration is idempotent: every operation checks for the object's
-- existence before acting, so it is safe to run on both dev (where the old
-- tables/columns no longer exist) and production (where they still do).
--
-- Orphaned tables being dropped (all dev-only data, safe to remove):
--   body_schemas        (2 rows on prod)
--   equipment_schemas   (1 row on prod)
--   progression_profiles (1 row on prod)
--   trait_definitions   (38 rows on prod; no FKs reference it)
--
-- New columns added to entity_definitions (6 rows on prod):
--   name TEXT NOT NULL  — added with DEFAULT '' so existing rows are valid;
--                         seed upserts will write real names on next deploy.
--   slots / equipmentSlots / traits — Json, schema default '{}'.
--   progression / ascension / mastery / init — Json NOT NULL, no schema
--     default; added with DEFAULT '{}' so the ADD COLUMN succeeds, then the
--     default is dropped to match Prisma-generated DDL exactly.

BEGIN;

-- ─── Step 1: Drop FK constraints from entity_definitions ─────────────────────
-- Must happen before dropping the referenced tables.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'entity_definitions'
      AND constraint_name = 'entity_definitions_bodySchemaId_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      DROP CONSTRAINT "entity_definitions_bodySchemaId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'entity_definitions'
      AND constraint_name = 'entity_definitions_equipmentSchemaId_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      DROP CONSTRAINT "entity_definitions_equipmentSchemaId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'entity_definitions'
      AND constraint_name = 'entity_definitions_progressionProfileId_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      DROP CONSTRAINT "entity_definitions_progressionProfileId_fkey";
  END IF;
END $$;

-- ─── Step 2: Drop old FK columns from entity_definitions ─────────────────────

ALTER TABLE "entity_definitions"
  DROP COLUMN IF EXISTS "bodySchemaId",
  DROP COLUMN IF EXISTS "equipmentSchemaId",
  DROP COLUMN IF EXISTS "progressionProfileId";

-- ─── Step 3: Drop orphaned tables ────────────────────────────────────────────

DROP TABLE IF EXISTS "trait_definitions";
DROP TABLE IF EXISTS "body_schemas";
DROP TABLE IF EXISTS "equipment_schemas";
DROP TABLE IF EXISTS "progression_profiles";

-- ─── Step 4: Add new columns to entity_definitions ───────────────────────────
-- Use IF NOT EXISTS so re-runs are safe.
-- Columns that Prisma marks NOT NULL but has no @default are added with a
-- temporary DEFAULT '{}' / '' so the ADD COLUMN succeeds on non-empty tables,
-- then the default is immediately dropped to match Prisma-generated DDL.

-- name TEXT NOT NULL (Prisma: String, no default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'name'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
    -- Drop the scaffolding default; Prisma schema has none.
    ALTER TABLE "entity_definitions"
      ALTER COLUMN "name" DROP DEFAULT;
  END IF;
END $$;

-- slots Json @default("{}")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'slots'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "slots" JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- equipmentSlots Json @default("{}")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'equipmentSlots'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "equipmentSlots" JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- traits Json @default("{}")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'traits'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "traits" JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- progression Json (NOT NULL, no schema default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'progression'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "progression" JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE "entity_definitions"
      ALTER COLUMN "progression" DROP DEFAULT;
  END IF;
END $$;

-- ascension Json (NOT NULL, no schema default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'ascension'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "ascension" JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE "entity_definitions"
      ALTER COLUMN "ascension" DROP DEFAULT;
  END IF;
END $$;

-- mastery Json (NOT NULL, no schema default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'mastery'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "mastery" JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE "entity_definitions"
      ALTER COLUMN "mastery" DROP DEFAULT;
  END IF;
END $$;

-- init Json (NOT NULL, no schema default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definitions'
      AND column_name = 'init'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "entity_definitions"
      ADD COLUMN "init" JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE "entity_definitions"
      ALTER COLUMN "init" DROP DEFAULT;
  END IF;
END $$;

-- ─── Step 5: speciesId index ─────────────────────────────────────────────────
-- Already exists on production; included here for completeness if run on a
-- fresh database that somehow skipped the original creation.

CREATE INDEX IF NOT EXISTS "entity_definitions_speciesId_idx"
  ON "entity_definitions"("speciesId");

COMMIT;
