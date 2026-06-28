---
name: Bootstrap + definition cache architecture
description: Two in-process cache layers that eliminate repeated DB queries for definition and catalog tables during gameplay.
---

## BootstrapCacheService

**File:** `apps/api/src/modules/query/bootstrap-cache.service.ts`

Caches five slow-changing catalog tables loaded on every player bootstrap:
`tagDef`, `visualEffectDef`, `systemIconDef`, `currency`, `season`

- Registered in `QueryModule` (provided + exported). AdminModule imports QueryModule to inject it.
- Warms all 5 tables at `onModuleInit`.
- `get(type)` returns cached data; reloads if TTL expired (default: no TTL = process-lifetime).
- `invalidate(type)` clears and reloads one table; called by AdminService after writes.
- Optional env var `BOOTSTRAP_CATALOG_TTL_MS` enables time-based expiry.

## DefinitionCacheService

**File:** `apps/api/src/modules/definition-cache/definition-cache.service.ts`
**Module:** `apps/api/src/modules/definition-cache/definition-cache.module.ts` — `@Global()`, imported by AppModule.

Caches ALL 30+ definition tables (missionDef, itemDef, giftDef, lootboxDef, effectDef, etc.).

- `@Global()` means no per-module import needed — inject `DefinitionCacheService` anywhere.
- API: `getAll(table)`, `getById(table, id)`, `getByKey(table, key)`, `invalidate(table)`.
- `getById` matches on `id` OR `key` field (handles slug-keyed defs).
- Eagerly warms the 13 highest-frequency tables at startup; all others load lazily.

## Admin invalidation

`AdminService.createRecord/updateRecord/deleteRecord` call both:
1. `bootstrapCache.invalidate(table)` — only for the 5 catalog types
2. `definitionCache.invalidate(table)` — for ALL definition tables

Both are best-effort (logged, swallowed) so a cache reload failure never fails an admin save.

**Why:** Keeps the caches fresh within milliseconds of a content change without needing a process restart.

## Entity serialization batching

`serializeEntityFull(tx, entity, preloadedItems?)` and `computeEquippedStats(tx, entity, preloadedItems?)` accept an optional preloaded Map<itemInstanceId, ItemInstance>. `QueryService.bootstrap` collects all equipped item IDs from all entities, fetches them in one `itemInstance.findMany`, then passes the map to every `serializeEntityFull` call — replacing N per-entity queries with 1.

## Tick processor fan-out

`processMultiPhaseMissionPhase` replaced `prisma.missionDef.findFirst` with `definitionCache.getById('missionDef', job.defId)`. The byUser loops in `processInjuryRecovery` and `processJobReadiness` were converted from serial `for...of` to `Promise.allSettled` — total latency = slowest single user.
