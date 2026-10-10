-- Re-apply the item rarity enum conversion that was recorded as applied in
-- _prisma_migrations (20260516000000_rename_item_rarity_values) but whose
-- SQL never actually executed on production. The production database still
-- has the original enum values (SCARCE, ADVANCED, ULTRA_RARE) and data rows
-- using those values, while the Prisma client was generated from the new
-- schema (SCARE, no ADVANCED/ULTRA_RARE). This mismatch causes the seed to
-- fail when it reads back existing rows.
--
-- Target mapping:
--   SCARCE     → SCARE   (rename)
--   ADVANCED   → RARE    (merge)
--   ULTRA_RARE → EPIC    (merge)
--
-- The migration is idempotent and schema-scoped. The DO $$ block checks
-- only the "public" schema's ItemRarity type for legacy values, so it is a
-- no-op on dev (public schema already has the correct enum) and corrective
-- on production (public schema still has the old enum).
--
-- NOTE: dev has an "integration_test" schema that still carries the old enum
-- values — this is intentional; we scope to "public" to avoid false positives.

BEGIN;

DO $$
DECLARE
  has_old_values BOOLEAN;
BEGIN
  -- Detect whether the PUBLIC schema's ItemRarity enum still has legacy values.
  SELECT EXISTS (
    SELECT 1
    FROM   pg_enum e
    JOIN   pg_type t ON t.oid = e.enumtypid
    JOIN   pg_namespace n ON t.typnamespace = n.oid
    WHERE  n.nspname    = 'public'
      AND  t.typname    = 'ItemRarity'
      AND  e.enumlabel IN ('SCARCE', 'ADVANCED', 'ULTRA_RARE')
  ) INTO has_old_values;

  IF NOT has_old_values THEN
    RAISE NOTICE 'ItemRarity enum already up to date — skipping.';
    RETURN;
  END IF;

  -- 1. Migrate data: ADVANCED → RARE
  UPDATE item_defs SET rarity = 'RARE'::"ItemRarity"  WHERE rarity::text = 'ADVANCED';

  -- 2. Migrate data: ULTRA_RARE → EPIC
  UPDATE item_defs SET rarity = 'EPIC'::"ItemRarity"  WHERE rarity::text = 'ULTRA_RARE';

  -- 3. Rebuild the enum type.
  --    DDL must use EXECUTE inside PL/pgSQL blocks.
  EXECUTE 'ALTER TYPE "ItemRarity" RENAME TO "ItemRarity_old"';
  EXECUTE $sql$
    CREATE TYPE "ItemRarity" AS ENUM (
      'COMMON', 'UNCOMMON', 'SCARE', 'RARE', 'EPIC', 'MYTHIC', 'LEGENDARY', 'UNIQUE'
    )
  $sql$;

  -- 4. Migrate the column to the new type; remap SCARCE → SCARE during cast.
  EXECUTE 'ALTER TABLE item_defs ALTER COLUMN rarity DROP DEFAULT';
  EXECUTE $sql$
    ALTER TABLE item_defs
      ALTER COLUMN rarity TYPE "ItemRarity"
      USING CASE rarity::text
        WHEN 'SCARCE' THEN 'SCARE'::"ItemRarity"
        ELSE rarity::text::"ItemRarity"
      END
  $sql$;
  EXECUTE $sql$
    ALTER TABLE item_defs
      ALTER COLUMN rarity SET DEFAULT 'COMMON'::"ItemRarity"
  $sql$;

  -- 5. Drop the now-unused old enum type.
  EXECUTE 'DROP TYPE "ItemRarity_old"';

  RAISE NOTICE 'ItemRarity enum conversion complete.';
END
$$;

COMMIT;
