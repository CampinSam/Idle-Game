# CLAUDE.md — Derp Universe Implementation Reference

> This document describes the **actual implemented state** of the project as of the most recent development session.
> For high-level game design intent, see `replit.md`.

---

## Environment & Commands

| Thing | Detail |
|---|---|
| Frontend | `http://localhost:5000` (Vite + React) |
| Backend | `http://localhost:3001` (NestJS) |
| API proxy | Vite forwards `/api/*` → strips `/api` → NestJS |
| Package manager | `pnpm` (monorepo) |
| Database | PostgreSQL via Prisma ORM |
| Schema push | `cd apps/api && npx prisma db push` |
| Start | `bash /home/runner/workspace/start.sh` |

**Test accounts:** `test@derp.dev` / `test123456`, `test2@derp.dev` / `test123456`

**JWT secret:** `replit-dev-jwt-secret-change-in-production`

**Admin key header:** `x-admin-key: derp-admin-2026`

**Never clear** `apps/web/node_modules/.vite` — causes >120s cold start timeout.

---

## Monorepo Layout

```
apps/
  api/          NestJS backend (port 3001)
  web/          React + Vite frontend (port 5000)
packages/
  shared/       Shared TypeScript types and constants (pre-built to JS)
  math/         Deterministic math utilities (pre-built to JS)
prisma/
  schema.prisma Single source of truth for the database schema
```

---

## Critical Rules (Read First)

1. **All command handlers must use `ctx.tx`, never `this.prisma` directly.** Never pass `this.prisma` to `creditTx`, `addItemTx`, or any transactional helper.
2. **Prisma schema changes require a push.** Run `cd apps/api && npx prisma db push` after any `schema.prisma` change. Never change primary key ID column types — this breaks existing data.
3. **Notification updates inside transactions.** Service methods that update notifications must do so inside the `externalTx` path; handlers include them in patches via `pb.upsertNotification()`.
4. **Shared packages must be pre-built.** After editing `packages/shared` or `packages/math`, run `pnpm build` inside that package before the backend will pick up changes.
5. **Server-authoritative.** Client sends intent, server calculates everything. Client never determines success, rewards, or mission power.

---

## Command / Delta / SSE Pipeline

All player writes go through a single endpoint: `POST /v1/commands`.

### Flow

```
Client → POST /v1/commands
  → IdempotencyService (SHA-256 hash, replay detection)
  → PlayerLockService (per-player SELECT FOR UPDATE row lock)
  → CommandRouter (maps type → handler)
  → Handler executes inside a single Prisma transaction (ctx.tx)
  → PatchBuilder generates delta patches
  → PlayerDelta row appended (append-only log)
  → SSE stream pushes delta.available event
  → Client fetches GET /v1/delta?since=<cursor>
  → Redux syncSlice applies upsert/delete patches
```

### Registered Command Handlers (18 total)

`ExampleTestCommand`, `ClaimReward`, `StartMission`, `CompleteMission`, `StartCrafting`, `CollectCrafting`, `ClaimLocation`, `BuildBuilding`, `CompleteBuilding`, `UpgradeBuilding`, `AssignWorker`, `RemoveWorker`, `ToggleLocation`, `ToggleBuilding`, `ToggleRoom`, `OpenGiftPackage`, `OpenLootBox`, `ClaimQuestReward`

### Patch Format

```typescript
{ op: "upsert" | "delete", entity: string, id: string, data?: any }
```

### UiIntent Format

```typescript
{ type: "modal" | "toast" | "navigate", key: string, title: string, body: any, buttons: any[] }
```

Note: UiIntents from command responses use this flat shape — **not** the full ModalSpecV1 shape. The ModalSpecV1 shape is only used by `GET /ui/modal` and the server-driven modal system.

### Bootstrap / Delta Endpoints

- `GET /v1/bootstrap` — full player snapshot with cursor
- `GET /v1/delta?since=<cursor>` — incremental patches, or `{ resetRequired: true }` if cursor is stale
- `GET /v1/stream?token=<jwt>` — SSE; heartbeat every 15s; replays missed deltas on connect

---

## Frontend Sync Layer

**SyncEngine** (`apps/web/src/services/SyncEngine.ts`) manages the full lifecycle: bootstrap on login, SSE stream with heartbeat monitoring, delta fetching, and patch application to Redux.

**syncSlice** (`apps/web/src/store/syncSlice.ts`) holds entity tables as key-value maps:
`player`, `entities`, `locations`, `buildings`, `rooms`, `items`, `jobs`, `notifications`, `currencies`, `missions`, `quests`, `checkins`

