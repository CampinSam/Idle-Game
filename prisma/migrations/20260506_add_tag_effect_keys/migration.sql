-- Add multi-effect support: a TagDef can stack multiple visual effects.
-- Existing single `effectKey` stays for backwards compat; if both are set
-- `effectKeys` wins.
ALTER TABLE "tag_defs"
  ADD COLUMN "effectKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
