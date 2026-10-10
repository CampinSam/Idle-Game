-- Add dustingData column to item_defs (nullable JSON)
-- This column was added to the schema via db push in dev but never had a migration file.
ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "dustingData" JSONB;
