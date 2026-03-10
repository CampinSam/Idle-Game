import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTickRateIntervals();
    await this.seedNftCollections();
  }

  private async seedTickRateIntervals() {
    const count = await (this.prisma as any).tickRateInterval.count();
    if (count > 0) return;

    this.logger.warn('No tick rate intervals found — seeding initial interval (1 tick/sec from 2025-01-01)');
    await (this.prisma as any).tickRateInterval.create({
      data: {
        ticksPerSecond: 1,
        effectiveFromTime: new Date('2025-01-01T00:00:00Z'),
        effectiveFromTick: 0,
      },
    });
    this.logger.log('Seeded initial tick rate interval');
  }

  private async seedNftCollections() {
    const result = await (this.prisma as any).nftCollectionDef.upsert({
      where: { id: 'nft_cardano_dp' },
      update: {},
      create: {
        id: 'nft_cardano_dp',
        name: 'Derp Birds (Cardano)',
        chain: 'CARDANO',
        collectionId: 'e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0',
        entityDefinitionId: 'derp_bird',
        mintMode: 'one_per_token',
        active: true,
        data: {},
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      this.logger.log('Seeded Derp Birds Cardano NFT collection');
    }
  }
}
