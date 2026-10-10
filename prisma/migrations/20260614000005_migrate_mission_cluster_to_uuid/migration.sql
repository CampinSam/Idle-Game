-- ============================================================
-- UUID Phase 1 — Mission cluster
-- MissionCategoryDef, MissionDef, RecipeDef
-- ============================================================
-- Order: drop all FKs that reference mission_category_defs.id first
-- (both self-ref parentId and mission_defs FK), then swap PK,
-- then backfill child FK columns, then restore constraints.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Phase 1: mission_category_defs — add uuid + key
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "mission_category_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "mission_category_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "mission_category_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "mission_category_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "mission_category_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "mission_category_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mission_category_defs_uuid_key" ON "mission_category_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "mission_category_defs_key_key"  ON "mission_category_defs"("key");

-- ── Build parentId shadow before dropping self-ref FK ──
ALTER TABLE "mission_category_defs" ADD COLUMN IF NOT EXISTS "parentId_new" TEXT;
UPDATE "mission_category_defs" child
  SET "parentId_new" = parent."uuid"
  FROM "mission_category_defs" parent
  WHERE parent."id" = child."parentId";

-- ── Drop ALL FKs that reference mission_category_defs.id before PK swap ──
-- (self-ref parentId FK AND the mission_defs child FK both depend on the PK)
ALTER TABLE "mission_category_defs" DROP CONSTRAINT IF EXISTS "mission_category_defs_parentId_fkey";
ALTER TABLE "mission_defs" DROP CONSTRAINT IF EXISTS "mission_defs_missionCategoryDefId_fkey";
DROP INDEX IF EXISTS "mission_defs_missionCategoryDefId_idx";

-- ── Swap mission_category_defs PK: id ← uuid ──
ALTER TABLE "mission_category_defs" DROP CONSTRAINT "mission_category_defs_pkey";
ALTER TABLE "mission_category_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "mission_category_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "mission_category_defs" SET "id" = "uuid";
ALTER TABLE "mission_category_defs" ALTER COLUMN "id" SET NOT NULL;
DROP INDEX IF EXISTS "mission_category_defs_uuid_key";
ALTER TABLE "mission_category_defs" DROP COLUMN "uuid";
ALTER TABLE "mission_category_defs" ADD CONSTRAINT "mission_category_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "mission_category_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Migrate parentId: drop slug column, rename shadow ──
ALTER TABLE "mission_category_defs" DROP COLUMN "parentId";
ALTER TABLE "mission_category_defs" RENAME COLUMN "parentId_new" TO "parentId";

-- ── Re-add self-referential FK ──
ALTER TABLE "mission_category_defs"
  ADD CONSTRAINT "mission_category_defs_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "mission_category_defs"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- Phase 2: mission_defs — add uuid + key
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "mission_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "mission_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "mission_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "mission_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mission_defs_uuid_key" ON "mission_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "mission_defs_key_key"  ON "mission_defs"("key");

-- ── Backfill missionCategoryDefId slug → UUID ──
-- mission_category_defs.id is now UUID; join on key (the old slug value).
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "missionCategoryDefId_new" TEXT;
UPDATE "mission_defs" md
  SET "missionCategoryDefId_new" = mc."id"
  FROM "mission_category_defs" mc
  WHERE mc."key" = md."missionCategoryDefId";

-- ── Swap missionCategoryDefId: drop old column, rename shadow ──
ALTER TABLE "mission_defs" DROP COLUMN "missionCategoryDefId";
ALTER TABLE "mission_defs" RENAME COLUMN "missionCategoryDefId_new" TO "missionCategoryDefId";

-- ── Swap mission_defs PK ──
ALTER TABLE "mission_defs" DROP CONSTRAINT "mission_defs_pkey";
ALTER TABLE "mission_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "mission_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "mission_defs" SET "id" = "uuid";
ALTER TABLE "mission_defs" ALTER COLUMN "id" SET NOT NULL;
DROP INDEX IF EXISTS "mission_defs_uuid_key";
ALTER TABLE "mission_defs" DROP COLUMN "uuid";
ALTER TABLE "mission_defs" ADD CONSTRAINT "mission_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "mission_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore index + FK on mission_defs ──
CREATE INDEX IF NOT EXISTS "mission_defs_missionCategoryDefId_idx" ON "mission_defs"("missionCategoryDefId");
ALTER TABLE "mission_defs"
  ADD CONSTRAINT "mission_defs_missionCategoryDefId_fkey"
  FOREIGN KEY ("missionCategoryDefId") REFERENCES "mission_category_defs"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- Phase 3: recipe_defs — add uuid + key (no FK child columns)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "recipe_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "recipe_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "recipe_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "recipe_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_defs_uuid_key" ON "recipe_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_defs_key_key"  ON "recipe_defs"("key");

-- ── Swap recipe_defs PK ──
ALTER TABLE "recipe_defs" DROP CONSTRAINT "recipe_defs_pkey";
ALTER TABLE "recipe_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "recipe_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "recipe_defs" SET "id" = "uuid";
ALTER TABLE "recipe_defs" ALTER COLUMN "id" SET NOT NULL;
DROP INDEX IF EXISTS "recipe_defs_uuid_key";
ALTER TABLE "recipe_defs" DROP COLUMN "uuid";
ALTER TABLE "recipe_defs" ADD CONSTRAINT "recipe_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "recipe_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
