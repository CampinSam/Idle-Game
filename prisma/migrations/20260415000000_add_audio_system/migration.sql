-- CreateEnum
CREATE TYPE "AudioBus" AS ENUM ('music', 'sfx', 'ui', 'ambient');

-- CreateTable
CREATE TABLE "sound_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileKey" TEXT,
    "bus" "AudioBus" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sound_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sound_mappings" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "soundDefId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sound_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sound_defs_key_key" ON "sound_defs"("key");

-- CreateIndex
CREATE INDEX "sound_defs_bus_idx" ON "sound_defs"("bus");

-- CreateIndex
CREATE INDEX "sound_mappings_actionKey_idx" ON "sound_mappings"("actionKey");

-- CreateIndex
CREATE INDEX "sound_mappings_soundDefId_idx" ON "sound_mappings"("soundDefId");

-- AddForeignKey
ALTER TABLE "sound_mappings" ADD CONSTRAINT "sound_mappings_soundDefId_fkey" FOREIGN KEY ("soundDefId") REFERENCES "sound_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
