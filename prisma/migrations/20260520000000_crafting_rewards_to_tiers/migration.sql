-- Migration: Crafting rewards → tiers overhaul
-- Adds difficulty, tiers, multicraft columns to recipe_defs
-- Migrates legacy rewards → tiers.common.rewards (handles array and object shapes)
-- Backfills all seven tier keys with canonical { "rewards": [] } defaults

-- Ensure new columns exist (idempotent)
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "tiers"      JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "multicraft" JSONB;

-- Step 1: migrate legacy rewards column if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_defs' AND column_name = 'rewards'
  ) THEN
    -- Migrate rows where tiers is still empty
    -- Handle three legacy shapes:
    --   (a) rewards is a JSON array  → use directly as common.rewards
    --   (b) rewards is an object with a "rewards" key → extract .rewards array
    --   (c) anything else            → treat as empty array
    UPDATE "recipe_defs"
    SET "tiers" = jsonb_build_object(
      'common', jsonb_build_object(
        'rewards',
        CASE
          WHEN jsonb_typeof("rewards"::jsonb) = 'array'
            THEN "rewards"::jsonb
          WHEN jsonb_typeof("rewards"::jsonb) = 'object'
               AND jsonb_typeof(("rewards"::jsonb)->'rewards') = 'array'
            THEN ("rewards"::jsonb)->'rewards'
          ELSE '[]'::jsonb
        END
      )
    )
    WHERE ("tiers" = '{}'::jsonb OR "tiers" IS NULL)
      AND "rewards" IS NOT NULL;

    ALTER TABLE "recipe_defs" DROP COLUMN "rewards";
  END IF;
END$$;

-- Step 2: normalise any already-migrated tiers where common.rewards ended up as
-- a non-array (object/null) due to prior migrations using a simpler copy
UPDATE "recipe_defs"
SET "tiers" = jsonb_set(
  "tiers",
  '{common,rewards}',
  CASE
    WHEN jsonb_typeof(("tiers"->'common'->>'rewards')::jsonb) = 'array'
      THEN ("tiers"->'common'->>'rewards')::jsonb
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'array'
      THEN "tiers"->'common'->'rewards'
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'object'
         AND jsonb_typeof("tiers"->'common'->'rewards'->'rewards') = 'array'
      THEN "tiers"->'common'->'rewards'->'rewards'
    ELSE '[]'::jsonb
  END
)
WHERE "tiers" ? 'common'
  AND jsonb_typeof("tiers"->'common'->'rewards') != 'array';

-- Step 3: backfill all seven tier keys with { "rewards": [] } defaults
-- so every recipe row has a fully populated tiers object
UPDATE "recipe_defs"
SET "tiers" = (
  '{"failure":{"rewards":[]},"common":{"rewards":[]},"uncommon":{"rewards":[]},"scare":{"rewards":[]},"rare":{"rewards":[]},"epic":{"rewards":[]},"legendary":{"rewards":[]}}'::jsonb
  || "tiers"
)
WHERE "tiers" IS NOT NULL;
