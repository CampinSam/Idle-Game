import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * All known game definition table names. This union is the typed key used
 * for every cache getter and invalidation call. Extend it when a new
 * definition table is added to the admin panel.
 */
export type DefinitionType =
  | 'missionDef'
  | 'recipeDef'
  | 'buildingDef'
  | 'roomDef'
  | 'currency'
  | 'itemDef'
  | 'displayDef'
  | 'missionCategoryDef'
  | 'entityDefinition'
  | 'regionDefinition'
  | 'locationDefinition'
  | 'eventDefinition'
  | 'giftDef'
  | 'lootboxDef'
  | 'unlockDef'
  | 'bundleDef'
  | 'checkInDef'
  | 'questDef'
  | 'shopItemDef'
  | 'shopTabDef'
  | 'shopSectionDef'
  | 'shopHeroDef'
  | 'nftCollectionDef'
  | 'modalDef'
  | 'defaultModalDef'
  | 'effectDef'
  | 'tagDef'
  | 'visualEffectDef'
  | 'season'
  | 'homeBannerDef'
  | 'systemIconDef'
  | 'selectionRuleDef'
  | 'synergyRule'
  | 'telemetryDef'
  | 'gameDefinition'
  | 'cryptoRateConfig'
  | 'powerDef'
  | 'gameConstant';

const ALL_TYPES: DefinitionType[] = [
  'missionDef', 'recipeDef', 'buildingDef', 'roomDef', 'currency',
  'itemDef', 'displayDef', 'missionCategoryDef', 'entityDefinition',
  'regionDefinition', 'locationDefinition', 'eventDefinition', 'giftDef',
  'lootboxDef', 'unlockDef', 'bundleDef', 'checkInDef', 'questDef',
  'shopItemDef', 'shopTabDef', 'shopSectionDef', 'shopHeroDef',
  'nftCollectionDef', 'modalDef', 'defaultModalDef', 'effectDef',
  'tagDef', 'visualEffectDef', 'season', 'homeBannerDef', 'systemIconDef',
  'selectionRuleDef', 'synergyRule', 'telemetryDef', 'gameDefinition',
  'cryptoRateConfig', 'powerDef', 'gameConstant',
];

interface TypeStore {
  /** Primary lookup: id → record */
  byId: Map<string, any>;
  /** Secondary lookup: key slug → record (empty for tables without a key column) */
  byKey: Map<string, any>;
  loadedAt: number;
}

/**
 * Global in-process definition cache.
 *
 * All game definition tables are read-only during normal gameplay — they only
 * change when an admin edits content. This service caches every definition
 * table into a pair of `Map` instances (keyed by `id` and by `key`) so that
 * gameplay-time lookups are O(1) with zero DB round-trips.
 *
 * ## Lifecycle
 * - Eager: all tables are loaded at `onModuleInit`. NestJS guarantees this
 *   completes before any request handler runs, making all getters
 *   synchronous and safe to call without `await`.
 * - Invalidation: admin CRUD calls `invalidate(type)` after every
 *   create/update/delete. The store is rebuilt from the DB within
 *   milliseconds of a content change.
 *
 * ## Usage
 * ```typescript
 * // Synchronous — no await needed after module init
 * const def = this.definitionCache.get('missionDef', job.defId);
 * const all = this.definitionCache.getAll('giftDef');
 * ```
 *
 * ## Injection
 * The module is `@Global()` — inject `DefinitionCacheService` directly
 * without adding `DefinitionCacheModule` to any module's imports.
 */
