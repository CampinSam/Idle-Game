import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const INITIAL_POLL_INTERVAL_MS = 300_000;
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd';

@Injectable()
export class AdaOraclePoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdaOraclePoller.name);
  private timeoutRef: NodeJS.Timeout | null = null;
  private currentIntervalMs = INITIAL_POLL_INTERVAL_MS;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await (this.prisma as any).cryptoRateConfig.upsert({
      where: { currencyCode: 'ADA' },
      create: {
        currencyCode: 'ADA',
        oracleUrl: DEFAULT_COINGECKO_URL,
        pollIntervalSeconds: 300,
        twaWindowSeconds: 3600,
        fallbackLovelacePerUsd: 2_000_000n,
        enabled: true,
      },
      update: {},
    });

    this.poll().catch((err) =>
      this.logger.warn(`Initial ADA oracle poll failed: ${err}`),
    );

    this.scheduleNext(INITIAL_POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }

  private scheduleNext(intervalMs: number) {
    if (this.timeoutRef) clearTimeout(this.timeoutRef);
    this.currentIntervalMs = intervalMs;
    this.timeoutRef = setTimeout(async () => {
      try {
        await this.poll();
      } catch (err) {
        this.logger.warn(`ADA oracle poll error: ${err}`);
      }
      const nextInterval = await this.getConfiguredIntervalMs();
      this.scheduleNext(nextInterval);
    }, intervalMs);
  }

  private async getConfiguredIntervalMs(): Promise<number> {
    try {
      const config = await (this.prisma as any).cryptoRateConfig.findUnique({
        where: { currencyCode: 'ADA' },
      });
      if (config?.pollIntervalSeconds > 0) {
        return config.pollIntervalSeconds * 1_000;
      }
    } catch { /* fall through */ }
    return INITIAL_POLL_INTERVAL_MS;
  }

  async poll(): Promise<void> {
    const config = await (this.prisma as any).cryptoRateConfig.findUnique({
      where: { currencyCode: 'ADA' },
    });
    if (!config?.enabled) return;

    try {
      const resp = await fetch(config.oracleUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}`);

      const data = (await resp.json()) as { cardano?: { usd?: number } };
      const adaUsd = data?.cardano?.usd;

      if (typeof adaUsd !== 'number' || adaUsd <= 0) {
        throw new Error(`Unexpected payload: ${JSON.stringify(data)}`);
      }

      const lovelacePerUsd = BigInt(Math.round(1_000_000 / adaUsd));

      await (this.prisma as any).cryptoRateSample.create({
        data: { currencyCode: 'ADA', usdPrice: adaUsd, lovelacePerUsd },
      });

      const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_MS);
      await (this.prisma as any).cryptoRateSample.deleteMany({
        where: { currencyCode: 'ADA', fetchedAt: { lt: cutoff } },
      });

      const newIntervalMs = config.pollIntervalSeconds * 1_000;
      if (newIntervalMs !== this.currentIntervalMs) {
        this.logger.log(
          `ADA oracle: poll interval changed to ${config.pollIntervalSeconds}s — rescheduling`,
        );
      }

      this.logger.log(
        `ADA oracle: $${adaUsd} → ${lovelacePerUsd.toLocaleString()} lovelaces/USD`,
      );
    } catch (err) {
      this.logger.warn(`ADA oracle poll failed — retaining previous TWA: ${err}`);
    }
  }
}
