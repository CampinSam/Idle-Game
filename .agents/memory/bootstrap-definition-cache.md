---
name: Bootstrap + definition cache architecture
description: Two in-process cache layers that eliminate repeated DB queries for definition and catalog tables during gameplay.
---

## DefinitionCacheService

**File:** `apps/api/src/modules/definition-cache/definition-cache.service.ts`
**Module:** `apps/api/src/modules/definition-cache/definition-cache.module.ts` — `@Global()`, imported by AppModule.

Caches all 38 definition tables using a typed `DefinitionType` union.

**Internal store:** `Map<DefinitionType, { byId: Map<string, any>; byKey: Map<string, any>; loadedAt: number }>` — O(1) lookups by both `id` and `key` fields.

**Lifecycle:**
- All 38 tables load eagerly at `onModuleInit` via `Promise.allSettled`. NestJS guarantees this completes before the first request handler runs.
- `get(type, idOrKey)` and `getAll(type)` are **synchronous** — no await needed after module init.
- `invalidate(type: DefinitionType)` is typed and async — called by AdminService after every create/update/delete.

**Injection:** `@Global()` — inject `DefinitionCacheService` directly without adding `DefinitionCacheModule` to any module's imports.

**Why typed DefinitionType:**
- Prevents misspelling table names at call sites
- Enables exhaustive handling in resolveModel()
- Makes invalidation calls unambiguous

## BootstrapCacheService

**File:** `apps/api/src/modules/query/bootstrap-cache.service.ts`

Caches 5 slow-changing catalog tables loaded on every player bootstrap: `tagDef`, `visualEffectDef`, `systemIconDef`, `currency`, `season`.

Registered in QueryModule (provided + exported). AdminModule imports QueryModule to inject it. Warms all 5 at `onModuleInit`.

## Admin invalidation

Both services are invalidated by `AdminService.createRecord/updateRecord/deleteRecord`. Best-effort: reload failure is logged but doesn't fail the admin save.

## Migrated gameplay paths

These definition queries were replaced with cache.get() / getAll():
- `mission.service.ts` — 4× missionDef.findFirst
- `crafting.service.ts` — 3× recipeDef.findFirst
- `gift.service.ts` — giftDef.findFirst (via resolveGiftSpec)
- `open-lootbox.handler.ts` — lootboxDef.findFirst
- `quest.service.ts` — questDef.findMany/findUnique (processEvent + getOrCreateInstance + getQuestProgress)
- `checkin.service.ts` — 2× checkInDef.findMany (ensureInstances + autoCheck)
- `tick-event-processor.service.ts` — missionDef.findFirst (processMultiPhaseMissionPhase)

Remaining DB queries on definition tables (acceptable — use relational includes or are admin/low-frequency paths):
- `getMissionDefinitions` — includes displayDef + missionCategoryDef relations
- `getMissionJobStats` — includes related defs for display
- `getRecipes` — includes displayDef relation
