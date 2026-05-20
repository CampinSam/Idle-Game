-- Migration: Crafting rewards → tiers overhaul
-- Adds difficulty, tiers, multicraft to recipe_defs
-- Migrates legacy rewards JSON data to tiers.common.rewards

-- Ensure new columns exist
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "tiers"      JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "multicraft" JSONB;

-- Data migration: if legacy rewards column still exists, migrate it to tiers.common.rewards
-- then drop the old column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_defs' AND column_name = 'rewards'
  ) THEN
    -- Only migrate rows where tiers is still empty
    UPDATE "recipe_defs"
    SET "tiers" = jsonb_build_object(
      'common', jsonb_build_object('rewards', "rewards"::jsonb)
    )
    WHERE ("tiers" = '{}'::jsonb OR "tiers" IS NULL)
      AND "rewards" IS NOT NULL
      AND ("rewards")::jsonb != '[]'::jsonb;

    ALTER TABLE "recipe_defs" DROP COLUMN "rewards";
  END IF;
END$$;
