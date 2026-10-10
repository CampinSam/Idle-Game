-- Additive alignment for schema objects missing from the historical chain.
-- This migration deliberately does not drop legacy columns/tables or relax
-- existing constraints. Nullable additions and additions with schema defaults
-- preserve existing rows.

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'DustingJob';

ALTER TABLE "boost_events"
    ADD COLUMN IF NOT EXISTS "percentBoost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "building_defs"
    ADD COLUMN IF NOT EXISTS "activeModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "category" TEXT,
    ADD COLUMN IF NOT EXISTS "completedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "failedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "iconKey" TEXT,
    ADD COLUMN IF NOT EXISTS "readyModalDefId" TEXT;

ALTER TABLE "entities"
    ADD COLUMN IF NOT EXISTS "ecosystemId" TEXT,
    ADD COLUMN IF NOT EXISTS "injuredUntilTick" INTEGER,
    ADD COLUMN IF NOT EXISTS "nftCollectionDefId" TEXT;

ALTER TABLE "gift_defs"
    ADD COLUMN IF NOT EXISTS "instant" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "modalDefId" TEXT;

ALTER TABLE "idempotency_keys"
    ADD COLUMN IF NOT EXISTS "commandType" TEXT NOT NULL DEFAULT '';

ALTER TABLE "jobs"
    ADD COLUMN IF NOT EXISTS "ecosystemId" TEXT;

ALTER TABLE "location_instances"
    ADD COLUMN IF NOT EXISTS "ecosystemId" TEXT;

ALTER TABLE "mission_defs"
    ADD COLUMN IF NOT EXISTS "activeModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "completedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "failedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "injuryRate" DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "injuryRecoveryTicks" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "readyModalDefId" TEXT;

ALTER TABLE "mission_defs"
    ALTER COLUMN "timer" SET DEFAULT '{"duration": 0, "skipable": false, "boostable": true, "skip_cost": [], "skip_type": "absolute"}';

ALTER TABLE "recipe_defs"
    ADD COLUMN IF NOT EXISTS "activeModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "completedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "failedModalDefId" TEXT,
    ADD COLUMN IF NOT EXISTS "readyModalDefId" TEXT;

ALTER TABLE "recipe_defs"
    ALTER COLUMN "cost" SET DEFAULT '[]',
    ALTER COLUMN "timer" SET DEFAULT '{"duration": 0, "skipable": false, "boostable": true, "skip_cost": [], "skip_type": "absolute"}';

ALTER TABLE "region_definitions"
    ADD COLUMN IF NOT EXISTS "accentColor" TEXT,
    ADD COLUMN IF NOT EXISTS "imageKey" TEXT;

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "ecosystemId" TEXT,
    ADD COLUMN IF NOT EXISTS "primaryLocationId" TEXT,
    ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

-- These player-owned/system tables were referenced by the current schema but
-- never created in the recorded migration chain.
CREATE TABLE IF NOT EXISTS "password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "player_deltas" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "patches" JSONB NOT NULL,
    "ui" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_deltas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "player_events" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "key" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "outbox" (
    "id" BIGSERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_resets_userId_idx"
    ON "password_resets"("userId");
CREATE INDEX IF NOT EXISTS "player_deltas_userId_id_idx"
    ON "player_deltas"("userId", "id");
CREATE INDEX IF NOT EXISTS "player_events_userId_eventType_idx"
    ON "player_events"("userId", "eventType");
CREATE INDEX IF NOT EXISTS "player_events_userId_createdAt_idx"
    ON "player_events"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "outbox_status_createdAt_idx"
    ON "outbox"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "entities_ecosystemId_idx"
    ON "entities"("ecosystemId");
CREATE INDEX IF NOT EXISTS "jobs_ecosystemId_idx"
    ON "jobs"("ecosystemId");
CREATE INDEX IF NOT EXISTS "location_instances_ecosystemId_idx"
    ON "location_instances"("ecosystemId");
CREATE INDEX IF NOT EXISTS "location_room_instances_buildingInstanceId_idx"
    ON "location_room_instances"("buildingInstanceId");
CREATE INDEX IF NOT EXISTS "quest_defs_category_enabled_idx"
    ON "quest_defs"("category", "enabled");
CREATE INDEX IF NOT EXISTS "seasons_status_idx" ON "seasons"("status");
CREATE INDEX IF NOT EXISTS "seasons_ecosystemId_idx" ON "seasons"("ecosystemId");
CREATE INDEX IF NOT EXISTS "seasons_startsAt_idx" ON "seasons"("startsAt");
CREATE INDEX IF NOT EXISTS "user_unlocks_userId_idx" ON "user_unlocks"("userId");
CREATE INDEX IF NOT EXISTS "users_ecosystemId_idx" ON "users"("ecosystemId");

-- Unique indexes are created only when existing data satisfies the key
-- constraint; an existing conflict is preserved and reported by schema diff.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_tokenHash_key')
       AND NOT EXISTS (
           SELECT 1 FROM "password_resets" GROUP BY "tokenHash" HAVING COUNT(*) > 1
       ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS "password_resets_tokenHash_key"
            ON "password_resets"("tokenHash");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_keys_userId_commandType_id_key')
       AND NOT EXISTS (
           SELECT 1 FROM "idempotency_keys"
           GROUP BY "userId", "commandType", "id" HAVING COUNT(*) > 1
       ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_userId_commandType_id_key"
            ON "idempotency_keys"("userId", "commandType", "id");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_userId_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "password_resets" pr
           LEFT JOIN "users" u ON u."id" = pr."userId"
           WHERE u."id" IS NULL
       ) THEN
        ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_deltas_userId_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "player_deltas" pd
           LEFT JOIN "users" u ON u."id" = pd."userId"
           WHERE u."id" IS NULL
       ) THEN
        ALTER TABLE "player_deltas" ADD CONSTRAINT "player_deltas_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_events_userId_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "player_events" pe
           LEFT JOIN "users" u ON u."id" = pe."userId"
           WHERE u."id" IS NULL
       ) THEN
        ALTER TABLE "player_events" ADD CONSTRAINT "player_events_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_author_id_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "content_drafts" d
           LEFT JOIN "admin_accounts" a ON a."id" = d."author_id"
           WHERE d."author_id" IS NOT NULL AND a."id" IS NULL
       ) THEN
        ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_author_id_fkey"
            FOREIGN KEY ("author_id") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_reviewer_id_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "content_drafts" d
           LEFT JOIN "admin_accounts" a ON a."id" = d."reviewer_id"
           WHERE d."reviewer_id" IS NOT NULL AND a."id" IS NULL
       ) THEN
        ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_reviewer_id_fkey"
            FOREIGN KEY ("reviewer_id") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_room_instances_buildingInstanceId_fkey')
       AND NOT EXISTS (
           SELECT 1 FROM "location_room_instances" r
           LEFT JOIN "location_building_instances" b ON b."id" = r."buildingInstanceId"
           WHERE r."buildingInstanceId" IS NOT NULL AND b."id" IS NULL
       ) THEN
        ALTER TABLE "location_room_instances" ADD CONSTRAINT "location_room_instances_buildingInstanceId_fkey"
            FOREIGN KEY ("buildingInstanceId") REFERENCES "location_building_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;