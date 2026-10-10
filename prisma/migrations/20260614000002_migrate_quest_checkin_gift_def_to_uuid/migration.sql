-- ============================================================
-- Phase 1: Add uuid + key columns to the three def tables
-- ============================================================

-- Phase 1a: quest_defs
ALTER TABLE "quest_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "quest_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "quest_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "quest_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "quest_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "quest_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "quest_defs_uuid_key" ON "quest_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "quest_defs_key_key" ON "quest_defs"("key");

-- Phase 1b: checkin_defs
ALTER TABLE "checkin_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "checkin_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "checkin_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "checkin_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "checkin_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "checkin_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "checkin_defs_uuid_key" ON "checkin_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "checkin_defs_key_key" ON "checkin_defs"("key");

-- Phase 1c: gift_defs
ALTER TABLE "gift_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "gift_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "gift_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "gift_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "gift_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "gift_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "gift_defs_uuid_key" ON "gift_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "gift_defs_key_key" ON "gift_defs"("key");

-- ============================================================
-- Phase 2: Migrate FK/ref columns on instance tables slug → UUID
-- ============================================================

-- Phase 2a: quest_instances.questDefId
-- Drop the composite unique index before the column swap; it is recreated below.
DROP INDEX IF EXISTS "quest_instances_userId_questDefId_key";
ALTER TABLE "quest_instances" ADD COLUMN IF NOT EXISTS "questDefId_new" TEXT;
UPDATE "quest_instances" qi
  SET "questDefId_new" = qd."uuid"
  FROM "quest_defs" qd
  WHERE qd."id" = qi."questDefId";
-- FK integrity ensures every questDefId resolves; NOT NULL enforces that.
ALTER TABLE "quest_instances" ALTER COLUMN "questDefId_new" SET NOT NULL;
ALTER TABLE "quest_instances" DROP CONSTRAINT IF EXISTS "quest_instances_questDefId_fkey";
ALTER TABLE "quest_instances" DROP COLUMN "questDefId";
ALTER TABLE "quest_instances" RENAME COLUMN "questDefId_new" TO "questDefId";
CREATE UNIQUE INDEX "quest_instances_userId_questDefId_key" ON "quest_instances"("userId", "questDefId");

-- Phase 2b: checkin_instances.checkInDefId
DROP INDEX IF EXISTS "checkin_instances_userId_checkInDefId_key";
ALTER TABLE "checkin_instances" ADD COLUMN IF NOT EXISTS "checkInDefId_new" TEXT;
UPDATE "checkin_instances" ci
  SET "checkInDefId_new" = cd."uuid"
  FROM "checkin_defs" cd
  WHERE cd."id" = ci."checkInDefId";
ALTER TABLE "checkin_instances" ALTER COLUMN "checkInDefId_new" SET NOT NULL;
ALTER TABLE "checkin_instances" DROP CONSTRAINT IF EXISTS "checkin_instances_checkInDefId_fkey";
ALTER TABLE "checkin_instances" DROP COLUMN "checkInDefId";
ALTER TABLE "checkin_instances" RENAME COLUMN "checkInDefId_new" TO "checkInDefId";
CREATE UNIQUE INDEX "checkin_instances_userId_checkInDefId_key" ON "checkin_instances"("userId", "checkInDefId");

-- Phase 2c: gift_instances.giftDefId (soft ref — no FK constraint, nullable)
ALTER TABLE "gift_instances" ADD COLUMN IF NOT EXISTS "giftDefId_new" TEXT;
UPDATE "gift_instances" gi
  SET "giftDefId_new" = gd."uuid"
  FROM "gift_defs" gd
  WHERE gd."id" = gi."giftDefId";
-- giftDefId is nullable; unresolved soft refs (no matching gift_def) become NULL.
ALTER TABLE "gift_instances" DROP COLUMN "giftDefId";
ALTER TABLE "gift_instances" RENAME COLUMN "giftDefId_new" TO "giftDefId";

-- ============================================================
-- Phase 3: Swap PKs on def tables (uuid becomes new id, slug moves to key)
-- ============================================================

-- Phase 3a: quest_defs
DROP INDEX IF EXISTS "quest_defs_uuid_key";
ALTER TABLE "quest_defs" DROP CONSTRAINT "quest_defs_pkey";
ALTER TABLE "quest_defs" RENAME COLUMN "id" TO "_old_slug_id";
ALTER TABLE "quest_defs" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "quest_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "quest_defs" ADD CONSTRAINT "quest_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "quest_defs" DROP COLUMN "_old_slug_id";

-- Phase 3b: checkin_defs
DROP INDEX IF EXISTS "checkin_defs_uuid_key";
ALTER TABLE "checkin_defs" DROP CONSTRAINT "checkin_defs_pkey";
ALTER TABLE "checkin_defs" RENAME COLUMN "id" TO "_old_slug_id";
ALTER TABLE "checkin_defs" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "checkin_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "checkin_defs" ADD CONSTRAINT "checkin_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "checkin_defs" DROP COLUMN "_old_slug_id";

-- Phase 3c: gift_defs
DROP INDEX IF EXISTS "gift_defs_uuid_key";
ALTER TABLE "gift_defs" DROP CONSTRAINT "gift_defs_pkey";
ALTER TABLE "gift_defs" RENAME COLUMN "id" TO "_old_slug_id";
ALTER TABLE "gift_defs" RENAME COLUMN "uuid" TO "id";
ALTER TABLE "gift_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "gift_defs" ADD CONSTRAINT "gift_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "gift_defs" DROP COLUMN "_old_slug_id";

-- ============================================================
-- Phase 4: Restore FK constraints referencing new UUID PKs
-- ============================================================

ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_questDefId_fkey"
  FOREIGN KEY ("questDefId") REFERENCES "quest_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkin_instances" ADD CONSTRAINT "checkin_instances_checkInDefId_fkey"
  FOREIGN KEY ("checkInDefId") REFERENCES "checkin_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: gift_instances.giftDefId is a soft reference; no FK constraint is added.
