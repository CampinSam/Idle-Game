-- CreateTable
CREATE TABLE "unlock_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlock_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'system',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unlock_defs_key_key" ON "unlock_defs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_unlocks_userId_key_key" ON "user_unlocks"("userId", "key");

-- AddForeignKey
ALTER TABLE "user_unlocks" ADD CONSTRAINT "user_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed location slot UnlockDefs
INSERT INTO "unlock_defs" ("id", "key", "name", "description", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'location_slot.1', 'Outpost Slot 1', 'Unlocks a second active outpost slot', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'location_slot.2', 'Outpost Slot 2', 'Unlocks a third active outpost slot', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'location_slot.3', 'Outpost Slot 3', 'Unlocks a fourth active outpost slot', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Backfill UserUnlock rows from existing bonusOutpostSlots values
INSERT INTO "user_unlocks" ("id", "userId", "key", "source", "grantedAt")
SELECT gen_random_uuid()::text, u."id", s."key", 'backfill', CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (VALUES ('location_slot.1'), ('location_slot.2'), ('location_slot.3')) AS s("key")
WHERE u."bonusOutpostSlots" >= (
  CASE s."key"
    WHEN 'location_slot.1' THEN 1
    WHEN 'location_slot.2' THEN 2
    WHEN 'location_slot.3' THEN 3
  END
)
ON CONFLICT ("userId", "key") DO NOTHING;

-- Drop bonusOutpostSlots from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "bonusOutpostSlots";