**useSyncSelectors** (`apps/web/src/hooks/useSyncSelectors.ts`) — memoized hooks for reading sync data. Use these; do not read from syncSlice directly in components.

**useCommand** hook — sends commands via `POST /v1/commands`, applies response patches, dispatches UI intents (toasts, modals, navigation).

**Definition data** (missionDefs, recipeDefs, itemDefs) stays in gameSlice as read-only REST fetches — it does not flow through the delta pipeline.

---

## Rewards / Outcomes System

All reward resolution goes through `GameRulesService.resolveOutcomes()`.

### Return Shape

```typescript
{
  resolved: { entry: any; amount?: number }[],
  texts:    string[],
  flags:    { entry: any }[]
}
```

### Caller Contract

After calling `resolveOutcomes`, callers must:
1. Credit resolved rewards (currencies, items, XP) using their transactional helpers
2. If `flags.length > 0`, persist a **single** `prisma.user.update({ data: { flags: reqContext.userFlags } })` — do not re-fetch the user or apply flags entry-by-entry

The three callers that follow this pattern: mission completion, crafting collection, and lootbox opening handlers.

### Bundle Modes

**Standard bundle** — all children are resolved (subject to per-entry `odds`):
```json
{ "bundle": [ ... ] }
```

**X-of-Y bundle** — pick N items by weight without replacement. Triggered by the **presence** of `minChoices` or `maxChoices` (not their value):
```json
{
  "bundle": [ ... ],
  "minChoices": 1,
  "maxChoices": 3,
  "odds": 100
}
```
Count is rolled `rng.nextInt(minChoices, maxChoices)`, clamped to the pool size after requirement filtering. Weighted by each entry's `odds` field.

### Flag Entries

Flag operations are applied **in-place to `reqContext.userFlags`** during recursion so that subsequent requirements within the same resolution pass can see the updated value. They are collected separately in the `flags` array and must **not** be double-applied by callers.

```json
{ "type": "flag", "key": "myFlag", "operation": "increment", "value": 1, "odds": 50 }
```

Valid operations: `set`, `increment`, `decrement`, `invert`, `remove`.

---

## Server-Driven Modal System (ModalSpecV1)

Modals are constructed server-side and rendered declaratively by the frontend.

### Entry Point

`GET /ui/modal?type=<job|gift|notification>&id=<id>` → `UiService`

### ModalSpecV1 Shape

```typescript
{
  version:  1,
  id:       string,
  kind:     'mission' | 'crafting' | 'building' | 'gift' | 'notification',
  dismiss:  { backdrop: boolean, x: boolean, escape: boolean },
  header:   { title: string, subtitle?: string, icon?: { assetKey: string } },
  body:     ModalBlock[],
  buttons:  ModalButton[]
}
```

### Body Block Types

`richText`, `timer`, `progress`, `rewardsList`, `giftReveal`

### Button Action Types

`COMPLETE_JOB`, `CLAIM_GIFT`, `ACK_NOTIFICATION`, `NAVIGATE`, `API_CALL`, `CLOSE_MODAL`

### Frontend Rendering

`GameModal` + `GameModalHost` + `ModalContext`. All call sites use `api.getModalSpec()` + `pushModal()`.

---

## ModalDef System (Admin-Authored Modal Overrides)

`ModalDef` is a database-backed definition that allows admins to author custom modal content that overrides or augments the auto-generated modals for specific definitions.

### Database Model

```prisma
model ModalDef {
  id          String   @id
  name        String
  description String?
  version     Int      @default(1)
  spec        Json     @default("{}")
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("modal_defs")
}
```

### `spec` JSON Shape

```typescript
{
  header?:      { title?: string, subtitle?: string },
  body?:        ModalBlock[],   // prepended before generated body
  replaceBody?: boolean,        // if true, replaces generated body entirely
  buttons?:     ModalButton[]   // if non-empty, replaces generated buttons entirely
}
```

All fields are optional. Omitted fields fall back to generated values.

### Reference Fields Added to Definitions

| Model | Field | When applied |
|---|---|---|
| `MissionDef` | `activeModalDefId` | While mission job is active / ready |
| `MissionDef` | `completedModalDefId` | After mission is finished / collected |
| `RecipeDef` | `activeModalDefId` | While crafting job is active |
| `RecipeDef` | `completedModalDefId` | When crafting is collected |
| `BuildingDef` | `activeModalDefId` | While construction job is active |
| `BuildingDef` | `completedModalDefId` | When construction completes |
| `GiftDef` | `modalDefId` | Always (both unclaimed and claimed states) |

