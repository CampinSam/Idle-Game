export interface OwnedAsset {
  assetId: string;
  quantity: number;
}

export interface NftOwnershipProvider {
  ownsAsset(address: string, collectionId: string, assetId: string): Promise<boolean>;
  getOwnedAssets(address: string, collectionId: string): Promise<OwnedAsset[]>;
}
