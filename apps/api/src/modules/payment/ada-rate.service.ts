import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const FALLBACK_LOVELACE_PER_USD = 2_000_000;
const DEFAULT_TWA_WINDOW_SECONDS = 3_600;

export interface AdaRateSnapshot {
  lovelacePerUsd: number;
  usdPrice: number;
  lovelaceAmount: number;
  twaWindowSeconds: number;
  sampleCount: number;
  computedAt: string;
}

@Injectable()
export class AdaRateService {
  private readonly logger = new Logger(AdaRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getLovelacePerUsd(): Promise<number> {
    const { rate } = await this.computeTwa();
    return rate;
  }

  async getRateSnapshot(usdPrice: number): Promise<{ 'ADA/USD': AdaRateSnapshot }> {
    const { rate, sampleCount, twaWindowSeconds } = await this.computeTwa();
    const lovelaceAmount = Math.ceil(usdPrice * rate);
    return {
      'ADA/USD': {
        lovelacePerUsd: rate,
        usdPrice,
        lovelaceAmount,
        twaWindowSeconds,
        sampleCount,
        computedAt: new Date().toISOString(),
      },
    };
  }

  async getCurrentStatus(): Promise<{
    lovelacePerUsd: number;
    usdPerAda: number;
    sampleCount: number;
    twaWindowSeconds: number;
    oldestSampleAt: string | null;
    newestSampleAt: string | null;
    usingFallback: boolean;
  }> {
    const { rate, sampleCount, twaWindowSeconds, usingFallback } = await this.computeTwa();

    const oldest = await (this.prisma as any).cryptoRateSample.findFirst({
      where: { currencyCode: 'ADA' },
      orderBy: { fetchedAt: 'asc' },
    });
    const newest = await (this.prisma as any).cryptoRateSample.findFirst({
      where: { currencyCode: 'ADA' },
      orderBy: { fetchedAt: 'desc' },
    });

    return {
      lovelacePerUsd: rate,
      usdPerAda: rate > 0 ? +(1_000_000 / rate).toFixed(6) : 0,
      sampleCount,
      twaWindowSeconds,
      oldestSampleAt: oldest?.fetchedAt?.toISOString() ?? null,
      newestSampleAt: newest?.fetchedAt?.toISOString() ?? null,
      usingFallback,
    };
  }

  private async computeTwa(): Promise<{
    rate: number;
    sampleCount: number;
    twaWindowSeconds: number;
    usingFallback: boolean;
  }> {
    let twaWindowSeconds = DEFAULT_TWA_WINDOW_SECONDS;
    try {
      const config = await (this.prisma as any).cryptoRateConfig.findUnique({
        where: { currencyCode: 'ADA' },
      });
      if (config) twaWindowSeconds = config.twaWindowSeconds;
    } catch {
      /* table may not exist yet during initial migration */
    }

    const windowCutoff = new Date(Date.now() - twaWindowSeconds * 1_000);

    let samples: Array<{ lovelacePerUsd: bigint; fetchedAt: Date }> = [];
    try {
      samples = await (this.prisma as any).cryptoRateSample.findMany({
        where: { currencyCode: 'ADA', fetchedAt: { gte: windowCutoff } },
        orderBy: { fetchedAt: 'asc' },
        select: { lovelacePerUsd: true, fetchedAt: true },
      });
    } catch {
      /* table may not exist yet */
    }

    if (samples.length === 0) {
      return {
        rate: this.getFallbackRate(),
        sampleCount: 0,
        twaWindowSeconds,
        usingFallback: true,
      };
    }

    const now = Date.now();
    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < samples.length; i++) {
      const sampleTime = samples[i].fetchedAt.getTime();
      const nextTime =
        i + 1 < samples.length ? samples[i + 1].fetchedAt.getTime() : now;
      const weight = nextTime - sampleTime;
      weightedSum += Number(samples[i].lovelacePerUsd) * weight;
      totalWeight += weight;
    }

    const twa =
      totalWeight > 0
        ? Math.round(weightedSum / totalWeight)
        : Number(samples[samples.length - 1].lovelacePerUsd);

    return { rate: twa, sampleCount: samples.length, twaWindowSeconds, usingFallback: false };
  }

  private getFallbackRate(): number {
    const envVal = process.env.LOVELACE_PER_USD;
    if (envVal) {
      const parsed = parseInt(envVal, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return FALLBACK_LOVELACE_PER_USD;
  }
}
