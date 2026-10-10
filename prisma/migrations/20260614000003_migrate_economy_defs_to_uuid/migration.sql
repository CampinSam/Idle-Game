-- ============================================================
-- UUID Phase 1 — Economy cluster
-- LootboxDef, BundleDef, Currency, ItemDefinition
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Phase 1a: lootbox_defs — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "lootbox_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "lootbox_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "lootbox_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "lootbox_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "lootbox_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "lootbox_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "lootbox_defs_uuid_key" ON "lootbox_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "lootbox_defs_key_key"  ON "lootbox_defs"("key");

-- Swap lootbox_defs PK (slug → uuid)
ALTER TABLE "lootbox_defs" DROP CONSTRAINT "lootbox_defs_pkey";
ALTER TABLE "lootbox_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "lootbox_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "lootbox_defs" SET "id" = "uuid";
ALTER TABLE "lootbox_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "lootbox_defs" DROP COLUMN "uuid";
ALTER TABLE "lootbox_defs" ADD CONSTRAINT "lootbox_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "lootbox_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ────────────────────────────────────────────────────────────
-- Phase 1b: bundle_defs — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "bundle_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "bundle_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "bundle_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "bundle_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "bundle_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "bundle_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "bundle_defs_uuid_key" ON "bundle_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "bundle_defs_key_key"  ON "bundle_defs"("key");

-- Swap bundle_defs PK
ALTER TABLE "bundle_defs" DROP CONSTRAINT "bundle_defs_pkey";
ALTER TABLE "bundle_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "bundle_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "bundle_defs" SET "id" = "uuid";
ALTER TABLE "bundle_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "bundle_defs" DROP COLUMN "uuid";
ALTER TABLE "bundle_defs" ADD CONSTRAINT "bundle_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "bundle_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ────────────────────────────────────────────────────────────
-- Phase 2a: currencies — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "currencies" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "currencies" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "currencies" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "currencies" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "currencies_uuid_key" ON "currencies"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "currencies_key_key"  ON "currencies"("key");

-- ────────────────────────────────────────────────────────────
-- Phase 2b: migrate user_currency_balances.currencyId slug→UUID
-- ────────────────────────────────────────────────────────────
ALTER TABLE "user_currency_balances" ADD COLUMN IF NOT EXISTS "currencyId_new" TEXT;
UPDATE "user_currency_balances" ucb
  SET "currencyId_new" = c."uuid"
  FROM "currencies" c
  WHERE c."id" = ucb."currencyId";
ALTER TABLE "user_currency_balances" ALTER COLUMN "currencyId_new" SET NOT NULL;

-- Drop composite PK, FK, and currencyId index (all depend on the old column)
ALTER TABLE "user_currency_balances" DROP CONSTRAINT IF EXISTS "user_currency_balances_pkey";
ALTER TABLE "user_currency_balances" DROP CONSTRAINT IF EXISTS "user_currency_balances_currencyId_fkey";
DROP INDEX IF EXISTS "user_currency_balances_currencyId_idx";
ALTER TABLE "user_currency_balances" DROP COLUMN "currencyId";
ALTER TABLE "user_currency_balances" RENAME COLUMN "currencyId_new" TO "currencyId";

-- ────────────────────────────────────────────────────────────
-- Phase 2c: migrate currency_ledger.currencyId slug→UUID
-- ────────────────────────────────────────────────────────────
ALTER TABLE "currency_ledger" ADD COLUMN IF NOT EXISTS "currencyId_new" TEXT;
UPDATE "currency_ledger" cl
  SET "currencyId_new" = c."uuid"
  FROM "currencies" c
  WHERE c."id" = cl."currencyId";
ALTER TABLE "currency_ledger" ALTER COLUMN "currencyId_new" SET NOT NULL;

ALTER TABLE "currency_ledger" DROP CONSTRAINT IF EXISTS "currency_ledger_currencyId_fkey";
DROP INDEX IF EXISTS "currency_ledger_currencyId_createdAt_idx";
ALTER TABLE "currency_ledger" DROP COLUMN "currencyId";
ALTER TABLE "currency_ledger" RENAME COLUMN "currencyId_new" TO "currencyId";

-- ────────────────────────────────────────────────────────────
-- Phase 2d: migrate crypto_withdrawals.currencyId slug→UUID
-- (no FK constraint; 0 rows currently)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "crypto_withdrawals" ADD COLUMN IF NOT EXISTS "currencyId_new" TEXT;
UPDATE "crypto_withdrawals" cw
  SET "currencyId_new" = c."uuid"
  FROM "currencies" c
  WHERE c."id" = cw."currencyId";
ALTER TABLE "crypto_withdrawals" DROP COLUMN "currencyId";
ALTER TABLE "crypto_withdrawals" RENAME COLUMN "currencyId_new" TO "currencyId";

-- ────────────────────────────────────────────────────────────
-- Phase 2e: swap currencies PK
-- ────────────────────────────────────────────────────────────
ALTER TABLE "currencies" DROP CONSTRAINT "currencies_pkey";
ALTER TABLE "currencies" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "currencies" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "currencies" SET "id" = "uuid";
ALTER TABLE "currencies" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "currencies" DROP COLUMN "uuid";
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_pkey" PRIMARY KEY ("id");
ALTER TABLE "currencies" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ────────────────────────────────────────────────────────────
-- Phase 2f: restore user_currency_balances constraints + indexes
-- ────────────────────────────────────────────────────────────
ALTER TABLE "user_currency_balances"
  ADD CONSTRAINT "user_currency_balances_pkey" PRIMARY KEY ("userId", "currencyId");
