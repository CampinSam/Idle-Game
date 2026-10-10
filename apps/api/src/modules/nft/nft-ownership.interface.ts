export interface OwnedAsset {
  assetId: string;
  quantity: number;
}

export interface NftOwnershipProvider {
  ownsAsset(address: string, collectionId: string, assetId: string): Promise<boolean>;
  getOwnedAssets(address: string, collectionId: string): Promise<OwnedAsset[]>;
}

export interface NftMetadata {
  assetId: string;
  name: string;
  imageUrl: string;
  attributes: Record<string, string>;
  attributesRaw?: string;
  rawMeta: Record<string, any>;
}