@Injectable()
export class DefinitionCacheService implements OnModuleInit {
  private readonly logger = new Logger(DefinitionCacheService.name);
  private readonly stores = new Map<DefinitionType, TypeStore>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await Promise.allSettled(
      ALL_TYPES.map((type) =>
        this.reload(type).catch((err) =>
          this.logger.warn(`Definition cache warm failed for ${type}: ${err}`),
        ),
      ),
    );
    this.logger.log(`Definition cache warmed: ${this.stores.size} tables loaded`);
  }

  // ─────────────────────────────────────────────────────────
  // Public synchronous API (safe after onModuleInit resolves)
  // ─────────────────────────────────────────────────────────

  /**
   * Returns the definition record matching `idOrKey` from the given table.
   * Matches on the `id` field first, then the `key` slug field.
   * Returns `null` if not found or if the table has not been loaded.
   */
  get(type: DefinitionType, idOrKey: string): any | null {
    const store = this.stores.get(type);
    if (!store) return null;
    return store.byId.get(idOrKey) ?? store.byKey.get(idOrKey) ?? null;
  }

  /**
   * Returns all records for the given definition table in insertion order.
   * Returns `[]` if the table has not been loaded.
   */
  getAll(type: DefinitionType): any[] {
    const store = this.stores.get(type);
    if (!store) return [];
    return [...store.byId.values()];
  }

  // ─────────────────────────────────────────────────────────
  // Admin invalidation (typed, best-effort, async)
  // ─────────────────────────────────────────────────────────

  /**
   * Clears the cached store for `type` and reloads it from the DB.
   * Called by `AdminService` after every create/update/delete on a definition
   * table. Non-fatal: a reload failure is logged but does not surface to the
   * admin caller — the stale (or now-empty) cache will re-load on the next
   * invalidation cycle.
   */
  async invalidate(type: DefinitionType): Promise<void> {
    this.stores.delete(type);
    try {
      await this.reload(type);
      this.logger.log(`Definition cache reloaded: ${type}`);
    } catch (err) {
      this.logger.warn(`Definition cache reload failed for ${type}: ${err}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────

  private async reload(type: DefinitionType): Promise<void> {
    const model = this.resolveModel(type);
    if (!model) {
      this.stores.set(type, { byId: new Map(), byKey: new Map(), loadedAt: Date.now() });
      return;
    }
    const records: any[] = await model.findMany();
    const byId = new Map<string, any>();
    const byKey = new Map<string, any>();
    for (const r of records) {
      if (r.id != null) byId.set(String(r.id), r);
      if (r.key != null) byKey.set(String(r.key), r);
    }
    this.stores.set(type, { byId, byKey, loadedAt: Date.now() });
  }

  /** Maps `DefinitionType` → the corresponding Prisma model handle. */
  private resolveModel(type: DefinitionType): any | null {
    const p = this.prisma as any;
    const map: Record<DefinitionType, any> = {
      missionDef: p.missionDef,
      recipeDef: p.recipeDef,
      buildingDef: p.buildingDef,
      roomDef: p.roomDef,
      currency: p.currency,
      itemDef: p.itemDefinition,
      displayDef: p.displayDef,
      missionCategoryDef: p.missionCategoryDef,
      entityDefinition: p.entityDefinition,
      regionDefinition: p.regionDefinition,
      locationDefinition: p.locationDefinition,
      eventDefinition: p.eventDefinition,
      giftDef: p.giftDef,
      lootboxDef: p.lootboxDef,
      unlockDef: p.unlockDef,
      bundleDef: p.bundleDef,
      checkInDef: p.checkInDef,
      questDef: p.questDef,
      shopItemDef: p.shopItemDef,
      shopTabDef: p.shopTabDef,
      shopSectionDef: p.shopSectionDef,
      shopHeroDef: p.shopHeroDef,
      nftCollectionDef: p.nftCollectionDef,
      modalDef: p.modalDef,
      defaultModalDef: p.defaultModalDef,
      effectDef: p.effectDef,
      tagDef: p.tagDef,
      visualEffectDef: p.visualEffectDef,
      season: p.season,
      homeBannerDef: p.homeBannerDef,
      systemIconDef: p.systemIconDef,
      selectionRuleDef: p.selectionRuleDef,
      synergyRule: p.synergyRule,
      telemetryDef: p.telemetryDef,
      gameDefinition: p.gameDefinition,
      cryptoRateConfig: p.cryptoRateConfig,
      powerDef: p.powerDef,
      gameConstant: p.gameConstant,
    };
    return map[type] ?? null;
  }
}
