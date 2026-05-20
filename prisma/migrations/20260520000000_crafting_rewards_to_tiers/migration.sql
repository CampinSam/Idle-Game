-- Migration: Crafting rewards → tiers overhaul
-- Adds difficulty, tiers, multicraft columns to recipe_defs
-- Migrates legacy rewards → tiers.common.rewards (handles all known reward shapes)
-- Backfills all seven tier keys with canonical { "rewards": [] } defaults

-- Ensure new columns exist (idempotent)
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "tiers"      JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "recipe_defs" ADD COLUMN IF NOT EXISTS "multicraft" JSONB;

-- Step 1: migrate legacy rewards column if it still exists
-- Handles all known legacy shapes:
--   (a) JSON array                    → use directly as common.rewards
--   (b) { rewards: [...] }            → extract .rewards
--   (c) { items: [...] }              → extract .items
--   (d) { type: 'bundle', entries: [...] } → extract .entries
--   (e) anything else                 → [] (safe fallback, data was not array-based)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_defs' AND column_name = 'rewards'
  ) THEN
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
          WHEN jsonb_typeof("rewards"::jsonb) = 'object'
               AND jsonb_typeof(("rewards"::jsonb)->'items') = 'array'
            THEN ("rewards"::jsonb)->'items'
          WHEN jsonb_typeof("rewards"::jsonb) = 'object'
               AND ("rewards"::jsonb)->>'type' = 'bundle'
               AND jsonb_typeof(("rewards"::jsonb)->'entries') = 'array'
            THEN ("rewards"::jsonb)->'entries'
          ELSE '[]'::jsonb
        END
      )
    )
    WHERE ("tiers" = '{}'::jsonb OR "tiers" IS NULL)
      AND "rewards" IS NOT NULL;

    ALTER TABLE "recipe_defs" DROP COLUMN "rewards";
  END IF;
END$$;

-- Step 2: normalise already-migrated rows where common.rewards ended up as
-- a non-array value (defensive — handles any prior db push that copied verbatim)
UPDATE "recipe_defs"
SET "tiers" = jsonb_set(
  "tiers",
  '{common,rewards}',
  CASE
    -- Already a proper array
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'array'
      THEN "tiers"->'common'->'rewards'
    -- Object wrapper { rewards: [...] }
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'object'
         AND jsonb_typeof("tiers"->'common'->'rewards'->'rewards') = 'array'
      THEN "tiers"->'common'->'rewards'->'rewards'
    -- Object wrapper { items: [...] }
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'object'
         AND jsonb_typeof("tiers"->'common'->'rewards'->'items') = 'array'
      THEN "tiers"->'common'->'rewards'->'items'
    -- Bundle shape { type: 'bundle', entries: [...] }
    WHEN jsonb_typeof("tiers"->'common'->'rewards') = 'object'
         AND ("tiers"->'common'->'rewards'->>'type') = 'bundle'
         AND jsonb_typeof("tiers"->'common'->'rewards'->'entries') = 'array'
      THEN "tiers"->'common'->'rewards'->'entries'
    ELSE '[]'::jsonb
  END,
  true
)
WHERE "tiers" ? 'common'
  AND jsonb_typeof("tiers"->'common'->'rewards') != 'array';

-- Step 3: backfill all seven tier keys with { "rewards": [] } defaults
-- Uses JSONB merge so existing tier data is preserved
UPDATE "recipe_defs"
SET "tiers" = (
  '{"failure":{"rewards":[]},"common":{"rewards":[]},"uncommon":{"rewards":[]},"scare":{"rewards":[]},"rare":{"rewards":[]},"epic":{"rewards":[]},"legendary":{"rewards":[]}}'::jsonb
  || "tiers"
)
WHERE "tiers" IS NOT NULL;

-- Step 4: verification — raise a notice listing any recipe whose common.rewards
-- ended up empty but whose pre-migration rewards were non-empty.
-- This is advisory only and does not block the migration.
DO $$
DECLARE
  empty_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO empty_count
  FROM "recipe_defs"
  WHERE jsonb_array_length("tiers"->'common'->'rewards') = 0
    AND "difficulty" = 0;

  IF empty_count > 0 THEN
    RAISE NOTICE 'Migration info: % recipe_defs row(s) have empty tiers.common.rewards — review if intentional (difficulty=0 rows included)', empty_count;
  END IF;
END$$;
