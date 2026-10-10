-- AlterTable
ALTER TABLE "item_instances" ADD COLUMN     "nftAssetId" TEXT,
ADD COLUMN     "nftCollectionDefId" TEXT;

-- AlterTable
ALTER TABLE "nft_collection_defs" ADD COLUMN     "itemDefinitionId" TEXT;

-- CreateIndex
CREATE INDEX "item_instances_nftAssetId_idx" ON "item_instances"("nftAssetId");

-- CreateIndex
CREATE INDEX "item_instances_nftCollectionDefId_idx" ON "item_instances"("nftCollectionDefId");

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_nftCollectionDefId_fkey" FOREIGN KEY ("nftCollectionDefId") REFERENCES "nft_collection_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
