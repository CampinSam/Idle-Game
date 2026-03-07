import { Module } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { NftOwnershipService } from './nft-ownership.service';
import { NftCollectionService } from './nft-collection.service';
import { NftCollectionController } from './nft-collection.controller';

@Module({
  providers: [CardanoOwnershipProvider, EvmOwnershipProvider, NftOwnershipService, NftCollectionService],
  controllers: [NftCollectionController],
  exports: [NftOwnershipService, NftCollectionService],
})
export class NftModule {}
