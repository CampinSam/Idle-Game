-- Migration: Remove POTION item type, consolidate to CONSUMABLE
-- Step 1: Update all existing rows that have type = 'POTION' to 'CONSUMABLE'
UPDATE "item_defs" SET "type" = 'CONSUMABLE' WHERE "type" = 'POTION';

-- Step 2: Remove POTION from the ItemType enum
-- PostgreSQL requires recreating the enum type
ALTER TYPE "ItemType" RENAME TO "ItemType_old";
CREATE TYPE "ItemType" AS ENUM ('MATERIAL', 'CONSUMABLE', 'GEAR', 'QUEST', 'LOOTBOX', 'GIFT_PACKAGE');
ALTER TABLE "item_defs" ALTER COLUMN "type" TYPE "ItemType" USING "type"::text::"ItemType";
DROP TYPE "ItemType_old";