CREATE INDEX IF NOT EXISTS "user_currency_balances_currencyId_idx"
  ON "user_currency_balances"("currencyId");
ALTER TABLE "user_currency_balances"
  ADD CONSTRAINT "user_currency_balances_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "currencies"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 2g: restore currency_ledger constraints + indexes
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "currency_ledger_currencyId_createdAt_idx"
  ON "currency_ledger"("currencyId", "createdAt" DESC);
ALTER TABLE "currency_ledger"
  ADD CONSTRAINT "currency_ledger_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "currencies"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 3a: migrate item_defs.lootboxDefId (slug → lootbox UUID)
-- lootbox_defs.id is already UUID (swapped above); match by key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "lootboxDefId_new" TEXT;
UPDATE "item_defs" id_t
  SET "lootboxDefId_new" = ld."id"
  FROM "lootbox_defs" ld
  WHERE ld."key" = id_t."lootboxDefId";
-- nullable soft ref — items with no matching lootbox stay NULL
ALTER TABLE "item_defs" DROP COLUMN "lootboxDefId";
ALTER TABLE "item_defs" RENAME COLUMN "lootboxDefId_new" TO "lootboxDefId";

-- ────────────────────────────────────────────────────────────
-- Phase 3b: item_defs — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "item_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "item_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "item_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "item_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "item_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "item_defs_uuid_key" ON "item_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "item_defs_key_key"  ON "item_defs"("key");

-- ────────────────────────────────────────────────────────────
-- Phase 3c: migrate item_instances.definitionId slug→UUID
-- ────────────────────────────────────────────────────────────
ALTER TABLE "item_instances" ADD COLUMN IF NOT EXISTS "definitionId_new" TEXT;
UPDATE "item_instances" ii
  SET "definitionId_new" = id_t."uuid"
  FROM "item_defs" id_t
  WHERE id_t."id" = ii."definitionId";
ALTER TABLE "item_instances" ALTER COLUMN "definitionId_new" SET NOT NULL;

ALTER TABLE "item_instances" DROP CONSTRAINT IF EXISTS "item_instances_definitionId_fkey";
DROP INDEX IF EXISTS "item_instances_definitionId_idx";
ALTER TABLE "item_instances" DROP COLUMN "definitionId";
ALTER TABLE "item_instances" RENAME COLUMN "definitionId_new" TO "definitionId";

-- ────────────────────────────────────────────────────────────
-- Phase 3d: migrate item_ledger.itemId slug→UUID
-- ────────────────────────────────────────────────────────────
ALTER TABLE "item_ledger" ADD COLUMN IF NOT EXISTS "itemId_new" TEXT;
UPDATE "item_ledger" il
  SET "itemId_new" = id_t."uuid"
  FROM "item_defs" id_t
  WHERE id_t."id" = il."itemId";
ALTER TABLE "item_ledger" ALTER COLUMN "itemId_new" SET NOT NULL;

ALTER TABLE "item_ledger" DROP CONSTRAINT IF EXISTS "item_ledger_itemId_fkey";
DROP INDEX IF EXISTS "item_ledger_itemId_createdAt_idx";
ALTER TABLE "item_ledger" DROP COLUMN "itemId";
ALTER TABLE "item_ledger" RENAME COLUMN "itemId_new" TO "itemId";

-- ────────────────────────────────────────────────────────────
-- Phase 3e: migrate nft_collection_defs.itemDefinitionId (soft ref)
-- item_defs.uuid is still the UUID column (not yet swapped to id)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "nft_collection_defs" ADD COLUMN IF NOT EXISTS "itemDefinitionId_new" TEXT;
UPDATE "nft_collection_defs" ncd
  SET "itemDefinitionId_new" = id_t."uuid"
  FROM "item_defs" id_t
  WHERE id_t."id" = ncd."itemDefinitionId";
-- nullable soft ref — unresolved refs become NULL
ALTER TABLE "nft_collection_defs" DROP COLUMN "itemDefinitionId";
ALTER TABLE "nft_collection_defs" RENAME COLUMN "itemDefinitionId_new" TO "itemDefinitionId";

-- ────────────────────────────────────────────────────────────
-- Phase 3f: swap item_defs PK
-- ────────────────────────────────────────────────────────────
ALTER TABLE "item_defs" DROP CONSTRAINT "item_defs_pkey";
ALTER TABLE "item_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "item_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "item_defs" SET "id" = "uuid";
ALTER TABLE "item_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "item_defs" DROP COLUMN "uuid";
ALTER TABLE "item_defs" ADD CONSTRAINT "item_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "item_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ────────────────────────────────────────────────────────────
-- Phase 3g: restore item_instances FK + index
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "item_instances_definitionId_idx"
  ON "item_instances"("definitionId");
ALTER TABLE "item_instances"
  ADD CONSTRAINT "item_instances_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "item_defs"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 3h: restore item_ledger FK + index
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "item_ledger_itemId_createdAt_idx"
  ON "item_ledger"("itemId", "createdAt" DESC);
ALTER TABLE "item_ledger"
  ADD CONSTRAINT "item_ledger_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "item_defs"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
