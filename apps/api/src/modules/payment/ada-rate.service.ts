import { Injectable, Logger } from '@nestjs/common';

// Default fallback: 1 ADA = $0.50 → 2_000_000 lovelaces per USD
const FALLBACK_LOVELACE_PER_USD = 2_000_000;
const CACHE_TTL_MS = 60_000;
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd';

@Injectable()
export class AdaRateService {
  private readonly logger = new Logger(AdaRateService.name);

  private cachedRate: number | null = null;
  private cacheExpiresAt = 0;

  /**
   * Returns lovelaces per 1 USD using the live ADA/USD rate.
   * Falls back to the hardcoded LOVELACE_PER_USD env var (or 2_000_000) if the
   * external API is unreachable or returns an unexpected payload.
   * Result is cached for 60 seconds to avoid per-request API calls.
   */
  async getLovelacePerUsd(): Promise<number> {
    const now = Date.now();

    if (this.cachedRate !== null && now < this.cacheExpiresAt) {
      return this.cachedRate;
    }

    try {
      const resp = await fetch(COINGECKO_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });

      if (!resp.ok) {
        throw new Error(`CoinGecko responded with HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as { cardano?: { usd?: number } };
      const adaUsd = data?.cardano?.usd;

      if (typeof adaUsd !== 'number' || adaUsd <= 0) {
        throw new Error(`Unexpected payload: ${JSON.stringify(data)}`);
      }

      const lovelacePerUsd = Math.round(1_000_000 / adaUsd);
      this.cachedRate = lovelacePerUsd;
      this.cacheExpiresAt = now + CACHE_TTL_MS;

      this.logger.log(
        `ADA/USD rate fetched: $${adaUsd} → ${lovelacePerUsd} lovelaces/USD`,
      );
      return lovelacePerUsd;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch live ADA/USD rate — falling back to hardcoded rate: ${err}`,
      );
      return this.getFallbackRate();
    }
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
