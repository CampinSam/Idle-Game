import { NftMetadata } from './nft-ownership.interface';

export function buildLocationDataFromNftMetadata(
  collection: {
    locationDefinitionId: string;
  },
  meta: NftMetadata,
  nftAssetId: string,
): Record<string, any> {
  return {
    ownerUserId: null,
    definitionId: collection.locationDefinitionId,
    nftAssetId,
    kind: 'outpost_fungible',
    isUnique: false,
    level: 1,
    xp: 0,
    threatLevel: 0,
    corruptionLevel: 0,
    lastCollectionTick: 0,
    storage: {},
    state: {
      nftName: meta.name,
      nftImageUrl: meta.imageUrl,
      nftAttributes: meta.attributes,
      nftRawMeta: meta.rawMeta,
    },
    enabled: true,
  };
}
