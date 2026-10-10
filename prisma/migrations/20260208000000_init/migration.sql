-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('SOFT', 'HARD', 'PREMIUM', 'SEASONAL', 'EVENT', 'GUILD');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('MissionJob', 'CraftingJob', 'BuildingJob');

-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'SCARCE', 'ADVANCED', 'RARE', 'ULTRA_RARE', 'EPIC', 'MYTHIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('MATERIAL', 'POTION', 'CONSUMABLE', 'GEAR', 'QUEST');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('MISC', 'CRAFTING', 'COMBAT', 'EXPLORATION', 'QUEST_ITEMS', 'ENHANCEMENT');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "authProvider" TEXT,
    "providerId" TEXT,
    "walletAddress" TEXT,
    "keeperLevel" INTEGER NOT NULL DEFAULT 1,
    "keeperXp" BIGINT NOT NULL DEFAULT 0,
    "prestigeTokens" INTEGER NOT NULL DEFAULT 0,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "iconKey" TEXT,
    "type" "CurrencyType" NOT NULL,
    "seasonId" TEXT,
    "isTradeable" BOOLEAN NOT NULL DEFAULT false,
    "isSpendable" BOOLEAN NOT NULL DEFAULT true,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "cap" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_currency_balances" (
    "userId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_currency_balances_pkey" PRIMARY KEY ("userId","currencyId")
);

-- CreateTable
CREATE TABLE "currency_ledger" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_definitions" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "bodySchemaId" TEXT NOT NULL,
    "equipmentSchemaId" TEXT NOT NULL,
    "progressionProfileId" TEXT NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_schemas" (
    "id" TEXT NOT NULL,
    "slots" JSONB NOT NULL DEFAULT '[]',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progression_profiles" (
    "id" TEXT NOT NULL,
    "leveling" BOOLEAN NOT NULL DEFAULT true,
    "ascension" BOOLEAN NOT NULL DEFAULT true,
    "mastery" BOOLEAN NOT NULL DEFAULT true,
    "prestigeEligible" BOOLEAN NOT NULL DEFAULT true,
    "maxLevel" INTEGER NOT NULL DEFAULT 50,
    "ascensionCap" INTEGER NOT NULL DEFAULT 5,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progression_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_schemas" (
    "id" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trait_definitions" (
    "id" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "slotStats" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trait_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "nftAssetId" TEXT,
    "definitionId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'player_unit',
    "display" JSONB NOT NULL DEFAULT '{}',
    "progression" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "traits" JSONB NOT NULL DEFAULT '{}',
    "archetypeVector" JSONB NOT NULL DEFAULT '{}',
    "affinities" JSONB NOT NULL DEFAULT '{}',
    "state" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_equipment" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "itemInstanceId" TEXT NOT NULL,
    "slotClaims" JSONB NOT NULL DEFAULT '[]',
    "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_definitions" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "biome" TEXT,
    "modifiers" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_definitions" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'outpost_fungible',
    "regionId" TEXT,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "productionProfile" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_instances" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "nftAssetId" TEXT,
    "definitionId" TEXT NOT NULL,
    "regionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'outpost_fungible',
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "threatLevel" INTEGER NOT NULL DEFAULT 0,
    "corruptionLevel" INTEGER NOT NULL DEFAULT 0,
    "lastCollectionTick" BIGINT NOT NULL DEFAULT 0,
    "storage" JSONB NOT NULL DEFAULT '{}',
    "state" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_building_instances" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "buildingDefId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_building_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_room_instances" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "roomDefId" TEXT NOT NULL,
    "buildingInstanceId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_room_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_worker_assignments" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "roleTag" TEXT NOT NULL DEFAULT 'production',
    "bonus" JSONB NOT NULL DEFAULT '{}',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_worker_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "borderColor" TEXT,
    "backgroundImage" TEXT,
    "cardBackground" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "display_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_category_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "displayDefId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_category_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "group" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "minSuccessChance" INTEGER NOT NULL DEFAULT 0,
    "maxSuccessChance" INTEGER NOT NULL DEFAULT 100,
    "timer" JSONB NOT NULL DEFAULT '{"duration":0,"boostable":true,"skipable":false,"skip_cost":{},"skip_type":"absolute"}',
    "success" JSONB NOT NULL DEFAULT '{"rewards":[],"effects":[],"text":[]}',
    "failure" JSONB NOT NULL DEFAULT '{"rewards":[],"effects":[],"text":[]}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "rewardPreview" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayDefId" TEXT,
    "missionCategoryDefId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "group" TEXT,
    "cost" JSONB NOT NULL DEFAULT '{}',
    "timer" JSONB NOT NULL DEFAULT '{"duration":0,"boostable":true,"skipable":false,"skip_cost":{},"skip_type":"absolute"}',
    "requiredKeeperLevel" INTEGER NOT NULL DEFAULT 1,
    "rewards" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "effects" JSONB NOT NULL DEFAULT '[]',
    "visibilityRequirements" JSONB NOT NULL DEFAULT '[]',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "defId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "timer" JSONB NOT NULL DEFAULT '{}',
    "team" JSONB NOT NULL DEFAULT '[]',
    "results" JSONB,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tick_rate_intervals" (
    "id" TEXT NOT NULL,
    "ticksPerSecond" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effectiveFromTime" TIMESTAMP(3) NOT NULL,
    "effectiveFromTick" DOUBLE PRECISION NOT NULL,
    "boostEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tick_rate_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boost_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boost_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_defs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" "ItemType" NOT NULL,
    "rarity" "ItemRarity" NOT NULL DEFAULT 'COMMON',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "iconUrl" TEXT,
    "uiColor" TEXT,
    "category" "ItemCategory" NOT NULL DEFAULT 'MISC',
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "maxStack" INTEGER,
    "uniqueInstance" BOOLEAN NOT NULL DEFAULT false,
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "bindOnEquip" BOOLEAN NOT NULL DEFAULT false,
    "bindOnPickup" BOOLEAN NOT NULL DEFAULT false,
    "hasState" BOOLEAN NOT NULL DEFAULT false,
    "stateSchema" JSONB,
    "equipData" JSONB,
    "statModifiers" JSONB,
    "passiveEffects" JSONB,
    "consumableData" JSONB,
    "craftingData" JSONB,
    "data" JSONB,
    "seasonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB,
    "equippedToId" TEXT,
    "bound" BOOLEAN NOT NULL DEFAULT false,
    "tradeLocked" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_ledger" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" JSONB DEFAULT '{}',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "groupKey" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL DEFAULT 'system',
    "handlerKey" TEXT NOT NULL,
    "security" JSONB NOT NULL DEFAULT '{}',
    "inputSchema" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "presentation" JSONB NOT NULL DEFAULT '{}',
    "claimRules" JSONB NOT NULL DEFAULT '{}',
    "rewardSpec" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "giftDefId" TEXT NOT NULL,
    "giftDefVersion" INTEGER NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "snapshot" JSONB NOT NULL,
    "claim" JSONB,
    "claimTxId" TEXT,

    CONSTRAINT "gift_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_claim_txs" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "rolls" JSONB NOT NULL DEFAULT '[]',
    "grants" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_claim_txs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_authProvider_providerId_key" ON "users"("authProvider", "providerId");

