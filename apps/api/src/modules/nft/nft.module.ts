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
import { PrismaService } from '../../prisma/prisma.service';

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

  // Run a full pass over all wallet-linked users every 24h.
  private static readonly SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  // Wait 5 minutes after boot before the first sweep so startup stays fast.
  private static readonly INITIAL_DELAY_MS = 5 * 60 * 1000;
  // Only resync users whose lastNftSyncAt is older than this (or never synced).
  // Set just under 24h so a user synced at the same time yesterday is picked up.
  private static readonly STALE_THRESHOLD_MS = 23 * 60 * 60 * 1000;
  // Spacing between per-user syncs inside one sweep, to be polite to chain RPCs.
  private static readonly PER_USER_DELAY_MS = 250;

  constructor(
    private nftCollectionService: NftCollectionService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initialTimer = setTimeout(() => {
      this.runSweep().catch((err) => this.logger.error(`Initial NFT sweep failed: ${err}`));
      this.sweepInterval = setInterval(
        () => this.runSweep().catch((err) => this.logger.error(`Daily NFT sweep failed: ${err}`)),
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

  private async runSweep() {
    const cutoff = new Date(Date.now() - NftModule.STALE_THRESHOLD_MS);
    const users = await this.prisma.user.findMany({
      where: {
        linkedWallets: { some: {} },
        OR: [
          { lastNftSyncAt: null } as any,
          { lastNftSyncAt: { lt: cutoff } } as any,
        ],
      },
      select: { id: true },
    });

    if (users.length === 0) {
      this.logger.log('Daily NFT sweep: no users due');
      return;
    }

    this.logger.log(`Daily NFT sweep: ${users.length} users due`);
    let ok = 0;
    let fail = 0;
    let totalClaimed = 0;
    for (const u of users) {
      try {
        const res = await this.nftCollectionService.syncUserCollections(u.id);
        ok++;
        totalClaimed += res.claimed;
      } catch (err) {
        fail++;
        this.logger.warn(`NFT sweep failed for user ${u.id}: ${err}`);
      }
      if (NftModule.PER_USER_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, NftModule.PER_USER_DELAY_MS));
      }
    }
    this.logger.log(
      `Daily NFT sweep complete: ok=${ok} failed=${fail} newlyClaimed=${totalClaimed}`,
    );
  }
}