### Merge Logic (`UiService.mergeModalDefSpec`)

```typescript
// header fields are shallow-merged (spec wins per-field)
merged.header = { ...generated.header, ...spec.header };

// body: spec.body prepended before generated body by default
// spec.replaceBody === true replaces generated body entirely
merged.body = spec.replaceBody ? spec.body : [...spec.body, ...generated.body];

// buttons: spec.buttons replaces entirely if non-empty array
merged.buttons = (spec.buttons?.length > 0) ? spec.buttons : generated.buttons;
```

### UiService Helpers (private)

- `fetchJobDef(job)` — queries `missionDef`, `recipeDef`, or `buildingDef` based on `job.type`
- `resolveModalDef(id)` — fetches `modalDef`, checks `enabled`, returns `spec` or `null`
- `mergeModalDefSpec(generated, spec)` — applies the merge logic above

For gifts: `buildModalForGift` reads `snapshot.giftDefId` → fetches `GiftDef.modalDefId` → resolves and merges.

---

## Admin System

### Backend

`GET /admin/tables` — returns list of all editable tables (includes `modalDef`)

Generic CRUD routes for all definition tables:
- `GET /admin/:table` — list all
- `GET /admin/:table/:id` — get one
- `POST /admin/:table` — create
- `PUT /admin/:table/:id` — update
- `DELETE /admin/:table/:id` — delete

`admin.service.ts → getModel()` maps table names to Prisma model references. Any new definition table must be added here.

### Frontend Editor (`apps/web/src/features/admin/DerpAdminEditor.tsx`)

Two registries to keep in sync for any new table:
1. `TABLE_API_KEYS` — maps display name to Prisma model key (e.g. `ModalDef: 'modalDef'`)
2. `TABLE_SCHEMAS` — field definitions driving the editor form

Field types in schemas: `string`, `number`, `boolean`, `json`, `enum`, `ref`, `stringArray`, `levelRules`, `requirements`, `costObject`, `timer`, `giftPresentation`, `giftClaimRules`, `giftRewardSpec`

The `ref` field type takes a `refTable` property and renders a dropdown populated from that table. Example:
```typescript
modalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal' }
```

---

## Definition Tables (20 total)

`Currency`, `ItemDef`, `BodySchema`, `EquipmentSchema`, `ProgressionProfile`, `TraitDefinition`, `EntityDefinition`, `RegionDefinition`, `LocationDefinition`, `BuildingDef`, `RoomDef`, `DisplayDef`, `MissionCategoryDef`, `MissionDef`, `RecipeDef`, `EventDefinition`, `GiftDef`, `CheckInDef`, `QuestDef`, `ModalDef`

All definitions follow the pattern: admin CRUD via `/admin/:table`, JSON fields for data-driven config, `id` as a human-readable string key (not UUID), `enabled` boolean for soft-disabling.

---

## Major Feature Modules

### Entity System
Definition/instance architecture. 7 body slots with distinct trait archetypes. Code uses `Entity` naming throughout (`EntityStats`, `EntityArchetype`, `EntityTraits`, etc.).

### Location / Building / Room System
Nested: Locations contain Buildings contain Rooms. All instances have `enabled` toggle. All definitions use a unified `rules` JSON structure for level-based configurations (workers, storage, production, costs, effects, timers).

### Notification System
Server-authoritative, Postgres-persisted. Grouping, pagination, pruning. Mission readiness and completion trigger server-side notifications. Frontend derives notification state from syncSlice (no REST polling).

### Gift System
`GiftDef` defines presentation, claim rules, and reward spec. `GiftService.createGiftForPlayer` issues instances with idempotency keys. `instant: false` on a gift's reward spec creates a `GIFT_PACKAGE` item instead of resolving rewards immediately. Opened via `OpenGiftPackage` command.

Gift `rewardSpec` supports:
- `lootTable` variant — issues a lootbox item
- `entity` variant — supports `overrides: { name?, level?, traits?, stats? }` deep-merged after entity generation

### Lootbox System
`LootboxDef` defines weighted outcome pools. Items with `type=LOOTBOX` reference a `LootboxDef` via `data.lootboxDefId`. `OpenLootBox` command rolls outcomes using seeded RNG (seed = `itemInstanceId + userId`), grants rewards, removes item, returns a modal.

