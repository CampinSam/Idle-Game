---
name: UUID PK migration pattern
description: How UUID PK migrations work across service lookups, seed-sync, and crypto-wallet for economy tables.
---

## The pattern
When migrating a Prisma model from slug PK to UUID PK:
1. Add `key String @unique` to the model (old slug value preserved here).
2. Migration SQL: add uuid + key columns, swap PK to uuid, drop temp uuid col.
3. Service lookups that receive user/admin-supplied slugs must use `OR: [{ id }, { key }]` or `where: { key }`.
4. Map-building code that looks up by slug must build maps keyed by `d.key`, not `d.id`.

## Completed tables (Phase 1)
- `Currency` (migration 20260614000003)
- `LootboxDef` (migration 20260614000003)
- `BundleDef` (migration 20260614000003)
- `ItemDefinition` (migration 20260614000003)

## ADA currency UUID caching
`CryptoWalletService.getAdaUuid()` caches the ADA currency UUID from the DB (looked up by `key: 'ada'`). Every method that needs ADA UUID must call `const adaUuid = await this.getAdaUuid()` at method scope. Never use the ADA_CURRENCY_ID constant (removed).

## seed-sync.service.ts wiring (for each new UUID-PK table)
- `TABLE_TRANSFORMS`: strip `id`, ensure `key` is populated from `id` if absent.
- `TABLE_WHERE`: `(r) => ({ key: r.key })`.
- `SEED_TABLE_ORDER`: tables referenced by FK must come BEFORE the referencing table.
- Special case in `upsertTable`: if the table has FK slugs pointing to another UUID-PK table, resolve slug → UUID before upsert (see `itemDefinition` → `lootboxDefId` pattern).

## prisma migrate dev shadow DB workaround
`migrate dev` fails on this codebase due to old migrations referencing tables in ways the shadow DB can't replay cleanly. Use `prisma migrate deploy` to apply newly-created migration SQL files directly to the real DB without shadow DB.

**Why:** Shadow DB starts from scratch and replays all migrations; older migrations have hard dependencies that don't exist in a fresh DB. Production path (deploy) skips shadow DB.

**How to apply:** Write migration SQL manually → `prisma migrate deploy` → `pnpm prisma generate`.
