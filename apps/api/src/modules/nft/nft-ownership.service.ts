import { Injectable, Logger } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { OwnedAsset } from './nft-ownership.interface';

export type SupportedChain = 'CARDANO' | 'ETH' | 'BASE' | 'MATIC';

@Injectable()
export class NftOwnershipService {
  private readonly logger = new Logger(NftOwnershipService.name);

  constructor(
    private cardano: CardanoOwnershipProvider,
    private evm: EvmOwnershipProvider,
  ) {}

  async checkOwnership(
    chain: SupportedChain,
    address: string,
    collectionId: string,
    assetId: string,
  ): Promise<boolean> {
    try {
      if (chain === 'CARDANO') {
        return this.cardano.ownsAsset(address, collectionId, assetId);
      }
      return this.evm.ownsAsset(address, collectionId, assetId, chain);
    } catch (err) {
      this.logger.error(`checkOwnership failed for ${chain}/${address}: ${err}`);
      return false;
    }
  }

  async getOwnedInCollection(
    chain: SupportedChain,
    address: string,
    collectionId: string,
  ): Promise<OwnedAsset[]> {
    try {
      if (chain === 'CARDANO') {
        return this.cardano.getOwnedAssets(address, collectionId);
      }
      return this.evm.getOwnedAssets(address, collectionId, chain);
    } catch (err) {
      this.logger.error(`getOwnedInCollection failed for ${chain}/${address}: ${err}`);
      return [];
    }
  }
}