### Daily Check-In System
`CheckInModule` / `CheckInService.autoCheck(userId)`. Auto-fires on login and bootstrap. Each track independently computes windows elapsed since `lastClaimedAt`. Configurable `frequency` (`daily`, `every_x_days`, `weekly`, `monthly`). `requireStreak: true` resets on missed windows. Issues gifts via `GiftService.createGiftForPlayer` with idempotency keys. Instances sync to frontend via `checkins` entity table.

### Quest System
`QuestModule` implements `TelemetrySubscriber`. Objectives: `{ eventType, key?, target, description, dataFilter? }`. `dataFilter` shallow-matches `PlayerEvent.data`. Auto-completes quests on objective completion, fires a notification. `ClaimQuestReward` command delivers rewards and handles repeatable quest reset. Instances sync via `quests` entity table.

### Telemetry System
`TelemetryService.record(userId, eventType, key?, amount, data?, tx)` writes `PlayerEvent` rows and calls all registered `TelemetrySubscriber` implementations synchronously. Subscribers register via `registerSubscriber()` in `onModuleInit`. Event types in `packages/shared/src/constants/telemetry.ts`.

Currently wired: mission completion (`mission_complete`, `{outcome}`), gift claims (`gift_claimed`), lootbox opens (`lootbox_opened`), check-in completions (`checkin_completed`).

### Location Production System
Level-based production with lazy settlement, dynamic storage capacity computation, and atomic resource claims. Login triggers recalculation of all user location production rates. Admin backfill: `POST /admin/backfill/production-rates`.

### Currency System
Data-driven currencies with BigInt balances and audit trails via `CurrencyModule`.

### Tick System
Global tick system for game timers. Frontend React context-based tick engine for UI updates (`getTickInfo` endpoint, `TickContext`).

---

## Requirement System

All requirements follow a unified format:
```json
{ "type": "keeper_level", "value": 5, "operator": "gte" }
```

Valid `type` values: `keeper_level`, `team_size`, `trait`, `has_building`, `flag`, and others. The `operator` field enables flexible comparisons: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `exists`. Defaults to `gte` for numeric types, `eq` for flags.

---

## Flag System

`User.flags` is a `Json` field (key-value store) for dynamic game state per player.

`RequirementContext` carries a live `userFlags` reference that is mutated in-place by `resolveOutcomes` during reward resolution. This allows later entries in the same resolution pass to see flag changes made by earlier entries. Callers persist the final state with a single `user.update`.

---

## MetaModule

`GET /meta/enums` — all game enums  
`GET /meta/rules` — all game rules

Frontend `EnumsContext` fetches these on load. Admin editor uses them for enum dropdowns.

---

## App Storage (Media)

Replit Object Storage integration (`javascript_object_storage`). Backend serves stored files via `GET /media/*`. Art and icon assets live in object storage, referenced by `assetKey` strings in definition data.

---

## Prisma Conventions

- Definition tables: `id String @id` (human-readable slug, e.g. `"mission_patrol_basic"`)
- Instance tables: `id String @id @default(uuid())`
- JSON columns for flexible data: `data Json @default("{}")`, `rules Json @default("{}")`
- All models have `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
- New Prisma models accessed in NestJS before client regeneration should use `(this.prisma as any).modelName` until `npx prisma generate` is run

---

## Adding a New Definition Table — Checklist

1. Add model to `prisma/schema.prisma`
2. Run `cd apps/api && npx prisma db push`
3. Add to `admin.service.ts → getModel()`
4. Add name to the tables array in `admin.controller.ts`
5. Add `TableName: 'tableName'` to `TABLE_API_KEYS` in `DerpAdminEditor.tsx`
6. Add schema entry to `TABLE_SCHEMAS` in `DerpAdminEditor.tsx`
7. Update `replit.md` definition tables list

---

## Adding a New Command Handler — Checklist

1. Create handler file in `apps/api/src/modules/commands/handlers/`
2. Handler class implements the handler interface, uses `ctx.tx` exclusively (never `this.prisma`)
3. Register in `CommandRouter` (`commands.module.ts`)
4. Add command type string to `packages/shared`
5. Add `useCommand` call on the frontend with the command type

---

## Known Justified REST Calls (Not in Command Pipeline)

These REST calls remain intentional and are not migration targets:
- `GET /locations/:id/available-buildings` — server-computed requirement check
- `GET /tick/boosts` (active boosts) — not yet in sync pipeline
- `GET /tick/current` — infra state for frontend tick engine
- All definition fetches (gameSlice) — read-only, infrequently changing

Legacy write endpoints still exist on the backend for backward compatibility but are deprecated in favor of commands.
