-- ============================================================
-- UUID Phase 1 — World cluster
-- RegionDefinition, LocationDefinition, BuildingDef, RoomDef, EntityDefinition
-- ============================================================
-- Batched DO $$ loops are used for large FK child tables
-- (location_instances, entities) to avoid long lock windows in production.
-- Small tables (< 100 rows in a clean install) use monolithic UPDATEs.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Phase 1: region_definitions — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "region_definitions" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "region_definitions" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "region_definitions" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "region_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "region_definitions" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "region_definitions" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "region_definitions_uuid_key" ON "region_definitions"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "region_definitions_key_key"  ON "region_definitions"("key");

-- ── Backfill location_definitions.regionId slug → region uuid (small table) ──
ALTER TABLE "location_definitions" ADD COLUMN IF NOT EXISTS "regionId_new" TEXT;
UPDATE "location_definitions" ld
  SET "regionId_new" = rd."uuid"
  FROM "region_definitions" rd
  WHERE rd."id" = ld."regionId";

-- Drop FK + index before rename
ALTER TABLE "location_definitions" DROP CONSTRAINT IF EXISTS "location_definitions_regionId_fkey";
DROP INDEX IF EXISTS "location_definitions_regionId_idx";
ALTER TABLE "location_definitions" DROP COLUMN "regionId";
ALTER TABLE "location_definitions" RENAME COLUMN "regionId_new" TO "regionId";

-- ── Backfill location_instances.regionId (denorm, no FK constraint) ──
ALTER TABLE "location_instances" ADD COLUMN IF NOT EXISTS "regionId_new" TEXT;
UPDATE "location_instances" li
  SET "regionId_new" = rd."uuid"
  FROM "region_definitions" rd
  WHERE rd."id" = li."regionId";
ALTER TABLE "location_instances" DROP COLUMN "regionId";
ALTER TABLE "location_instances" RENAME COLUMN "regionId_new" TO "regionId";

-- ── Swap region_definitions PK ──
ALTER TABLE "region_definitions" DROP CONSTRAINT "region_definitions_pkey";
ALTER TABLE "region_definitions" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "region_definitions" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "region_definitions" SET "id" = "uuid";
ALTER TABLE "region_definitions" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "region_definitions" DROP COLUMN "uuid";
ALTER TABLE "region_definitions" ADD CONSTRAINT "region_definitions_pkey" PRIMARY KEY ("id");
ALTER TABLE "region_definitions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore location_definitions.regionId FK ──
CREATE INDEX IF NOT EXISTS "location_definitions_regionId_idx" ON "location_definitions"("regionId");
ALTER TABLE "location_definitions"
  ADD CONSTRAINT "location_definitions_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "region_definitions"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- Phase 2: location_definitions — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "location_definitions" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "location_definitions" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "location_definitions" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "location_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "location_definitions" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "location_definitions" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "location_definitions_uuid_key" ON "location_definitions"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "location_definitions_key_key"  ON "location_definitions"("key");

-- ── Backfill location_instances.definitionId slug → location uuid (BATCHED) ──
ALTER TABLE "location_instances" ADD COLUMN IF NOT EXISTS "definitionId_new" TEXT;

DO $$
DECLARE
  batch_size INT := 1000;
  updated    INT;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM location_instances
      WHERE "definitionId_new" IS NULL
      LIMIT batch_size
    )
    UPDATE location_instances li
    SET "definitionId_new" = ld."uuid"
    FROM location_definitions ld, batch b
    WHERE li.id = b.id
      AND ld."id" = li."definitionId";
    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;
  END LOOP;
END $$;

-- Drop FK + index before rename
ALTER TABLE "location_instances" DROP CONSTRAINT IF EXISTS "location_instances_definitionId_fkey";
DROP INDEX IF EXISTS "location_instances_definitionId_idx";
ALTER TABLE "location_instances" DROP COLUMN "definitionId";
ALTER TABLE "location_instances" RENAME COLUMN "definitionId_new" TO "definitionId";
ALTER TABLE "location_instances" ALTER COLUMN "definitionId" SET NOT NULL;