-- CreateIndex
CREATE INDEX "user_currency_balances_currencyId_idx" ON "user_currency_balances"("currencyId");

-- CreateIndex
CREATE INDEX "user_currency_balances_userId_idx" ON "user_currency_balances"("userId");

-- CreateIndex
CREATE INDEX "currency_ledger_userId_createdAt_idx" ON "currency_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "currency_ledger_currencyId_createdAt_idx" ON "currency_ledger"("currencyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "entity_definitions_speciesId_idx" ON "entity_definitions"("speciesId");

-- CreateIndex
CREATE INDEX "trait_definitions_archetype_idx" ON "trait_definitions"("archetype");

-- CreateIndex
CREATE UNIQUE INDEX "entities_nftAssetId_key" ON "entities"("nftAssetId");

-- CreateIndex
CREATE INDEX "entities_ownerUserId_idx" ON "entities"("ownerUserId");

-- CreateIndex
CREATE INDEX "entities_speciesId_idx" ON "entities"("speciesId");

-- CreateIndex
CREATE INDEX "entities_definitionId_idx" ON "entities"("definitionId");

-- CreateIndex
CREATE INDEX "entity_equipment_entityId_idx" ON "entity_equipment"("entityId");

-- CreateIndex
CREATE INDEX "location_definitions_regionId_idx" ON "location_definitions"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "location_instances_nftAssetId_key" ON "location_instances"("nftAssetId");

-- CreateIndex
CREATE INDEX "location_instances_ownerUserId_idx" ON "location_instances"("ownerUserId");

-- CreateIndex
CREATE INDEX "location_instances_definitionId_idx" ON "location_instances"("definitionId");

-- CreateIndex
CREATE INDEX "location_building_instances_locationId_idx" ON "location_building_instances"("locationId");

-- CreateIndex
CREATE INDEX "location_building_instances_buildingDefId_idx" ON "location_building_instances"("buildingDefId");

-- CreateIndex
CREATE INDEX "location_room_instances_locationId_idx" ON "location_room_instances"("locationId");

-- CreateIndex
CREATE INDEX "location_room_instances_roomDefId_idx" ON "location_room_instances"("roomDefId");

-- CreateIndex
CREATE INDEX "location_worker_assignments_locationId_idx" ON "location_worker_assignments"("locationId");

-- CreateIndex
CREATE INDEX "location_worker_assignments_entityId_idx" ON "location_worker_assignments"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "location_worker_assignments_locationId_entityId_key" ON "location_worker_assignments"("locationId", "entityId");

