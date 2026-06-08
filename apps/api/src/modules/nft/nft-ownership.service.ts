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
   * Like getOwnedInCollection but throws on any RPC failure so callers can
   * distinguish "wallet genuinely holds 0 tokens" from "query failed".
   * Use this wherever an empty result would trigger unclaim reconciliation.
   */
  async getOwnedInCollectionStrict(
    chain: SupportedChain,
    address: string,
    collectionId: string,
  ): Promise<OwnedAsset[]> {
    if (chain === 'CARDANO') {
      return this.cardano.getOwnedAssetsStrict(address, collectionId);
    }
    return this.evm.getOwnedAssetsStrict(address, collectionId, chain);
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
