-- Fixup: set gen_random_uuid() as the DB-level default on the UUID PK columns
-- that were created without a default in migration 20260614000000.
-- Without this, INSERT into effect_defs/power_defs without an explicit id
-- raises a NOT NULL violation (Prisma @default(uuid()) alone is insufficient
-- without the matching DB column default).
ALTER TABLE "effect_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "power_defs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
