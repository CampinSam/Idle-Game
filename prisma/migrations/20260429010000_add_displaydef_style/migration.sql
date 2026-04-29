-- Add per-DisplayDef CSS style overrides (overlay, background, title, body)
ALTER TABLE "display_defs" ADD COLUMN "style" JSONB NOT NULL DEFAULT '{}';
