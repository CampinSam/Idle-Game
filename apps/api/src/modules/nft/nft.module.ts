import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { CardanoOwnershipProvider } from './cardano-ownership.provider';
import { EvmOwnershipProvider } from './evm-ownership.provider';
import { NftOwnershipService } from './nft-ownership.service';
import { NftCollectionService } from './nft-collection.service';
import { NftCollectionController } from './nft-collection.controller';
import { NftImageImportService } from './nft-image-import.service';
import { NftAssetCacheService } from './nft-asset-cache.service';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [InfrastructureModule, LocationModule],
  providers: [CardanoOwnershipProvider, EvmOwnershipProvider, NftOwnershipService, NftCollectionService, NftImageImportService, NftAssetCacheService],
  controllers: [NftCollectionController],
  exports: [NftOwnershipService, NftCollectionService, CardanoOwnershipProvider, NftImageImportService, NftAssetCacheService],
})
export class NftModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NftModule.name);
  private sweepInterval: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;

  // Run a full entity-centric ownership sweep every 24 h.
  private static readonly SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  // Wait 5 minutes after boot before the first sweep so startup stays fast.
  private static readonly INITIAL_DELAY_MS = 5 * 60 * 1000;

  constructor(private nftCollectionService: NftCollectionService) {}

  onModuleInit() {
    this.initialTimer = setTimeout(() => {
      this.runEntitySweep().catch((err) => this.logger.error(`Initial NFT entity sweep failed: ${err}`));
      this.sweepInterval = setInterval(
        () => this.runEntitySweep().catch((err) => this.logger.error(`NFT entity sweep failed: ${err}`)),
        NftModule.SWEEP_INTERVAL_MS,
      );
    }, NftModule.INITIAL_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    this.initialTimer = null;
    this.sweepInterval = null;
  }

  private async runEntitySweep() {
    await this.nftCollectionService.entityCentricOwnershipSweep();
  }
}
