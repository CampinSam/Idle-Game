# Derp Universe

## Overview
Derp Universe is a season-based idle strategy RPG designed for a persistent world with strategic gameplay. The project prioritizes scalability and maintainability, utilizing a modern tech stack to support ongoing content development and growth, aiming to deliver a rich gaming experience.

## User Preferences
- Frontend on port 5000, backend on port 3001
- Development workflow with hot reload (Vite HMR + NestJS watch mode)
- Mobile-first RPG game UI style inspired by idle strategy games

## System Architecture
The project is structured as a pnpm monorepo, encompassing a React+Vite frontend, a NestJS backend, and shared TypeScript packages. The backend serves both the API and the built frontend static files in production.

**Monorepo Structure:**
- `apps/web/`: React + Vite frontend
- `apps/api/`: NestJS backend
- `packages/shared/`: Shared TypeScript types/constants
- `packages/math/`: Shared math utilities

**Key Technical Decisions:**
- Shared packages are pre-built to JavaScript.
- API binds to `0.0.0.0:3001` and Frontend to `0.0.0.0:5000` with `allowedHosts: true`.
- CORS is enabled for all origins on the API.
- A `start.sh` script orchestrates build and startup.

**UI/UX Design:**
- **Navigation**: Floating bottom navigation bar with SVG icons (Home, Missions, Entities, Items, Outpost).
- **Theme**: Dark purple RPG style with gradients and glowing accents.
- **Home screen**: Consolidates location production, missions, season events, and keeper status.
- **Inventory screen**: Category filter tabs, scrollable card grid with rarity-based visuals, item icon, quantity, and detailed info panel on click.