-- ── Backfill nft_collection_defs.locationDefinitionId (soft ref, small) ──
ALTER TABLE "nft_collection_defs" ADD COLUMN IF NOT EXISTS "locationDefinitionId_new" TEXT;
UPDATE "nft_collection_defs" ncd
  SET "locationDefinitionId_new" = ld."uuid"
  FROM "location_definitions" ld
  WHERE ld."id" = ncd."locationDefinitionId";
ALTER TABLE "nft_collection_defs" DROP COLUMN "locationDefinitionId";
ALTER TABLE "nft_collection_defs" RENAME COLUMN "locationDefinitionId_new" TO "locationDefinitionId";

-- ── Swap location_definitions PK ──
ALTER TABLE "location_definitions" DROP CONSTRAINT "location_definitions_pkey";
ALTER TABLE "location_definitions" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "location_definitions" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "location_definitions" SET "id" = "uuid";
ALTER TABLE "location_definitions" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "location_definitions" DROP COLUMN "uuid";
ALTER TABLE "location_definitions" ADD CONSTRAINT "location_definitions_pkey" PRIMARY KEY ("id");
ALTER TABLE "location_definitions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore location_instances.definitionId FK + index ──
CREATE INDEX IF NOT EXISTS "location_instances_definitionId_idx" ON "location_instances"("definitionId");
ALTER TABLE "location_instances"
  ADD CONSTRAINT "location_instances_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "location_definitions"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 3: building_defs — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "building_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "building_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "building_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "building_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "building_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "building_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "building_defs_uuid_key" ON "building_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "building_defs_key_key"  ON "building_defs"("key");

-- ── Backfill location_building_instances.buildingDefId slug → uuid (small) ──
ALTER TABLE "location_building_instances" ADD COLUMN IF NOT EXISTS "buildingDefId_new" TEXT;
UPDATE "location_building_instances" lbi
  SET "buildingDefId_new" = bd."uuid"
  FROM "building_defs" bd
  WHERE bd."id" = lbi."buildingDefId";

ALTER TABLE "location_building_instances" DROP CONSTRAINT IF EXISTS "location_building_instances_buildingDefId_fkey";
DROP INDEX IF EXISTS "location_building_instances_buildingDefId_idx";
ALTER TABLE "location_building_instances" DROP COLUMN "buildingDefId";
ALTER TABLE "location_building_instances" RENAME COLUMN "buildingDefId_new" TO "buildingDefId";
ALTER TABLE "location_building_instances" ALTER COLUMN "buildingDefId" SET NOT NULL;

-- ── Swap building_defs PK ──
ALTER TABLE "building_defs" DROP CONSTRAINT "building_defs_pkey";
ALTER TABLE "building_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "building_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "building_defs" SET "id" = "uuid";
ALTER TABLE "building_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "building_defs" DROP COLUMN "uuid";
ALTER TABLE "building_defs" ADD CONSTRAINT "building_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "building_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore location_building_instances.buildingDefId FK + index ──
CREATE INDEX IF NOT EXISTS "location_building_instances_buildingDefId_idx"
  ON "location_building_instances"("buildingDefId");
ALTER TABLE "location_building_instances"
  ADD CONSTRAINT "location_building_instances_buildingDefId_fkey"
  FOREIGN KEY ("buildingDefId") REFERENCES "building_defs"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 4: room_defs — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "room_defs" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "room_defs" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "room_defs" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "room_defs" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "room_defs" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "room_defs" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "room_defs_uuid_key" ON "room_defs"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "room_defs_key_key"  ON "room_defs"("key");

-- ── Backfill location_room_instances.roomDefId slug → uuid ──
-- (table may be empty in dev; monolithic UPDATE is safe for small tables)
ALTER TABLE "location_room_instances" ADD COLUMN IF NOT EXISTS "roomDefId_new" TEXT;
UPDATE "location_room_instances" lri
  SET "roomDefId_new" = rd."uuid"
  FROM "room_defs" rd
  WHERE rd."id" = lri."roomDefId";

ALTER TABLE "location_room_instances" DROP CONSTRAINT IF EXISTS "location_room_instances_roomDefId_fkey";
DROP INDEX IF EXISTS "location_room_instances_roomDefId_idx";
ALTER TABLE "location_room_instances" DROP COLUMN "roomDefId";
ALTER TABLE "location_room_instances" RENAME COLUMN "roomDefId_new" TO "roomDefId";
ALTER TABLE "location_room_instances" ALTER COLUMN "roomDefId" SET NOT NULL;

