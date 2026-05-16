-- Rename legacy ItemRarity enum values to canonical tiers
-- Mappings:
--   SCARCE      → SCARE   (rename; all existing rows update automatically)
--   ADVANCED    → RARE    (merge; 1 row in prod as of 2026-05-16)
--   ULTRA_RARE  → EPIC    (merge; 0 rows in prod as of 2026-05-16)
--
-- This migration was applied to the DEV database manually on 2026-05-16.
-- For PRODUCTION run POST /admin/backfill/item-rarity BEFORE publishing so that:
--   1. SCARCE is renamed to SCARE in the enum type
--   2. ADVANCED rows are updated to RARE
--   3. ULTRA_RARE rows are updated to EPIC
-- Then publish the app; the Replit publish flow applies the remaining schema
-- changes (adds UNIQUE, removes ADVANCED / ULTRA_RARE enum values).
--
-- DEV verification (post-migration, 2026-05-16):
--   COMMON:9  UNCOMMON:9  SCARE:5  RARE:7  EPIC:1
--   enum values: COMMON UNCOMMON SCARE RARE EPIC MYTHIC LEGENDARY UNIQUE
--
-- PROD state (pre-publish, 2026-05-16):
--   COMMON:12 UNCOMMON:14 SCARCE:10 ADVANCED:1 RARE:10 EPIC:3 MYTHIC:2 LEGENDARY:1
--   item_instances affected: SCARCE:5 instances, ADVANCED:0 instances

BEGIN;

-- Step 1: Migrate ADVANCED → RARE (idempotent once value is removed)
UPDATE item_defs SET rarity = 'RARE' WHERE rarity::text = 'ADVANCED';

-- Step 2: Migrate ULTRA_RARE → EPIC (idempotent once value is removed)
UPDATE item_defs SET rarity = 'EPIC' WHERE rarity::text = 'ULTRA_RARE';

-- Step 3: Rebuild ItemRarity enum with canonical values
--   Adds:    SCARE, UNIQUE
--   Removes: SCARCE, ADVANCED, ULTRA_RARE
ALTER TYPE "ItemRarity" RENAME TO "ItemRarity_old";
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'SCARE', 'RARE', 'EPIC', 'MYTHIC', 'LEGENDARY', 'UNIQUE');

-- Step 4: Migrate column; remap SCARCE → SCARE during the cast
ALTER TABLE item_defs ALTER COLUMN rarity DROP DEFAULT;
ALTER TABLE item_defs ALTER COLUMN rarity TYPE "ItemRarity"
  USING CASE rarity::text
    WHEN 'SCARCE' THEN 'SCARE'::"ItemRarity"
    ELSE rarity::text::"ItemRarity"
  END;
ALTER TABLE item_defs ALTER COLUMN rarity SET DEFAULT 'COMMON'::"ItemRarity";

-- Step 5: Drop the old enum type
DROP TYPE "ItemRarity_old";

COMMIT;
