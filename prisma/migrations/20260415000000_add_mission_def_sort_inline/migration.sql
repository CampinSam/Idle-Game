-- Add sortOrder, inline, inlineLabel to MissionDef for hierarchy and inline pill support.
-- Also removes the obsolete category and type columns that are no longer in the schema.

ALTER TABLE "mission_defs" DROP COLUMN IF EXISTS "category";
ALTER TABLE "mission_defs" DROP COLUMN IF EXISTS "type";

ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "inline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "inlineLabel" TEXT;
