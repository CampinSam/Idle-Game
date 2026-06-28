import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Global in-process cache for all game definition tables.
 *
 * Definition tables (missionDef, itemDef, giftDef, etc.) are read-only during
 * normal gameplay — they only change when an admin edits content. Caching them
 * eliminates repeated DB round-trips on every player action and on every
 * tick-event-processor pass.
 *
 * Cache lifetime: indefinite by default (process-lifetime). The admin CRUD
 * handler calls `invalidate(table)` on every create/update/delete so the cache
 * reflects content changes within milliseconds. If the process restarts the
 * cache is rebuilt automatically at startup via `onModuleInit`.
 *
 * Usage:
 *   const def = await this.defCache.getById('missionDef', jobDefId);
 *   const all = await this.defCache.getAll('giftDef');
 */
@Injectable()
export class DefinitionCacheService implements OnModuleInit {
  private readonly logger = new Logger(DefinitionCacheService.name);

  /** Map from admin-table-name → array of all records */
  private readonly cache = new Map<string, any[]>();

  /** Map from admin-table-name → timestamp of last load */
  private readonly loadedAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache for the highest-frequency definition tables at startup.
    // Lower-frequency tables are lazily loaded on first access.
    const eagerly = [
      'missionDef',
      'itemDef',
      'giftDef',
      'lootboxDef',
      'effectDef',
      'entityDefinition',
      'locationDefinition',
      'questDef',
      'recipeDef',
      'buildingDef',
      'unlockDef',
      'checkInDef',
      'powerDef',
    ];
    await Promise.allSettled(
      eagerly.map((t) =>
        this.reload(t).catch((err) =>
          this.logger.warn(`Definition cache warm failed for ${t}: ${err}`),
        ),
      ),
    );
    this.logger.log('Definition cache warmed');
  }

  /**
   * Returns all records for the given definition table (cached).
   */
  async getAll(table: string): Promise<any[]> {
    if (!this.cache.has(table)) {
      return this.reload(table);
    }
    return this.cache.get(table)!;
  }

  /**
   * Returns a single record matching `id` from the given definition table.
   * Looks up the `id` field (UUID) or the `key` field.
   */
  async getById(table: string, id: string): Promise<any | null> {
    const all = await this.getAll(table);
    return all.find((r) => r.id === id || r.key === id) ?? null;
  }

  /**
   * Returns a single record matching the `key` field (slug) from the given
   * definition table. Falls back to matching `id` if no `key` field exists.
   */
  async getByKey(table: string, key: string): Promise<any | null> {
    const all = await this.getAll(table);
    return all.find((r) => r.key === key || r.id === key) ?? null;
  }

  /**
   * Invalidates the cache entry for the given table and reloads it from the DB.
   * Called by admin CRUD on every create/update/delete.
   */
  async invalidate(table: string): Promise<void> {
    this.cache.delete(table);
    this.loadedAt.delete(table);
    try {
      await this.reload(table);
      this.logger.log(`Definition cache reloaded: ${table}`);
    } catch (err) {
      // Non-fatal: the cache will re-load on the next access attempt.
      this.logger.warn(`Definition cache reload failed for ${table}: ${err}`);
    }
  }

  private async reload(table: string): Promise<any[]> {
    const model = this.resolveModel(table);
    if (!model) {
      // Unknown table — store empty so repeated misses don't hammer the logger.
      this.cache.set(table, []);
      return [];
    }
    const data: any[] = await model.findMany();
    this.cache.set(table, data);
    this.loadedAt.set(table, Date.now());
    return data;
  }

  /**
   * Maps admin table names to Prisma model handles.
   * Returns null for tables that are not definition tables or are unknown.
   */
  private resolveModel(table: string): any | null {
    const map: Record<string, any> = {
      missionDef: (this.prisma as any).missionDef,
      recipeDef: (this.prisma as any).recipeDef,
      buildingDef: (this.prisma as any).buildingDef,
      roomDef: (this.prisma as any).roomDef,
      currency: (this.prisma as any).currency,
      itemDef: (this.prisma as any).itemDefinition,
      displayDef: (this.prisma as any).displayDef,
      missionCategoryDef: (this.prisma as any).missionCategoryDef,
      entityDefinition: (this.prisma as any).entityDefinition,
      regionDefinition: (this.prisma as any).regionDefinition,
      locationDefinition: (this.prisma as any).locationDefinition,
      eventDefinition: (this.prisma as any).eventDefinition,
      giftDef: (this.prisma as any).giftDef,
      lootboxDef: (this.prisma as any).lootboxDef,
      unlockDef: (this.prisma as any).unlockDef,
      bundleDef: (this.prisma as any).bundleDef,
      checkInDef: (this.prisma as any).checkInDef,
      questDef: (this.prisma as any).questDef,
      shopItemDef: (this.prisma as any).shopItemDef,
      shopTabDef: (this.prisma as any).shopTabDef,
      shopSectionDef: (this.prisma as any).shopSectionDef,
      shopHeroDef: (this.prisma as any).shopHeroDef,
      nftCollectionDef: (this.prisma as any).nftCollectionDef,
      modalDef: (this.prisma as any).modalDef,
      defaultModalDef: (this.prisma as any).defaultModalDef,
      effectDef: (this.prisma as any).effectDef,
      tagDef: (this.prisma as any).tagDef,
      visualEffectDef: (this.prisma as any).visualEffectDef,
      season: (this.prisma as any).season,
      homeBannerDef: (this.prisma as any).homeBannerDef,
      systemIconDef: (this.prisma as any).systemIconDef,
      selectionRuleDef: (this.prisma as any).selectionRuleDef,
      synergyRule: (this.prisma as any).synergyRule,
      telemetryDef: (this.prisma as any).telemetryDef,
      gameDefinition: (this.prisma as any).gameDefinition,
      cryptoRateConfig: (this.prisma as any).cryptoRateConfig,
      powerDef: (this.prisma as any).powerDef,
      gameConstant: (this.prisma as any).gameConstant,
    };
    return map[table] ?? null;
  }
}
