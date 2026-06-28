import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type BootstrapCatalogType =
  | 'tagDef'
  | 'visualEffectDef'
  | 'systemIconDef'
  | 'currency'
  | 'season';

const CATALOG_TYPES: BootstrapCatalogType[] = [
  'tagDef',
  'visualEffectDef',
  'systemIconDef',
  'currency',
  'season',
];

interface CacheEntry {
  data: any;
  loadedAt: number;
}

/**
 * Process-lifetime in-memory cache for bootstrap catalog tables.
 *
 * These tables (tagDef, visualEffectDef, systemIconDef, currency, season) are
 * read-only during normal gameplay — they only change when an admin edits
 * content. Caching them eliminates repeated DB round-trips on every player
 * bootstrap.
 *
 * Cache lifetime: indefinite by default (process-lifetime). An optional
 * BOOTSTRAP_CATALOG_TTL_MS env var enables time-based expiry for environments
 * that want a guaranteed refresh floor. In production, leave it unset and rely
 * on admin-driven invalidation via `invalidate(type)`.
 */
@Injectable()
export class BootstrapCacheService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapCacheService.name);
  private readonly cache = new Map<BootstrapCatalogType, CacheEntry>();
  private readonly ttlMs: number;

  constructor(private readonly prisma: PrismaService) {
    const raw = process.env.BOOTSTRAP_CATALOG_TTL_MS;
    this.ttlMs = raw ? parseInt(raw, 10) : 0;
  }

  async onModuleInit(): Promise<void> {
    try {
      await Promise.all(CATALOG_TYPES.map((type) => this.reload(type)));
      this.logger.log('Bootstrap catalog cache warmed');
    } catch (err) {
      this.logger.warn(`Bootstrap catalog cache warm failed: ${err}`);
    }
  }

  async get(type: BootstrapCatalogType): Promise<any> {
    const entry = this.cache.get(type);
    if (!entry || (this.ttlMs > 0 && Date.now() - entry.loadedAt > this.ttlMs)) {
      return this.reload(type);
    }
    return entry.data;
  }

  async invalidate(type: BootstrapCatalogType): Promise<void> {
    this.cache.delete(type);
    try {
      await this.reload(type);
      this.logger.log(`Bootstrap catalog cache reloaded: ${type}`);
    } catch (err) {
      this.logger.warn(`Bootstrap catalog cache reload failed for ${type}: ${err}`);
    }
  }

  private async reload(type: BootstrapCatalogType): Promise<any> {
    const data = await this.fetchFromDb(type);
    this.cache.set(type, { data, loadedAt: Date.now() });
    return data;
  }

  private async fetchFromDb(type: BootstrapCatalogType): Promise<any> {
    switch (type) {
      case 'tagDef':
        return (this.prisma as any).tagDef.findMany({
          where: { enabled: true },
          orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
        });
      case 'visualEffectDef':
        return (this.prisma as any).visualEffectDef.findMany({
          where: { enabled: true },
          orderBy: { sortOrder: 'asc' },
        });
      case 'systemIconDef':
        return (this.prisma as any).systemIconDef.findMany({
          orderBy: { id: 'asc' },
        });
      case 'currency':
        return this.prisma.currency.findMany({ select: { id: true } });
      case 'season':
        return this.prisma.season.findFirst({
          where: {
            status: 'active',
            startsAt: { lte: new Date() },
            endsAt: { gt: new Date() },
          },
          orderBy: { endsAt: 'asc' },
        });
    }
  }
}
