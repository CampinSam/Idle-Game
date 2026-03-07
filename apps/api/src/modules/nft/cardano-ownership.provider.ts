import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NftOwnershipProvider, OwnedAsset } from './nft-ownership.interface';

@Injectable()
export class CardanoOwnershipProvider implements NftOwnershipProvider {
  private readonly logger = new Logger(CardanoOwnershipProvider.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://cardano-mainnet.blockfrost.io/api/v0';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('BLOCKFROST_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('BLOCKFROST_API_KEY not set — Cardano NFT ownership checks will always return false');
    }
  }

  async getOwnedAssets(address: string, policyId: string): Promise<OwnedAsset[]> {
    if (!this.apiKey) return [];
    try {
      const url = `${this.baseUrl}/addresses/${address}/assets`;
      const res = await fetch(url, {
        headers: { project_id: this.apiKey },
      });
      if (!res.ok) {
        this.logger.warn(`Blockfrost getOwnedAssets failed: ${res.status} for address ${address}`);
        return [];
      }
      const data = (await res.json()) as Array<{ unit: string; quantity: string }>;
      return data
        .filter((a) => a.unit.startsWith(policyId))
        .map((a) => ({
          assetId: a.unit.slice(policyId.length),
          quantity: parseInt(a.quantity, 10),
        }));
    } catch (err) {
      this.logger.error(`Blockfrost getOwnedAssets error: ${err}`);
      return [];
    }
  }

  async ownsAsset(address: string, policyId: string, assetId: string): Promise<boolean> {
    const owned = await this.getOwnedAssets(address, policyId);
    return owned.some((a) => a.assetId === assetId && a.quantity > 0);
  }
}
