-- AlterTable: add enabled to sound_defs
ALTER TABLE "sound_defs" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: add enabled and updatedAt to sound_mappings
ALTER TABLE "sound_mappings" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sound_mappings" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "sound_defs_enabled_idx" ON "sound_defs"("enabled");

-- CreateIndex
CREATE INDEX "sound_mappings_enabled_idx" ON "sound_mappings"("enabled");