**Core Systems & Features:**
- **Database**: PostgreSQL with Prisma ORM.
- **Entity System**: Definition/instance architecture for player-owned characters (entities) with stats, traits, progression, and equipment. Features 7 body slots with distinct trait archetypes. Code uses `Entity` naming throughout (EntityStats, EntityArchetype, EntityTraits, etc.).
- **Location System**: Definition/instance architecture for player-owned locations, including production profiles, buildings, rooms, and worker assignments. Rooms are nested within buildings, and all instances have an `enabled` toggle affecting resource generation.
- **Unified Level-Based Rules System**: All definitions (Location, Building, Room) use a standardized `rules` JSON structure for level-based configurations, supporting inheritance and defining workers, buildings, storage, production, costs, effects, and timers.
- **Tick-Based Timing System**: Global tick system for game timers, with a frontend React context-based tick engine for UI updates.
- **Notification System**: Server-authoritative, Postgres-persisted notifications with grouping, pagination, and pruning. Mission readiness and completion trigger server-side notifications.
- **Server-Driven Modal System (ModalSpecV1)**: Universal modal system replacing legacy JobModal/GiftModal. Backend constructs display specs via `GET /ui/modal`; frontend renders declaratively via `GameModal` + `GameModalHost` + `ModalContext`. All call sites (ToastOverlay, NotificationCenter, MissionsPage, HomePage) use `api.getModalSpec()` + `pushModal()`. Supports block renderers (richText, timer, progress, rewardsList, giftReveal, etc.), action routing (COMPLETE_JOB, CLAIM_GIFT, NAVIGATE, API_CALL), and follow-up modal chaining.
- **Inventory System**: Expanded definition/instance architecture for items, supporting rarity, binding, stat modifiers, effects, and dynamic state.
- **Location Production System**: Level-based production with lazy settlement, dynamic storage capacity computation, and atomic resource claims. Login triggers automatic recalculation of all user location production rates. Admin backfill endpoint `POST /admin/backfill/production-rates` recalculates all locations.
- **Currency System**: Data-driven currencies with BigInt balances and audit trails.
- **Editor-Ready Balance System**: Extensive use of JSON fields in definitions for data-driven game balancing, compatible with external admin tools.
- **Unified Job System**: Single `Job` table for all timer-based activities (missions, crafting, building).
- **DisplayDef System**: Universal display definition table for visual properties.
- **DB-Backed Definitions**: `MissionDef` and `RecipeDef` are database models replacing hardcoded constants.
- **Unified Outcome System**: Flexible JSON structure for all game outcomes (rewards, effects, text), with a central service for resolution, including bundles, odds, and seeded RNG.
- **Unified Requirement System**: Universal `operator` field for flexible comparisons across various requirement types (e.g., `keeper_level`, `has_building`).
- **Flag System**: Generic key-value variables on the User model for dynamic game state.
- **GameRulesService**: Centralized service for consistent game logic and rule evaluation.
- **Server-Authoritative Meta System**: MetaModule serves all game enums and rules via `/meta/enums` and `/meta/rules` endpoints. Admin editor fetches these via EnumsContext.
- **Player Telemetry System**: `TelemetryModule` provides `TelemetryService.record(userId, eventType, key?, amount, data?, tx)` which writes `PlayerEvent` rows and synchronously calls all registered `TelemetrySubscriber` implementations. Subscribers register via `registerSubscriber()` in their `onModuleInit`. Event types defined in `packages/shared/src/constants/telemetry.ts`. Currently wired into: mission completion (`mission_complete` with `{outcome}`), gift claims (`gift_claimed`), lootbox opens (`lootbox_opened`), and check-in completions (`checkin_completed`).
- **Lootbox System**: `LootboxDef` defines weighted outcome pools (same format as MissionDef rewards). Items with `type=LOOTBOX` reference a `LootboxDef` via `data.lootboxDefId`. `OpenLootBox` command validates item ownership, rolls outcomes using deterministic seeded RNG (seed = `itemInstanceId + userId`), grants rewards, removes item, and returns a modal. Gift `rewardSpec` supports `lootTable` variant to issue lootbox items. Gifts with `instant: false` create a `GIFT_PACKAGE` item instead of immediately resolving rewards; opened via `OpenGiftPackage` command.
- **Entity Gift Overrides**: Gift `rewardSpec` type `entity` supports optional `overrides: { name?, level?, traits?, stats? }` which are deep-merged after `generateEntityData` before entity creation.
- **Daily Check-In System**: `CheckInModule` provides `CheckInService.autoCheck(userId)` which processes all enabled `CheckInDef` tracks per player. Auto-fires on login (in `AuthService`) and on bootstrap (in `QueryService`). Each track independently computes windows elapsed since `lastClaimedAt` using configurable `frequency` (`daily`, `every_x_days`, `weekly`, `monthly`). `requireStreak: true` resets streak on missed windows. `allowReclaim: true` allows re-issuing day-0 gift after reset. Issues gifts via `GiftService.createGiftForPlayer` with idempotency keys. Check-in instances sync to frontend via `checkins` entity table.
- **Quest System (backend + sync only)**: `QuestModule` provides `QuestService` implementing `TelemetrySubscriber`. `QuestDef` defines objectives as `{ eventType, key?, target, description, dataFilter? }` — `dataFilter` shallow-matches against `PlayerEvent.data` (e.g. only count `mission_complete` events with `{outcome:'success'}`). `processEvent` advances matching objectives and auto-completes quests firing a notification. `ClaimQuestReward` command delivers rewards and handles repeatable quest reset. Quest instances sync to frontend via `quests` entity table.

**Command/Delta/SSE Pipeline (v1 API):**
- **InfrastructureModule**: PubSubService (InMemory + Redis stub for scaling), PlayerLockService (per-player row-level locking via SELECT FOR UPDATE), IdempotencyService (SHA-256 request hashing, replay detection).
- **CommandsModule**: Single `POST /v1/commands` endpoint. All player writes go through CommandService pipeline: idempotency check → per-player lock → handler execution → delta persistence → response. Commands return patches + UI intents + cursor. CommandRouter maps command types to 18 handlers: ExampleTestCommand, ClaimReward, StartMission, CompleteMission, StartCrafting, CollectCrafting, ClaimLocation, BuildBuilding, CompleteBuilding, UpgradeBuilding, AssignWorker, RemoveWorker, ToggleLocation, ToggleBuilding, ToggleRoom, OpenGiftPackage, OpenLootBox, ClaimQuestReward. PatchBuilder utility generates consistent delta patches from service results.
- **QueryModule**: `GET /v1/bootstrap` returns full player snapshot with delta cursor. `GET /v1/delta?since=<cursor>` returns incremental patches since cursor, or `{ resetRequired: true }` if cursor is too old.
- **StreamModule**: `GET /v1/stream` SSE endpoint for server→client push. Sends hello event on connect, replays missed deltas via cursor/Last-Event-ID, heartbeat every 15s, publishes `delta.available` events when new deltas are created. Supports token query param auth for EventSource compatibility.
- **Patch Format**: `{ op: "upsert"|"delete", entity: string, id: string, data?: any }`.
- **UiIntent Format**: `{ type: "modal"|"toast"|"navigate", ... }`.
- **Database Models**: `PlayerDelta` (append-only delta log), `IdempotencyKey` (with commandType field for command pipeline).

