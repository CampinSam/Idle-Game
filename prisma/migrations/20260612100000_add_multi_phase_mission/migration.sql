-- AlterTable: MissionDef gains multi-phase fields
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "phases" JSONB;
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "rewardsMode" TEXT NOT NULL DEFAULT 'final_bundle';
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "maxFailures" INTEGER;

-- AlterTable: Job gains multi-phase tracking fields
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "currentPhase" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "phaseResults" JSONB;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "accumulatedState" JSONB;
