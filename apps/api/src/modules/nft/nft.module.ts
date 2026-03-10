import { Module } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { NftOwnershipService } from './nft-ownership.service';
import { NftCollectionService } from './nft-collection.service';
import { NftCollectionController } from './nft-collection.controller';
import { NftImageImportService } from './nft-image-import.service';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';

@Module({
  imports: [InfrastructureModule],
  providers: [CardanoOwnershipProvider, EvmOwnershipProvider, NftOwnershipService, NftCollectionService, NftImageImportService],
  controllers: [NftCollectionController],
  exports: [NftOwnershipService, NftCollectionService, CardanoOwnershipProvider, NftImageImportService],
})
export class NftModule {}
