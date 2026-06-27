-- Add spentUnits, triggerSourceType, triggerSourceId to power_use_events
-- spentUnits: how many charge units were consumed (matches chargeConfig.costPerUse at fire time)
-- triggerSourceType / triggerSourceId: audit trail of what triggered the power

ALTER TABLE "power_use_events"
  ADD COLUMN IF NOT EXISTS "spentUnits"        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "triggerSourceType"  TEXT,
  ADD COLUMN IF NOT EXISTS "triggerSourceId"    TEXT;
