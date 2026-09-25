-- The UUID migration expects effectDefId, which was added to the model after
-- the historical table-creation migration but never recorded in the chain.
ALTER TABLE "global_active_powers"
    ADD COLUMN IF NOT EXISTS "effectDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "effectOverrides" JSONB,
    ADD COLUMN IF NOT EXISTS "selection" JSONB;

DO $$
DECLARE
    legacy_row_count BIGINT;
    legacy_column_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO legacy_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'global_active_powers'
      AND column_name IN ('powerType', 'value', 'valueMode');

    -- Modern databases no longer have the inline fields. A partially migrated
    -- table needs manual inspection rather than an unsafe automatic guess.
    IF legacy_column_count = 0 THEN
        RETURN;
    END IF;
    IF legacy_column_count <> 3 THEN
        RAISE EXCEPTION 'Cannot safely replay global_active_powers: only % of 3 legacy columns remain', legacy_column_count;
    END IF;

    SELECT COUNT(*) INTO legacy_row_count
    FROM "global_active_powers"
    WHERE "powerType" IS NOT NULL
       OR "value" IS NOT NULL
       OR "valueMode" IS NOT NULL;

    IF legacy_row_count > 0 THEN
        RAISE EXCEPTION 'Cannot safely replay global_active_powers effect-field migration: % rows contain legacy inline powerType/value/valueMode data; no automatic conversion is defined. Preserve and migrate these rows explicitly before retrying', legacy_row_count;
    END IF;
END $$;