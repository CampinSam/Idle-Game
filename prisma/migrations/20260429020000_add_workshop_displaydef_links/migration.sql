-- Adds displayDefId FK columns to building_defs and recipe_defs so the Forge
-- can re-use the DisplayDef styling system introduced for missions in #107.

ALTER TABLE "building_defs" ADD COLUMN "displayDefId" TEXT;
ALTER TABLE "recipe_defs"   ADD COLUMN "displayDefId" TEXT;

ALTER TABLE "building_defs"
  ADD CONSTRAINT "building_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recipe_defs"
  ADD CONSTRAINT "recipe_defs_displayDefId_fkey"
  FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
