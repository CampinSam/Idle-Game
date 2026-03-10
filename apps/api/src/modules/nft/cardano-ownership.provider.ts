import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NftOwnershipProvider, OwnedAsset, NftMetadata } from './nft-ownership.interface';

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

  async getAllPolicyAssets(policyId: string): Promise<string[]> {
    if (!this.apiKey) return [];
    const allAssets: string[] = [];
    let page = 1;
    while (true) {
      try {
        const url = `${this.baseUrl}/assets/policy/${policyId}?count=100&page=${page}`;
        const res = await fetch(url, { headers: { project_id: this.apiKey } });
        if (!res.ok) {
          this.logger.warn(`Blockfrost getAllPolicyAssets failed on page ${page}: ${res.status}`);
          break;
        }
        const data = (await res.json()) as Array<{ asset: string; quantity: string }>;
        for (const item of data) {
          const assetId = item.asset.slice(policyId.length);
          if (assetId) allAssets.push(assetId);
        }
        if (data.length < 100) break;
        page++;
      } catch (err) {
        this.logger.error(`Blockfrost getAllPolicyAssets error on page ${page}: ${err}`);
        break;
      }
    }
    return allAssets;
  }

  async getAssetMetadata(policyId: string, assetId: string): Promise<NftMetadata | null> {
    if (!this.apiKey) return null;
    const unit = `${policyId}${assetId}`;
    const url = `${this.baseUrl}/assets/${unit}`;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, { headers: { project_id: this.apiKey } });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
          const waitMs = (retryAfter * 1000) || Math.min(1000 * 2 ** attempt, 30000);
          this.logger.warn(`Blockfrost rate limited on ${unit}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!res.ok) {
          this.logger.warn(`Blockfrost getAssetMetadata failed for ${unit}: ${res.status}`);
          return null;
        }

        const data = (await res.json()) as any;
        const meta = data.onchain_metadata ?? {};
        return {
          assetId,
          name: meta.name ?? assetId,
          imageUrl: meta.image ?? '',
          attributes: meta.attributes ?? {},
          rawMeta: meta,
        };
      } catch (err) {
        this.logger.error(`Blockfrost getAssetMetadata error for ${assetId} (attempt ${attempt + 1}): ${err}`);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }

    return null;
  }
}
