-- AlterTable: Remove 9 dead columns from item_defs that are never read by application code.
-- version: always 1, never read
-- isLootbox: redundant with type === 'LOOTBOX'
-- tradable: never read by any handler or service
-- bindOnEquip: never read
-- bindOnPickup: never read
-- hasState: never read
-- stateSchema: never read; implied by hasState
-- statModifiers: never read; always null in seed data
-- craftingData: never read; always null in seed data

ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "version";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "isLootbox";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "tradable";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "bindOnEquip";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "bindOnPickup";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "hasState";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "stateSchema";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "statModifiers";
ALTER TABLE "item_defs" DROP COLUMN IF EXISTS "craftingData";
