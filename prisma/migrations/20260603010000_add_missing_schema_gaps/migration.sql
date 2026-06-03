-- Migration: Add all schema columns/tables that exist in dev but are missing from production.
-- Covers: admin_accounts, mission_defs, shop_item_defs, shop_tab_defs,
--         shop_section_defs, shop_hero_defs, metric_snapshots.
-- All DDL uses IF NOT EXISTS / IF EXISTS for full idempotency.

-- 1. admin_accounts: add permission_flags_override
ALTER TABLE "admin_accounts"
  ADD COLUMN IF NOT EXISTS "permission_flags_override" JSONB NOT NULL DEFAULT '{}';

-- 2. mission_defs: add leadInModalDefId and tiers
ALTER TABLE "mission_defs"
  ADD COLUMN IF NOT EXISTS "leadInModalDefId" TEXT;
ALTER TABLE "mission_defs"
  ADD COLUMN IF NOT EXISTS "tiers" JSONB NOT NULL DEFAULT '{}';

-- 3. shop_item_defs: add sectionId and availableFrom
ALTER TABLE "shop_item_defs"
  ADD COLUMN IF NOT EXISTS "sectionId" TEXT;
ALTER TABLE "shop_item_defs"
  ADD COLUMN IF NOT EXISTS "availableFrom" TIMESTAMP(3);

-- 4. shop_tab_defs: create table (must come before shop_section_defs for FK)
CREATE TABLE IF NOT EXISTS "shop_tab_defs" (
  "id"                 TEXT         NOT NULL,
  "name"               TEXT         NOT NULL,
  "tabType"            TEXT         NOT NULL DEFAULT 'items',
  "layout"             TEXT         NOT NULL DEFAULT 'grid-2',
  "sortOrder"          INTEGER      NOT NULL DEFAULT 0,
  "enabled"            BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ungroupedPlacement" TEXT         NOT NULL DEFAULT 'before',
  CONSTRAINT "shop_tab_defs_pkey" PRIMARY KEY ("id")
);

-- 5. shop_section_defs: create table (FK → shop_tab_defs)
CREATE TABLE IF NOT EXISTS "shop_section_defs" (
  "id"        TEXT    NOT NULL,
  "tabId"     TEXT    NOT NULL,
  "label"     TEXT    NOT NULL,
  "subtitle"  TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "shop_section_defs_pkey" PRIMARY KEY ("id")
);
-- FK only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_section_defs_tabId_fkey'
  ) THEN
    ALTER TABLE "shop_section_defs"
      ADD CONSTRAINT "shop_section_defs_tabId_fkey"
      FOREIGN KEY ("tabId") REFERENCES "shop_tab_defs"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END$$;

-- 6. shop_hero_defs: create table
CREATE TABLE IF NOT EXISTS "shop_hero_defs" (
  "id"              TEXT         NOT NULL,
  "headline"        TEXT         NOT NULL,
  "subText"         TEXT,
  "imageUrl"        TEXT,
  "backgroundColor" TEXT,
  "ctaLabel"        TEXT,
  "ctaTarget"       TEXT,
  "sortOrder"       INTEGER      NOT NULL DEFAULT 0,
  "enabled"         BOOLEAN      NOT NULL DEFAULT true,
  "limitedUntil"    TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_hero_defs_pkey" PRIMARY KEY ("id")
);

-- 7. metric_snapshots: create table
CREATE TABLE IF NOT EXISTS "metric_snapshots" (
  "id"          TEXT             NOT NULL,
  "metric_name" TEXT             NOT NULL,
  "date"        TIMESTAMP(3)     NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL,
  "metadata"    JSONB,
  "created_at"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_metric_name_date_key"
  ON "metric_snapshots"("metric_name", "date");
CREATE INDEX IF NOT EXISTS "metric_snapshots_metric_name_date_idx"
  ON "metric_snapshots"("metric_name", "date" DESC);
