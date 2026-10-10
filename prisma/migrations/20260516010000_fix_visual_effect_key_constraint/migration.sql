-- Convert visual_effect_defs_key_key from a UNIQUE CONSTRAINT to a plain
-- UNIQUE INDEX so that the schema matches what Prisma generates for @unique.
--
-- Background: the original 20260503010000_add_tag_defs_and_visual_effects
-- migration intentionally added a named UNIQUE CONSTRAINT (not an index)
-- because a comment there claimed Replit's publish-time differ only
-- recognises FK targets when a UNIQUE CONSTRAINT exists. That turned out to
-- be wrong in practice: Replit's differ sees the CONSTRAINT in production and
-- the UNIQUE INDEX that Prisma would generate and emits:
--
--   ALTER TABLE "visual_effect_defs" DROP CONSTRAINT "visual_effect_defs_key_key";
--
-- which fails because tag_defs_effectKey_fkey depends on that constraint.
-- Replacing the constraint with a plain unique index matches Prisma's DDL
-- so the differ produces no statement for this object on the next publish.
--
-- The migration is idempotent: it uses DO $$ blocks to check existence before
-- acting, so it is safe to run on both dev (already has the index) and
-- production (has the constraint that needs replacing).

BEGIN;

-- 1. Drop the FK only if it exists (so this is safe to re-run)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tag_defs'
      AND constraint_name = 'tag_defs_effectKey_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE "tag_defs" DROP CONSTRAINT "tag_defs_effectKey_fkey";
  END IF;
END
$$;

-- 2. Drop the unique CONSTRAINT only if it exists (production state)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'visual_effect_defs'
      AND constraint_name = 'visual_effect_defs_key_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE "visual_effect_defs" DROP CONSTRAINT "visual_effect_defs_key_key";
  END IF;
END
$$;

-- 3. Create a plain unique index if it does not already exist (dev already has this)
CREATE UNIQUE INDEX IF NOT EXISTS "visual_effect_defs_key_key" ON "visual_effect_defs"("key");

-- 4. Re-add the FK if it was dropped (or never existed on dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tag_defs'
      AND constraint_name = 'tag_defs_effectKey_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE "tag_defs"
      ADD CONSTRAINT "tag_defs_effectKey_fkey"
      FOREIGN KEY ("effectKey") REFERENCES "visual_effect_defs"("key")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