**Frontend Sync Layer (Migration Complete):**
- **SyncEngine** (`services/SyncEngine.ts`): Manages full lifecycle — bootstrap on login, SSE stream with heartbeat monitoring, delta fetching, patch application to Redux store, and exponential backoff reconnection.
- **syncSlice** (`store/syncSlice.ts`): Redux slice holding bootstrapped snapshot as entity tables (player, entities, locations, buildings, rooms, items, jobs, notifications, currencies, missions, quests, checkins), connection status, and delta cursor. Supports `setSnapshot` (from bootstrap) and `applyPatches` (incremental upsert/delete) reducers.
- **useSyncSelectors** (`hooks/useSyncSelectors.ts`): Memoized selector hooks (useSyncPlayer, useSyncEntities, useSyncLocations, useSyncBuildings, useSyncRooms, useSyncItems, useSyncJobs, useSyncNotifications, useSyncMissions, useSyncCurrencyBalances, useSyncActiveMissions, useSyncActiveCraftingJobs, useSyncQuests, useSyncCheckIns) for reading sync data as arrays with stable references.
- **Migration Status**: All pages read instance data from syncSlice. All write operations (missions, crafting, locations) now go through the command pipeline via useCommand hook. Definition data (missionDefs, recipeDefs, itemDefs) stays in gameSlice as read-only fetches. GameModalHost also uses command pipeline for COMPLETE_JOB actions. Legacy write thunks (startMission, startCrafting, collectCrafting, fetchActiveMissions, fetchActiveCraftingJobs) have been removed from gameSlice.
- **useSyncEngine** hook: Initializes SyncEngine after auth completes (gates on `initializing` flag), cleans up on logout.
- **useCommand** hook: Sends commands via `POST /v1/commands` with auto-generated idempotency keys, applies response patches locally, and dispatches UI intents (toasts, modals, navigation).
- **API routing**: v1 endpoints use `/api/v1/*` path through Vite's `/api` proxy (strips prefix → `/v1/*` reaches NestJS). SSE uses `/api/v1/stream?token=<jwt>` directly since EventSource can't set custom headers.
- **Known Future Work**: Legacy REST endpoints still exist on backend (for backward compat); can be deprecated after full validation. Gift claiming still uses legacy REST pattern (not yet migrated to commands).
- **Frontend Sync Migration Status (complete)**: All instance data is read exclusively from syncSlice. Eliminated: REST polling for notifications (NotificationContext now derives from syncSlice), REST fetch for entity detail (EntityDetailPage), REST job lookup in useCollectJob and GameModalHost COMPLETE_JOB handler. Remaining justified REST calls: `getAvailableBuildings` (server-computed requirement check), `getActiveBoosts` (not yet in sync pipeline), `getTickInfo` (infra state), write operations, and definition fetches (gameSlice).

**Admin Panel:**
- **Dashboard**: `/admin` provides tools for player editing, tick boosts, testing notifications, events, and gifts.
- **Definition Editor**: `/admin/def` offers a rich, schema-aware editor for all 20 definition tables, enabling real-time CRUD operations, validation, and data export/import. Authenticated via `X-Admin-Key`.

**API Routes:**
Comprehensive API endpoints support all core game functionalities, including authentication, player data, game entities, and admin operations.

**App Storage:**
- Integration with Replit App Storage for hosting art and media assets.
- Backend serves these files via `GET /media/*`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Prisma ORM**: Database toolkit.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **NestJS**: Backend framework.
- **pnpm**: Monorepo package manager.
- **@google-cloud/storage**: Object storage SDK.