import { Module } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { NftOwnershipService } from './nft-ownership.service';

@Module({
  providers: [CardanoOwnershipProvider, EvmOwnershipProvider, NftOwnershipService],
  exports: [NftOwnershipService],
})
export class NftModule {}
