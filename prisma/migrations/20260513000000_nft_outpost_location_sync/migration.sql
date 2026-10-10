-- Location-instance sync path for Derp Outpost NFTs
--
-- 1. Allow NftCollectionDef to reference a LocationDefinition instead of (or in
--    addition to) an EntityDefinition. locationDefinitionId drives the new
--    location-backed sync path; entityDefinitionId is now optional so that
--    outpost-style collections can omit it entirely.
-- 2. Allow LocationInstance.ownerUserId to be NULL so that locations transferred
--    away (or not yet assigned) can exist without an owner, matching the same
--    pattern as Entity.ownerUserId.

-- NftCollectionDef: make entityDefinitionId nullable, add locationDefinitionId
ALTER TABLE "nft_collection_defs" ALTER COLUMN "entityDefinitionId" DROP NOT NULL;
ALTER TABLE "nft_collection_defs" ADD COLUMN IF NOT EXISTS "locationDefinitionId" TEXT;

-- LocationInstance: make ownerUserId nullable
ALTER TABLE "location_instances" ALTER COLUMN "ownerUserId" DROP NOT NULL;
