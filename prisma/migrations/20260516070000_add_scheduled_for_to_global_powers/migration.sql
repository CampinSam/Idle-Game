-- AlterTable: GlobalActivePower — add optional scheduledFor field
-- Powers with scheduledFor set in the future are stored with status='scheduled'
-- and activated by the tick processor when scheduledFor <= now.
ALTER TABLE "global_active_powers" ADD COLUMN "scheduledFor" TIMESTAMP(3);
