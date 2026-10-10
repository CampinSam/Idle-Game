import { Injectable, Logger } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { OwnedAsset } from './nft-ownership.interface';

export type SupportedChain = 'CARDANO' | 'ETH' | 'BASE' | 'MATIC';

export interface OwnershipQueryResult {
  assets: OwnedAsset[];
  /** true = RPC query succeeded; the asset list is authoritative.
   *  false = the query failed; the (empty) list must NOT be used for
   *  unclaim reconciliation — skip that collection this pass. */
  isDefinitive: boolean;
}

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

  /**
   * Query owned assets and return a typed OwnershipQueryResult so callers can
   * distinguish "wallet genuinely holds 0 tokens" (isDefinitive: true, assets: [])
   * from "RPC query failed" (isDefinitive: false, assets: []).
   *
   * Use this wherever an empty result would otherwise trigger unclaim
   * reconciliation — callers must skip reconciliation when isDefinitive is false.
   */
  async getOwnedInCollectionWithResult(
    chain: SupportedChain,
    address: string,
    collectionId: string,
  ): Promise<OwnershipQueryResult> {
    try {
      if (chain === 'CARDANO') {
        const assets = await this.cardano.getOwnedAssetsStrict(address, collectionId);
        return { assets, isDefinitive: true };
      }
      const assets = await this.evm.getOwnedAssetsStrict(address, collectionId, chain);
      return { assets, isDefinitive: true };
    } catch (err) {
      this.logger.warn(`NFT ownership query failed for ${chain}/${address} — will skip reconciliation: ${err}`);
      return { assets: [], isDefinitive: false };
    }
  }

  /**
   * Return the current on-chain owner address for a specific asset (entity-centric sweep).
   * Returns null if the asset is confirmed unowned (i.e. burned / unminted).
   * Throws on any RPC failure — callers must skip the asset rather than
   * falsely clearing ownership on a failed query.
   *
   * Currently only supported for CARDANO; throws for all other chains so
   * EVM assets are silently skipped by the sweep.
   */
  async getAssetOwner(
    chain: SupportedChain,
    policyId: string,
    tokenName: string,
  ): Promise<string | null> {
    if (chain !== 'CARDANO') {
      throw new Error(`getAssetOwner not yet supported for chain ${chain}`);
    }
    const holders = await this.cardano.getAssetHolders(policyId, tokenName);
    return holders.length > 0 ? holders[0] : null;
  }
}
