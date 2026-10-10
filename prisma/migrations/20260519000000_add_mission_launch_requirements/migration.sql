-- AlterTable
ALTER TABLE "mission_defs" ADD COLUMN IF NOT EXISTS "launchRequirements" JSONB;
