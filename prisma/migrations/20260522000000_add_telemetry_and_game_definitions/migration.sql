-- Migration: Add telemetry_defs, telemetry_counts, and game_definitions tables
-- These were previously created via `prisma db push` in development but never
-- had a formal migration. This migration creates them in production.

-- TelemetryDef: named metric definitions with sub-event counters
CREATE TABLE "telemetry_defs" (
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

CREATE INDEX "telemetry_defs_enabled_idx" ON "telemetry_defs"("enabled");

-- TelemetryCount: running BigInt counter per (def, subEventKey)
CREATE TABLE "telemetry_counts" (
    "telemetryDefId"    TEXT NOT NULL,
    "subEventKey"       TEXT NOT NULL,
    "count"             BIGINT NOT NULL DEFAULT 0,
    "lastIncrementedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_counts_pkey" PRIMARY KEY ("telemetryDefId", "subEventKey")
);

CREATE INDEX "telemetry_counts_telemetryDefId_idx" ON "telemetry_counts"("telemetryDefId");

ALTER TABLE "telemetry_counts" ADD CONSTRAINT "telemetry_counts_telemetryDefId_fkey"
    FOREIGN KEY ("telemetryDefId")
    REFERENCES "telemetry_defs"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- GameDefinition: versioned JSON blobs for screen compositions and other
-- server-driven UI definitions (type + key + version uniquely identify a draft)
CREATE TABLE "game_definitions" (
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

CREATE UNIQUE INDEX "game_definitions_type_key_version_key"
    ON "game_definitions"("type", "key", "version");

CREATE INDEX "game_definitions_type_key_isActive_idx"
    ON "game_definitions"("type", "key", "isActive");
