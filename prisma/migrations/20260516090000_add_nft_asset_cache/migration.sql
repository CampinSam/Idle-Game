-- CreateTable: NftAsset
-- Single mandatory cache table for NFT asset metadata fetched from Blockfrost.
-- All Blockfrost metadata lookups must go through NftAssetCacheService; no other
-- service may call Blockfrost for asset metadata directly.
CREATE TABLE "nft_assets" (
    "nftAssetId"   TEXT        NOT NULL,
    "collectionId" TEXT        NOT NULL,
    "chain"        TEXT        NOT NULL,
    "policyId"     TEXT        NOT NULL,
    "tokenName"    TEXT        NOT NULL,
    "ownerAddress" TEXT,
    "name"         TEXT,
    "imageUrl"     TEXT,
    "rawMetadata"  JSONB       NOT NULL DEFAULT '{}',
    "nftAttributes" JSONB      NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nft_assets_pkey" PRIMARY KEY ("nftAssetId")
);

-- CreateIndex
CREATE INDEX "nft_assets_collectionId_idx" ON "nft_assets"("collectionId");

-- CreateIndex
CREATE INDEX "nft_assets_ownerAddress_idx" ON "nft_assets"("ownerAddress");

-- AddForeignKey
ALTER TABLE "nft_assets" ADD CONSTRAINT "nft_assets_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "nft_collection_defs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
