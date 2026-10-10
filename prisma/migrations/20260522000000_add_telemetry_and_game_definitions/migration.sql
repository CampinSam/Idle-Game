-- Migration: Add telemetry_defs, telemetry_counts, and game_definitions tables
-- Uses IF NOT EXISTS throughout — idempotent whether or not these tables were
-- previously created via `prisma db push` in any environment.

CREATE TABLE IF NOT EXISTS "telemetry_defs" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "subEvents"   JSONB NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_defs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "telemetry_defs_enabled_idx" ON "telemetry_defs"("enabled");

CREATE TABLE IF NOT EXISTS "telemetry_counts" (
    "telemetryDefId"    TEXT NOT NULL,
    "subEventKey"       TEXT NOT NULL,
    "count"             BIGINT NOT NULL DEFAULT 0,
    "lastIncrementedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_counts_pkey" PRIMARY KEY ("telemetryDefId", "subEventKey")
);

CREATE INDEX IF NOT EXISTS "telemetry_counts_telemetryDefId_idx" ON "telemetry_counts"("telemetryDefId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name   = 'telemetry_counts_telemetryDefId_fkey'
  ) THEN
    ALTER TABLE "telemetry_counts"
      ADD CONSTRAINT "telemetry_counts_telemetryDefId_fkey"
      FOREIGN KEY ("telemetryDefId")
      REFERENCES "telemetry_defs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "game_definitions" (
    "id"        TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "version"   INTEGER NOT NULL DEFAULT 1,
    "data"      JSONB NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT false,
    "startsAt"  TIMESTAMP(3),
    "endsAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_definitions_type_key_version_key"
    ON "game_definitions"("type", "key", "version");

CREATE INDEX IF NOT EXISTS "game_definitions_type_key_isActive_idx"
    ON "game_definitions"("type", "key", "isActive");
