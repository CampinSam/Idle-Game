-- CreateTable: visual_effect_defs (reusable across tags, item icons, entity art, etc.)
CREATE TABLE "visual_effect_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cssAnimation" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 1500,
    "easing" TEXT NOT NULL DEFAULT 'ease-in-out',
    "params" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_effect_defs_pkey" PRIMARY KEY ("id")
);

-- NOTE: Using a UNIQUE CONSTRAINT here instead of a plain unique index was a
-- mistake. The original intent was to satisfy Replit's publish-time schema
-- differ, which was believed to require a named UNIQUE CONSTRAINT (rather than
-- a bare UNIQUE INDEX) as the target of FK introspection. This turned out to be
-- incorrect. In practice the differ sees the CONSTRAINT in production and the
-- UNIQUE INDEX that Prisma generates for @unique and emits a spurious DROP
-- CONSTRAINT statement, which then fails because tag_defs_effectKey_fkey
-- depends on it. The correct approach is a plain unique index matching Prisma's
-- DDL. This was fixed in migration 20260516010000_fix_visual_effect_key_constraint.
ALTER TABLE "visual_effect_defs" ADD CONSTRAINT "visual_effect_defs_key_key" UNIQUE ("key");

-- CreateTable: tag_defs (visual contract for every named badge/pill/chip)
CREATE TABLE "tag_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'system',
    "color" TEXT NOT NULL DEFAULT '#ffffff',
    "backgroundColor" TEXT NOT NULL DEFAULT '#2a2a3a',
    "borderColor" TEXT NOT NULL DEFAULT '#3a3a4a',
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "fontSize" TEXT,
    "effectKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_defs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tag_defs_key_key" ON "tag_defs"("key");
CREATE INDEX "tag_defs_category_idx" ON "tag_defs"("category");
CREATE INDEX "tag_defs_effectKey_idx" ON "tag_defs"("effectKey");

ALTER TABLE "tag_defs" ADD CONSTRAINT "tag_defs_effectKey_fkey"
  FOREIGN KEY ("effectKey") REFERENCES "visual_effect_defs"("key")
  ON DELETE SET NULL ON UPDATE CASCADE;
