-- CreateTable: EntityPowerUsage
-- Tracks per-(entity-id, power-key) daily usage for unique NFT entity powers.
-- Mirrors location_power_usages with the same UTC-day gate and daily limit enforcement.
CREATE TABLE "entity_power_usages" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "powerKey" TEXT NOT NULL,
    "lastUsedUtcDay" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "entity_power_usages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "entity_power_usages" ADD CONSTRAINT "entity_power_usages_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "entity_power_usages_entityId_powerKey_key" ON "entity_power_usages"("entityId", "powerKey");

-- CreateIndex
CREATE INDEX "entity_power_usages_entityId_idx" ON "entity_power_usages"("entityId");
