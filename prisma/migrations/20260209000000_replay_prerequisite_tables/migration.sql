-- The historical chain alters these tables but never creates them.
-- Keep this migration additive: existing deployments with these tables are
-- left untouched, while a clean replay gets the prerequisite structures.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchasePaymentMethod') THEN
        CREATE TYPE "PurchasePaymentMethod" AS ENUM ('STRIPE', 'CRYPTO_EVM', 'CRYPTO_CARDANO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseStatus') THEN
        CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "quest_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "rewardSpec" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permanentEffectSpec" JSONB,
    "tier" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "quest_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "quest_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questDefId" TEXT NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    CONSTRAINT "quest_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "checkin_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rewards" JSONB NOT NULL DEFAULT '[]',
    "cycleLength" INTEGER NOT NULL DEFAULT 7,
    "requireStreak" BOOLEAN NOT NULL DEFAULT false,
    "allowReclaim" BOOLEAN NOT NULL DEFAULT false,
    "frequency" JSONB NOT NULL DEFAULT '{"type": "daily"}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkin_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "checkin_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkInDefId" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastClaimedAt" TIMESTAMP(3),
    "totalClaimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkin_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ecosystemId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nft_collection_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "entityDefinitionId" TEXT NOT NULL,
    "mintMode" TEXT NOT NULL DEFAULT 'one_per_token',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nft_collection_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "gemAmount" INTEGER NOT NULL,
    "paymentMethod" "PurchasePaymentMethod" NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "chain" TEXT,
    "destinationAddress" TEXT,
    "amountExpected" BIGINT,
    "txHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "shop_item_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tab" TEXT NOT NULL DEFAULT 'featured',
    "cost" JSONB NOT NULL,
    "originalCost" JSONB,
    "contents" JSONB NOT NULL,
    "badge" TEXT,
    "badgeColor" TEXT,
    "imageUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limitedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shop_item_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "effect_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "category" TEXT NOT NULL,
    "valueMode" TEXT NOT NULL,
    "durationModel" TEXT NOT NULL,
    "stackingRule" TEXT NOT NULL DEFAULT 'no_stack',
    "targetType" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "stats" JSONB,
    "trait" TEXT,
    "durationSec" INTEGER,
    "durationTicks" INTEGER,
    "maxStacks" INTEGER,
    "maxUses" INTEGER,
    "cap" DOUBLE PRECISION,
    "resourceId" TEXT,
    "sessionType" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "effect_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "linked_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "linked_wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wallet_nonces" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_nonces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "active_effects" (
    "id" TEXT NOT NULL,
    "effectDefId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "valueMode" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stats" JSONB,
    "trait" TEXT,
    "currentStacks" INTEGER NOT NULL DEFAULT 1,
    "remainingUses" INTEGER,
    "sessionType" TEXT,
    "sessionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expiresAtTick" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "active_effects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "lootbox_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "iconKey" TEXT,
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "rollCount" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lootbox_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "modal_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "modal_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "location_power_usages" (
    "id" TEXT NOT NULL,
    "locationInstanceId" TEXT NOT NULL,
    "powerKey" TEXT NOT NULL,
    "lastUsedUtcDay" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "location_power_usages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "lootboxDefId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bonusOutpostSlots" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "effect_defs_category_idx" ON "effect_defs"("category");
CREATE INDEX IF NOT EXISTS "effect_defs_targetType_idx" ON "effect_defs"("targetType");
CREATE INDEX IF NOT EXISTS "linked_wallets_userId_idx" ON "linked_wallets"("userId");
CREATE INDEX IF NOT EXISTS "active_effects_userId_targetType_targetId_idx"
    ON "active_effects"("userId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "active_effects_userId_category_idx"
    ON "active_effects"("userId", "category");
CREATE INDEX IF NOT EXISTS "active_effects_targetType_targetId_idx"
    ON "active_effects"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "active_effects_expiresAt_idx" ON "active_effects"("expiresAt");
CREATE INDEX IF NOT EXISTS "active_effects_sessionType_sessionId_idx"
    ON "active_effects"("sessionType", "sessionId");
CREATE INDEX IF NOT EXISTS "location_power_usages_locationInstanceId_idx"
    ON "location_power_usages"("locationInstanceId");
CREATE INDEX IF NOT EXISTS "purchases_userId_idx" ON "purchases"("userId");
CREATE INDEX IF NOT EXISTS "purchases_status_paymentMethod_idx"
    ON "purchases"("status", "paymentMethod");
CREATE INDEX IF NOT EXISTS "purchases_stripeSessionId_idx"
    ON "purchases"("stripeSessionId");

CREATE INDEX IF NOT EXISTS "quest_instances_userId_status_idx"
    ON "quest_instances"("userId", "status");
CREATE INDEX IF NOT EXISTS "checkin_instances_userId_idx"
    ON "checkin_instances"("userId");

DO $$
DECLARE
    duplicate_count BIGINT;
    orphan_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "nft_collection_defs"
        GROUP BY "chain", "collectionId" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create nft_collection_defs_chain_collectionId_key: % duplicate (chain, collectionId) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "nft_collection_defs_chain_collectionId_key"
        ON "nft_collection_defs"("chain", "collectionId");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "linked_wallets"
        GROUP BY "chain", "address" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create linked_wallets_chain_address_key: % duplicate (chain, address) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "linked_wallets_chain_address_key"
        ON "linked_wallets"("chain", "address");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "wallet_nonces"
        GROUP BY "chain", "address" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create wallet_nonces_chain_address_key: % duplicate (chain, address) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_nonces_chain_address_key"
        ON "wallet_nonces"("chain", "address");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "location_power_usages"
        GROUP BY "locationInstanceId", "powerKey" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create location_power_usages_locationInstanceId_powerKey_key: % duplicate (locationInstanceId, powerKey) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "location_power_usages_locationInstanceId_powerKey_key"
        ON "location_power_usages"("locationInstanceId", "powerKey");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "purchases"
        WHERE "stripeSessionId" IS NOT NULL
        GROUP BY "stripeSessionId" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create purchases_stripeSessionId_key: % duplicate non-null stripeSessionId groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "purchases_stripeSessionId_key"
        ON "purchases"("stripeSessionId");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "purchases"
        WHERE "txHash" IS NOT NULL
        GROUP BY "txHash" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create purchases_txHash_key: % duplicate non-null txHash groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "purchases_txHash_key"
        ON "purchases"("txHash");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "quest_instances"
        GROUP BY "userId", "questDefId" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create quest_instances_userId_questDefId_key: % duplicate (userId, questDefId) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "quest_instances_userId_questDefId_key"
        ON "quest_instances"("userId", "questDefId");

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT 1 FROM "checkin_instances"
        GROUP BY "userId", "checkInDefId" HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot create checkin_instances_userId_checkInDefId_key: % duplicate (userId, checkInDefId) groups exist; resolve them before retrying this migration', duplicate_count;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS "checkin_instances_userId_checkInDefId_key"
        ON "checkin_instances"("userId", "checkInDefId");

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quest_instances_userId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "quest_instances" qi LEFT JOIN "users" u ON u."id" = qi."userId"
        WHERE u."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add quest_instances_userId_fkey: % quest instance rows reference missing users; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quest_instances_questDefId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "quest_instances" qi LEFT JOIN "quest_defs" qd ON qd."id" = qi."questDefId"
        WHERE qd."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add quest_instances_questDefId_fkey: % quest instance rows reference missing quest definitions; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_questDefId_fkey"
            FOREIGN KEY ("questDefId") REFERENCES "quest_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkin_instances_userId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "checkin_instances" ci LEFT JOIN "users" u ON u."id" = ci."userId"
        WHERE u."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add checkin_instances_userId_fkey: % check-in instance rows reference missing users; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "checkin_instances" ADD CONSTRAINT "checkin_instances_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkin_instances_checkInDefId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "checkin_instances" ci LEFT JOIN "checkin_defs" cd ON cd."id" = ci."checkInDefId"
        WHERE cd."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add checkin_instances_checkInDefId_fkey: % check-in instance rows reference missing definitions; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "checkin_instances" ADD CONSTRAINT "checkin_instances_checkInDefId_fkey"
            FOREIGN KEY ("checkInDefId") REFERENCES "checkin_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_userId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "purchases" p LEFT JOIN "users" u ON u."id" = p."userId"
        WHERE u."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add purchases_userId_fkey: % purchase rows reference missing users; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'linked_wallets_userId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "linked_wallets" lw LEFT JOIN "users" u ON u."id" = lw."userId"
        WHERE u."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add linked_wallets_userId_fkey: % linked wallet rows reference missing users; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "linked_wallets" ADD CONSTRAINT "linked_wallets_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_effects_userId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "active_effects" ae LEFT JOIN "users" u ON u."id" = ae."userId"
        WHERE u."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add active_effects_userId_fkey: % active effect rows reference missing users; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "active_effects" ADD CONSTRAINT "active_effects_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_effects_effectDefId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "active_effects" ae LEFT JOIN "effect_defs" ed ON ed."id" = ae."effectDefId"
        WHERE ed."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add active_effects_effectDefId_fkey: % active effect rows reference missing effect definitions; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "active_effects" ADD CONSTRAINT "active_effects_effectDefId_fkey"
            FOREIGN KEY ("effectDefId") REFERENCES "effect_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_power_usages_locationInstanceId_fkey') THEN
        SELECT COUNT(*) INTO orphan_count
        FROM "location_power_usages" lpu LEFT JOIN "location_instances" li ON li."id" = lpu."locationInstanceId"
        WHERE li."id" IS NULL;
        IF orphan_count > 0 THEN
            RAISE EXCEPTION 'Cannot add location_power_usages_locationInstanceId_fkey: % usage rows reference missing locations; repair them before retrying this migration', orphan_count;
        END IF;
        ALTER TABLE "location_power_usages" ADD CONSTRAINT "location_power_usages_locationInstanceId_fkey"
            FOREIGN KEY ("locationInstanceId") REFERENCES "location_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;