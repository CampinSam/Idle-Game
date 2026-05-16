-- CreateTable: GlobalActivePower
-- Time-limited global power modifiers activated by admins.
-- Status lifecycle: active → cancelled | expired
CREATE TABLE "global_active_powers" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "powerType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "valueMode" TEXT NOT NULL DEFAULT 'percent_add',
    "durationMinutes" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_active_powers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_active_powers_status_endTime_idx" ON "global_active_powers"("status", "endTime");
