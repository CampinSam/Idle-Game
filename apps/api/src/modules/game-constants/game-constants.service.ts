import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SPD_TIMER_SCALE } from '@derp/math';

export const GAME_CONSTANT_KEYS = {
  SPD_TIMER_SCALE: 'spd_timer_scale',
} as const;

export const GAME_CONSTANT_DEFAULTS: Record<string, number> = {
  [GAME_CONSTANT_KEYS.SPD_TIMER_SCALE]: SPD_TIMER_SCALE,
};

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class GameConstantsService {
  private readonly logger = new Logger(GameConstantsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<number> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    try {
      const row = await (this.prisma as any).gameConstant.findUnique({ where: { key } });
      const value = row ? (row.value as number) : (GAME_CONSTANT_DEFAULTS[key] ?? 0);
      this.cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
      return value;
    } catch (err) {
      this.logger.warn(`Failed to load game constant "${key}", using default: ${err}`);
      const fallback = GAME_CONSTANT_DEFAULTS[key] ?? 0;
      this.cache.set(key, { value: fallback, expiresAt: now + CACHE_TTL_MS });
      return fallback;
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
