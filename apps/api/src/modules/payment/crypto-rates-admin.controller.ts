import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AdaRateService } from './ada-rate.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('admin/crypto/rates')
@UseGuards(AdminGuard)
export class CryptoRatesAdminController {
  constructor(
    private readonly adaRateService: AdaRateService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('ada/current')
  async getCurrentRate() {
    return this.adaRateService.getCurrentStatus();
  }

  @Get('ada/samples')
  async getRecentSamples(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit ?? '50', 10) || 50, 200);
    const samples = await (this.prisma as any).cryptoRateSample.findMany({
      where: { currencyCode: 'ADA' },
      orderBy: { fetchedAt: 'desc' },
      take,
      select: { id: true, usdPrice: true, lovelacePerUsd: true, fetchedAt: true },
    });
    return samples.map((s: any) => ({
      id: s.id.toString(),
      usdPrice: s.usdPrice,
      lovelacePerUsd: s.lovelacePerUsd.toString(),
      usdPerAda: s.usdPrice > 0 ? +(1_000_000 / Number(s.lovelacePerUsd)).toFixed(6) : 0,
      fetchedAt: s.fetchedAt.toISOString(),
    }));
  }
}
