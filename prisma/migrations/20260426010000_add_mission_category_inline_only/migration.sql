-- Add inlineOnly flag to MissionCategoryDef. When true, the category is treated as a leaf
-- and players can only launch its missions via inline pills on the parent category card.

ALTER TABLE "mission_category_defs" ADD COLUMN IF NOT EXISTS "inlineOnly" BOOLEAN NOT NULL DEFAULT false;