-- CreateIndex
CREATE INDEX "idempotency_keys_userId_createdAt_idx" ON "idempotency_keys"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_userId_endpoint_id_key" ON "idempotency_keys"("userId", "endpoint", "id");

-- CreateIndex
CREATE INDEX "mission_defs_missionCategoryDefId_idx" ON "mission_defs"("missionCategoryDefId");

-- CreateIndex
CREATE INDEX "jobs_userId_idx" ON "jobs"("userId");

-- CreateIndex
CREATE INDEX "jobs_userId_type_status_idx" ON "jobs"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "jobs_defId_idx" ON "jobs"("defId");

-- CreateIndex
CREATE INDEX "tick_rate_intervals_effectiveFromTime_idx" ON "tick_rate_intervals"("effectiveFromTime");

-- CreateIndex
CREATE INDEX "boost_events_status_idx" ON "boost_events"("status");

-- CreateIndex
CREATE INDEX "boost_events_startTime_idx" ON "boost_events"("startTime");

-- CreateIndex
CREATE INDEX "item_defs_type_idx" ON "item_defs"("type");

-- CreateIndex
CREATE INDEX "item_defs_rarity_idx" ON "item_defs"("rarity");

-- CreateIndex
CREATE INDEX "item_defs_seasonId_idx" ON "item_defs"("seasonId");

-- CreateIndex
CREATE INDEX "item_instances_userId_idx" ON "item_instances"("userId");

-- CreateIndex
CREATE INDEX "item_instances_definitionId_idx" ON "item_instances"("definitionId");

-- CreateIndex
CREATE INDEX "item_instances_equippedToId_idx" ON "item_instances"("equippedToId");

-- CreateIndex
CREATE INDEX "item_ledger_userId_createdAt_idx" ON "item_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "item_ledger_itemId_createdAt_idx" ON "item_ledger"("itemId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_archivedAt_idx" ON "notifications"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_groupKey_idx" ON "notifications"("userId", "groupKey");

-- CreateIndex
CREATE INDEX "notifications_category_idx" ON "notifications"("category");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_sourceType_sourceId_type_key" ON "notifications"("userId", "sourceType", "sourceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "gift_instances_idempotencyKey_key" ON "gift_instances"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "gift_instances_claimTxId_key" ON "gift_instances"("claimTxId");

-- CreateIndex
CREATE INDEX "gift_instances_userId_status_idx" ON "gift_instances"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gift_claim_txs_giftId_key" ON "gift_claim_txs"("giftId");

-- CreateIndex
CREATE INDEX "gift_claim_txs_userId_idx" ON "gift_claim_txs"("userId");

-- AddForeignKey
ALTER TABLE "user_currency_balances" ADD CONSTRAINT "user_currency_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_currency_balances" ADD CONSTRAINT "user_currency_balances_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_definitions" ADD CONSTRAINT "entity_definitions_bodySchemaId_fkey" FOREIGN KEY ("bodySchemaId") REFERENCES "body_schemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_definitions" ADD CONSTRAINT "entity_definitions_equipmentSchemaId_fkey" FOREIGN KEY ("equipmentSchemaId") REFERENCES "equipment_schemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_definitions" ADD CONSTRAINT "entity_definitions_progressionProfileId_fkey" FOREIGN KEY ("progressionProfileId") REFERENCES "progression_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "entity_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_equipment" ADD CONSTRAINT "entity_equipment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_definitions" ADD CONSTRAINT "location_definitions_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_instances" ADD CONSTRAINT "location_instances_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_instances" ADD CONSTRAINT "location_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "location_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_building_instances" ADD CONSTRAINT "location_building_instances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_building_instances" ADD CONSTRAINT "location_building_instances_buildingDefId_fkey" FOREIGN KEY ("buildingDefId") REFERENCES "building_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_room_instances" ADD CONSTRAINT "location_room_instances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_room_instances" ADD CONSTRAINT "location_room_instances_roomDefId_fkey" FOREIGN KEY ("roomDefId") REFERENCES "room_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_worker_assignments" ADD CONSTRAINT "location_worker_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_worker_assignments" ADD CONSTRAINT "location_worker_assignments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_category_defs" ADD CONSTRAINT "mission_category_defs_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "mission_category_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_category_defs" ADD CONSTRAINT "mission_category_defs_displayDefId_fkey" FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_defs" ADD CONSTRAINT "mission_defs_displayDefId_fkey" FOREIGN KEY ("displayDefId") REFERENCES "display_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_defs" ADD CONSTRAINT "mission_defs_missionCategoryDefId_fkey" FOREIGN KEY ("missionCategoryDefId") REFERENCES "mission_category_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tick_rate_intervals" ADD CONSTRAINT "tick_rate_intervals_boostEventId_fkey" FOREIGN KEY ("boostEventId") REFERENCES "boost_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "item_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ledger" ADD CONSTRAINT "item_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ledger" ADD CONSTRAINT "item_ledger_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_instances" ADD CONSTRAINT "gift_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

