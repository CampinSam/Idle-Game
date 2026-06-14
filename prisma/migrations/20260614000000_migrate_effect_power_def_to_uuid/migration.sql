-- Phase 1a: Add uuid and key columns to effect_defs
-- uuid column holds a fresh UUID for each row; key backfills from the current slug id.
ALTER TABLE "effect_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "effect_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "effect_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "effect_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "effect_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "effect_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "effect_defs_uuid_key" ON "effect_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "effect_defs_key_key" ON "effect_defs"("key");

-- Phase 1b: Add uuid and key columns to power_defs
ALTER TABLE "power_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "power_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "power_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "power_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "power_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "power_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "power_defs_uuid_key" ON "power_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "power_defs_key_key" ON "power_defs"("key");

-- Phase 2a: Migrate active_effects.effectDefId (TEXT slug → UUID text)
ALTER TABLE "active_effects" ADD COLUMN IF NOT EXISTS "effectDefId_new" TEXT;
UPDATE "active_effects" ae
  SET "effectDefId_new" = ed."uuid"
  FROM "effect_defs" ed
  WHERE ed."id" = ae."effectDefId";
-- Orphaned rows (no matching effectDef) are cleaned up before enforcing NOT NULL.
DELETE FROM "active_effects" WHERE "effectDefId_new" IS NULL;
ALTER TABLE "active_effects" ALTER COLUMN "effectDefId_new" SET NOT NULL;
ALTER TABLE "active_effects" DROP CONSTRAINT IF EXISTS "active_effects_effectDefId_fkey";
ALTER TABLE "active_effects" DROP COLUMN "effectDefId";
ALTER TABLE "active_effects" RENAME COLUMN "effectDefId_new" TO "effectDefId";

-- Phase 2b: Migrate global_active_powers.effectDefId (nullable, slug → UUID)
ALTER TABLE "global_active_powers" ADD COLUMN IF NOT EXISTS "effectDefId_new" TEXT;
UPDATE "global_active_powers" gap
  SET "effectDefId_new" = ed."uuid"
  FROM "effect_defs" ed
  WHERE ed."id" = gap."effectDefId";
ALTER TABLE "global_active_powers" DROP CONSTRAINT IF EXISTS "global_active_powers_effectDefId_fkey";
ALTER TABLE "global_active_powers" DROP COLUMN "effectDefId";
ALTER TABLE "global_active_powers" RENAME COLUMN "effectDefId_new" TO "effectDefId";

-- Phase 2c: Migrate power_defs.effectDefId (nullable FK to effect_defs, slug → UUID)
ALTER TABLE "power_defs" ADD COLUMN IF NOT EXISTS "effectDefId_new" TEXT;
UPDATE "power_defs" pd
  SET "effectDefId_new" = ed."uuid"
  FROM "effect_defs" ed
  WHERE ed."id" = pd."effectDefId";
ALTER TABLE "power_defs" DROP CONSTRAINT IF EXISTS "power_defs_effectDefId_fkey";
ALTER TABLE "power_defs" DROP COLUMN "effectDefId";
ALTER TABLE "power_defs" RENAME COLUMN "effectDefId_new" TO "effectDefId";

-- Phase 3a: Swap PK on effect_defs (uuid becomes new id; old slug id dropped since key already holds it)
DROP INDEX IF EXISTS "effect_defs_uuid_key";
ALTER TABLE "effect_defs" DROP CONSTRAINT "effect_defs_pkey";
ALTER TABLE "effect_defs" RENAME COLUMN "id" TO "_old_slug_id";
ALTER TABLE "effect_defs" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "effect_defs" ADD CONSTRAINT "effect_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "effect_defs" DROP COLUMN "_old_slug_id";

-- Phase 3b: Swap PK on power_defs (uuid becomes new id; old slug id dropped since key already holds it)
DROP INDEX IF EXISTS "power_defs_uuid_key";
ALTER TABLE "power_defs" DROP CONSTRAINT "power_defs_pkey";
ALTER TABLE "power_defs" RENAME COLUMN "id" TO "_old_slug_id";
ALTER TABLE "power_defs" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "power_defs" ADD CONSTRAINT "power_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "power_defs" DROP COLUMN "_old_slug_id";

-- Phase 4: Restore FK constraints (now referencing the new UUID PKs)
ALTER TABLE "active_effects" ADD CONSTRAINT "active_effects_effectDefId_fkey"
  FOREIGN KEY ("effectDefId") REFERENCES "effect_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "global_active_powers" ADD CONSTRAINT "global_active_powers_effectDefId_fkey"
  FOREIGN KEY ("effectDefId") REFERENCES "effect_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "power_defs" ADD CONSTRAINT "power_defs_effectDefId_fkey"
  FOREIGN KEY ("effectDefId") REFERENCES "effect_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
