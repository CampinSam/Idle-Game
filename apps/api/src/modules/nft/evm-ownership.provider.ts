import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NftOwnershipProvider, OwnedAsset } from './nft-ownership.interface';

const CHAIN_NETWORK: Record<string, string> = {
  ETH: 'eth-mainnet',
  BASE: 'base-mainnet',
  MATIC: 'polygon-mainnet',
};

@Injectable()
export class EvmOwnershipProvider implements NftOwnershipProvider {
  private readonly logger = new Logger(EvmOwnershipProvider.name);
  private readonly apiKey: string | undefined;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('ALCHEMY_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('ALCHEMY_API_KEY not set — EVM NFT ownership checks will always return false');
    }
  }

  async getOwnedAssets(address: string, contractAddress: string, chain = 'ETH'): Promise<OwnedAsset[]> {
    if (!this.apiKey) return [];
    const network = CHAIN_NETWORK[chain] ?? CHAIN_NETWORK['ETH'];
    try {
      const url = `https://${network}.g.alchemy.com/nft/v3/${this.apiKey}/getNFTsForOwner` +
        `?owner=${address}&contractAddresses[]=${contractAddress}&withMetadata=false`;
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Alchemy getNFTsForOwner failed: ${res.status} for address ${address} on ${chain}`);
        return [];
      }
      const data = (await res.json()) as { ownedNfts?: any[] };
      const nfts: any[] = data.ownedNfts || [];
      return nfts.map((nft) => ({
        assetId: nft.tokenId,
        quantity: parseInt(nft.balance ?? '1', 10),
      }));
    } catch (err) {
      this.logger.error(`Alchemy getOwnedAssets error: ${err}`);
      return [];
    }
  }

  async ownsAsset(address: string, contractAddress: string, tokenId: string, chain = 'ETH'): Promise<boolean> {
    const owned = await this.getOwnedAssets(address, contractAddress, chain);
    return owned.some((a) => a.assetId === tokenId && a.quantity > 0);
  }
}
