-- Generic data-driven home banner slot. Replaces the hardcoded season
-- banner with a list that supports announcements, sales, season info,
-- and events — rendered as a single card or a swipeable carousel.

CREATE TABLE IF NOT EXISTS "home_banner_defs" (
  "id"               TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "title"            TEXT         NOT NULL,
  "subtitle"         TEXT,
  "description"      TEXT,
  "backgroundImage"  TEXT,
  "ctaLabel"         TEXT,
  "ctaRoute"         TEXT,
  "priority"         INTEGER      NOT NULL DEFAULT 0,
  "startsAt"         TIMESTAMP(3),
  "endsAt"           TIMESTAMP(3),
  "status"           TEXT         NOT NULL DEFAULT 'active',
  "seasonId"         TEXT,
  "config"           JSONB        NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "home_banner_defs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "home_banner_defs_status_idx"   ON "home_banner_defs" ("status");
CREATE INDEX IF NOT EXISTS "home_banner_defs_startsAt_idx" ON "home_banner_defs" ("startsAt");
CREATE INDEX IF NOT EXISTS "home_banner_defs_endsAt_idx"   ON "home_banner_defs" ("endsAt");

ALTER TABLE "home_banner_defs"
  ADD CONSTRAINT "home_banner_defs_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "seasons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
