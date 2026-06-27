-- DropIndex
DROP INDEX "entity_power_usages_entityId_powerKey_key";

-- DropIndex
DROP INDEX "location_power_usages_locationInstanceId_powerKey_key";

-- AlterTable
ALTER TABLE "entity_power_usages" DROP COLUMN "lastUsedUtcDay",
DROP COLUMN "powerKey",
DROP COLUMN "usageCount",
ADD COLUMN     "chargeUnits" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "lastChargeAppliedAt" BIGINT,
ADD COLUMN     "powerGrantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "location_power_usages" DROP COLUMN "lastUsedUtcDay",
DROP COLUMN "powerKey",
DROP COLUMN "usageCount",
ADD COLUMN     "chargeUnits" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "lastChargeAppliedAt" BIGINT,
ADD COLUMN     "powerGrantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "power_defs" DROP COLUMN "defaultDailyLimit",
ADD COLUMN     "chargeConfig" JSONB;

-- CreateTable
CREATE TABLE "power_grants" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "powerKey" TEXT NOT NULL,
    "powerDefId" TEXT,
    "overrides" JSONB,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "remainingChargeUnits" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "power_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_use_events" (
    "id" TEXT NOT NULL,
    "powerGrantId" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "triggeredAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "power_use_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "power_grants_targetType_targetId_idx" ON "power_grants"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "power_grants_targetId_idx" ON "power_grants"("targetId");

-- CreateIndex
CREATE INDEX "power_grants_expiresAt_idx" ON "power_grants"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "power_grants_targetType_targetId_powerKey_sourceType_source_key" ON "power_grants"("targetType", "targetId", "powerKey", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "power_use_events_powerGrantId_triggeredAtTick_idx" ON "power_use_events"("powerGrantId", "triggeredAtTick");

-- CreateIndex
CREATE UNIQUE INDEX "entity_power_usages_powerGrantId_key" ON "entity_power_usages"("powerGrantId");

-- CreateIndex
CREATE UNIQUE INDEX "location_power_usages_powerGrantId_key" ON "location_power_usages"("powerGrantId");

-- AddForeignKey
ALTER TABLE "power_grants" ADD CONSTRAINT "power_grants_powerDefId_fkey" FOREIGN KEY ("powerDefId") REFERENCES "power_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_use_events" ADD CONSTRAINT "power_use_events_powerGrantId_fkey" FOREIGN KEY ("powerGrantId") REFERENCES "power_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_power_usages" ADD CONSTRAINT "location_power_usages_powerGrantId_fkey" FOREIGN KEY ("powerGrantId") REFERENCES "power_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_power_usages" ADD CONSTRAINT "entity_power_usages_powerGrantId_fkey" FOREIGN KEY ("powerGrantId") REFERENCES "power_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
