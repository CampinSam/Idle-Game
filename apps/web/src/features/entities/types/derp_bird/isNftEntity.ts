export function isNftEntity(entity: any): boolean {
  return Boolean(entity?.nftAssetId || entity?.nftCollectionDefId);
}
