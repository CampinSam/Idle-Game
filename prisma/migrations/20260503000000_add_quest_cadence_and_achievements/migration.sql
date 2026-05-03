-- AlterTable: QuestDef gains cadence
ALTER TABLE "quest_defs" ADD COLUMN "cadence" TEXT NOT NULL DEFAULT 'oneoff';

-- AlterTable: QuestInstance tracks current cadence window
ALTER TABLE "quest_instances" ADD COLUMN "windowStartedAt" TIMESTAMP(3);

-- CreateIndex on QuestDef cadence
CREATE INDEX "quest_defs_cadence_enabled_idx" ON "quest_defs"("cadence", "enabled");

-- CreateTable: AchievementDef
CREATE TABLE "achievement_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "rewardSpec" JSONB NOT NULL DEFAULT '{}',
    "permanentEffectSpec" JSONB,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievement_defs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "achievement_defs_category_tier_idx" ON "achievement_defs"("category", "tier");

-- CreateTable: AchievementInstance
CREATE TABLE "achievement_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementDefId" TEXT NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "achievement_instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "achievement_instances_userId_achievementDefId_key" ON "achievement_instances"("userId", "achievementDefId");
CREATE INDEX "achievement_instances_userId_status_idx" ON "achievement_instances"("userId", "status");

ALTER TABLE "achievement_instances" ADD CONSTRAINT "achievement_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement_instances" ADD CONSTRAINT "achievement_instances_achievementDefId_fkey" FOREIGN KEY ("achievementDefId") REFERENCES "achievement_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
