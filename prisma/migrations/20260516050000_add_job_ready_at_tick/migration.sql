-- AddColumn: readyAtTick for tick-event-processor to query jobs ready for notification
ALTER TABLE "jobs" ADD COLUMN "readyAtTick" INTEGER;

-- AddIndex: composite index on (readyAtTick, status) for efficient polling
CREATE INDEX "jobs_readyAtTick_status_idx" ON "jobs"("readyAtTick", "status");
