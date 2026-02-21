import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTickRateIntervals();
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
}
