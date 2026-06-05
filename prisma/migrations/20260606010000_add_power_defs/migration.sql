-- CreateTable
CREATE TABLE "power_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "powerType" TEXT NOT NULL,
    "effectDefId" TEXT,
    "defaultValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultValueMode" TEXT NOT NULL DEFAULT 'percent_add',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultDailyLimit" INTEGER NOT NULL DEFAULT 1,
    "defaultScope" TEXT NOT NULL DEFAULT 'global',
    "selection" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "power_defs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "power_defs_enabled_idx" ON "power_defs"("enabled");

-- CreateIndex
CREATE INDEX "power_defs_powerType_idx" ON "power_defs"("powerType");

-- AddForeignKey
ALTER TABLE "power_defs" ADD CONSTRAINT "power_defs_effectDefId_fkey" FOREIGN KEY ("effectDefId") REFERENCES "effect_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