-- ── Swap room_defs PK ──
ALTER TABLE "room_defs" DROP CONSTRAINT "room_defs_pkey";
ALTER TABLE "room_defs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "room_defs" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "room_defs" SET "id" = "uuid";
ALTER TABLE "room_defs" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "room_defs" DROP COLUMN "uuid";
ALTER TABLE "room_defs" ADD CONSTRAINT "room_defs_pkey" PRIMARY KEY ("id");
ALTER TABLE "room_defs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore location_room_instances.roomDefId FK + index ──
CREATE INDEX IF NOT EXISTS "location_room_instances_roomDefId_idx"
  ON "location_room_instances"("roomDefId");
ALTER TABLE "location_room_instances"
  ADD CONSTRAINT "location_room_instances_roomDefId_fkey"
  FOREIGN KEY ("roomDefId") REFERENCES "room_defs"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ────────────────────────────────────────────────────────────
-- Phase 5: entity_definitions — add uuid + key
-- ────────────────────────────────────────────────────────────
ALTER TABLE "entity_definitions" ADD COLUMN IF NOT EXISTS "uuid" TEXT;
UPDATE "entity_definitions" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;
ALTER TABLE "entity_definitions" ALTER COLUMN "uuid" SET NOT NULL;
ALTER TABLE "entity_definitions" ADD COLUMN IF NOT EXISTS "key" TEXT;
UPDATE "entity_definitions" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "entity_definitions" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "entity_definitions_uuid_key" ON "entity_definitions"("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "entity_definitions_key_key"  ON "entity_definitions"("key");

-- ── Backfill entities.definitionId slug → entity uuid (BATCHED) ──
ALTER TABLE "entities" ADD COLUMN IF NOT EXISTS "definitionId_new" TEXT;

DO $$
DECLARE
  batch_size INT := 1000;
  updated    INT;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM entities
      WHERE "definitionId_new" IS NULL
      LIMIT batch_size
    )
    UPDATE entities e
    SET "definitionId_new" = ed."uuid"
    FROM entity_definitions ed, batch b
    WHERE e.id = b.id
      AND ed."id" = e."definitionId";
    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;
  END LOOP;
END $$;

ALTER TABLE "entities" DROP CONSTRAINT IF EXISTS "entities_definitionId_fkey";
DROP INDEX IF EXISTS "entities_definitionId_idx";
ALTER TABLE "entities" DROP COLUMN "definitionId";
ALTER TABLE "entities" RENAME COLUMN "definitionId_new" TO "definitionId";
ALTER TABLE "entities" ALTER COLUMN "definitionId" SET NOT NULL;

-- ── Backfill nft_collection_defs.entityDefinitionId (soft ref, small) ──
ALTER TABLE "nft_collection_defs" ADD COLUMN IF NOT EXISTS "entityDefinitionId_new" TEXT;
UPDATE "nft_collection_defs" ncd
  SET "entityDefinitionId_new" = ed."uuid"
  FROM "entity_definitions" ed
  WHERE ed."id" = ncd."entityDefinitionId";
ALTER TABLE "nft_collection_defs" DROP COLUMN "entityDefinitionId";
ALTER TABLE "nft_collection_defs" RENAME COLUMN "entityDefinitionId_new" TO "entityDefinitionId";

-- ── Swap entity_definitions PK ──
ALTER TABLE "entity_definitions" DROP CONSTRAINT "entity_definitions_pkey";
ALTER TABLE "entity_definitions" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "entity_definitions" ALTER COLUMN "id" DROP NOT NULL;
UPDATE "entity_definitions" SET "id" = "uuid";
ALTER TABLE "entity_definitions" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "entity_definitions" DROP COLUMN "uuid";
ALTER TABLE "entity_definitions" ADD CONSTRAINT "entity_definitions_pkey" PRIMARY KEY ("id");
ALTER TABLE "entity_definitions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- ── Restore entities.definitionId FK + index ──
CREATE INDEX IF NOT EXISTS "entities_definitionId_idx" ON "entities"("definitionId");
ALTER TABLE "entities"
  ADD CONSTRAINT "entities_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "entity_definitions"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
