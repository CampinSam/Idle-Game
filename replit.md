# Derp Universe

## Overview
Derp Universe is a season-based idle strategy RPG designed for a persistent world with strategic gameplay. The project aims to provide a rich gaming experience through a scalable and maintainable modern tech stack, supporting continuous content development and growth.

## User Preferences
- Frontend on port 5000, backend on port 3001
- Development workflow with hot reload (Vite HMR + NestJS watch mode)
- Mobile-first RPG game UI style inspired by idle strategy games
- Always update admin-schemas.md and definition-schemas.json to document changes
- Always prefer to combine and update existing code and functions over create mostly duplicate code
- Always use the sever for data authority while the frontend simply displays data or does very minor calculations. All formulaic updates should only exist server side
- Always remove legacy code instead of creating fallbacks. When you do this, make sure to implement proper error handling

## System Architecture
The project is structured as a pnpm monorepo, comprising a React+Vite frontend, a NestJS backend, and shared TypeScript packages. The backend serves both the API and the built frontend static files in production.

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
- **Navigation**: Floating bottom navigation bar with SVG icons (Home, Missions, Entities, Items, Outpost, Store), active item indicator with glow and tap scale micro-interaction.
- **Theme**: Dark purple RPG style with gradients and glowing accents, radial gradient depth layer, and SVG noise texture overlay.
- **Typography**: Cinzel (serif) for headings, Exo 2 (sans-serif) for body text.
- **Styling**: TailwindCSS removed, replaced with plain CSS utility shim.
- **Performance**: Code splitting for page-level components and lazy-loaded admin pages.
- **Animations**: Page transitions with fade and rise, staggered card entry animations.
- **Skeletons**: Layout-accurate skeleton screens for main pages during disconnected state.
- **Home Screen**: Consolidates location production, missions, season events, and keeper status.
- **Inventory Screen**: Category filter tabs, scrollable card grid with rarity-based visuals, and detailed info panel.

**Blockchain Wallet System:**
- **DB Models**: `LinkedWallet` (userId, chain, address, isPrimary) and `WalletNonce` (chain, address, nonce, expiresAt) in `prisma/schema.prisma`.
- **Auth Endpoints**: `POST /auth/wallet/nonce` → challenge; `POST /auth/wallet/verify` → sign-in or new account; `POST /auth/wallet/link` (JWT-guarded) → link wallet to existing account.
- **Wallet Management**: `GET/DELETE /player/wallets`, `POST /player/wallets/:id/primary`.
- **NFT Ownership Service**: `apps/api/src/modules/nft/` — `CardanoOwnershipProvider` (Blockfrost), `EvmOwnershipProvider` (Alchemy), `NftOwnershipService` (chain router). Requires `BLOCKFROST_API_KEY` + `ALCHEMY_API_KEY` secrets.
- **Frontend**: `useWalletConnect` hook, `walletAuth.ts` utils, wallet buttons on Login/Register (hidden when no wallets detected), Profile page at `/profile` with Account + Wallets tabs (add/remove/set-primary).
- **Supported chains**: CARDANO (CIP-30 browser wallets: nami, eternl, vespr, begin, flint, nufi, lace, yoroi), ETH, BASE, MATIC.
- **authSlice**: New `setAuth` action for wallet sign-in flow.
- **NFT Collection System**: `NftCollectionDef` DB model (chain + collectionId + entityDefinitionId); claim tracking via `Entity.nftAssetId` (format: `{chain}:{collectionId}:{assetId}`) + `Entity.nftCollectionDefId` — no separate claim table. `Entity.ownerUserId` is nullable: `null` = unclaimed pre-imported entity, non-null = claimed by that player. Admin endpoints `GET/POST/PUT/DELETE /nft/collections` + `POST /nft/collections/:id/import` (triggers background bulk import from chain); player endpoints `POST /nft/collections/sync` (lookup-and-assign claim) and `GET /nft/collections/entities`. Profile page has "NFT Entities" tab with Sync button. Seeded collection: `nft_cardano_dp` (Derp Birds, policy `e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0`, maps to `derp_bird` entity definition). **Pre-import model**: admin triggers import → all tokens fetched from Blockfrost, on-chain attributes mapped to entity traits/stats/display via `nft-entity-builder.ts`, stored ownerless. Claim = wallet sync finds matching `nftAssetId` entity with `ownerUserId: null` and assigns it to the player. `display.imageUrl` stores the IPFS URI. All NFT-specific logic is self-contained in `apps/api/src/modules/nft/` (`cardano-ownership.provider.ts`, `nft-entity-builder.ts`, `nft-collection.service.ts`).

**Core Systems & Features:**
- **Database**: PostgreSQL with Prisma ORM.
- **Definition/Instance Architecture**: Used for Entities (characters), Locations (player-owned areas), and Items, supporting attributes, progression, and state.
- **Level-Based Rules System**: Standardized JSON `rules` structure for level-based configurations across various definitions, supporting inheritance and diverse game mechanics.
- **Tick-Based Timing System**: Global tick system for game timers and a frontend React context-based tick engine.
- **Server-Authoritative Notifications**: Postgres-persisted notifications with grouping, pagination, and pruning.
- **Server-Driven Modal System (ModalSpecV1)**: Universal system for displaying dynamic modals constructed by the backend, supporting various content types and interactive actions. JobContext includes `team` (entity snapshots preserving `job.team` order) and `results.entityResults` (per-entity XP/level-up outcomes from mission completion). Modal templates can reference `${team.0.name}`, `${results.entityResults.0.leveledUp}`, etc.
- **Location Production & Consumption System**: Level-based production with dynamic storage and atomic resource claims. Buildings/rooms/locations can declare `consumption` entries in their level rules (same `ResourceEntry` format as `production`) and an `onStarve` behavior (`"starved"` for auto-restart, `"paused"` for manual re-enable). Settlement uses phased net-flow simulation: all buildings operate simultaneously, net flows offset, and exhaustion triggers starvation phases (capped at 50 iterations). The `storage` JSON on `LocationInstance` includes `productionBundles` (per-building breakdown with status), `consumptionRates`, and `netFlows`. Instance-level `onStarve` overrides in the `state` JSON take precedence over definition defaults.
- **Currency System**: Data-driven currencies with BigInt balances and audit trails.
- **Editor-Ready Balance System**: Extensive use of JSON fields in definitions for data-driven game balancing.
- **Unified Job System**: Single `Job` table for all timer-based activities.
- **DB-Backed Definitions**: `MissionDef` and `RecipeDef` as database models for flexible content.
- **Unified Outcome System**: Flexible JSON structure for all game outcomes, including rewards, effects, and seeded RNG.
- **Unified Requirement System**: Universal `operator` field for flexible comparisons across various requirement types.
- **Flag System**: Generic key-value variables on the User model for dynamic game state.
- **GameRulesService**: Centralized service for consistent game logic and rule evaluation.
- **Server-Authoritative Meta System**: Provides game enums and rules via API endpoints for consistent client-side logic.
- **Player Telemetry System**: Records player events for analytics and game system interactions (e.g., mission completion, gift claims).
- **Lootbox System**: Defines weighted outcome pools and manages item-based lootbox openings with deterministic seeded RNG.
- **Daily Check-In System**: Processes daily check-in tracks with configurable frequencies, streaks, and reward mechanisms.
- **Quest System**: Defines objectives based on player telemetry events, tracks progress, and manages reward claims.
- **Store System**: `ShopItemDef` DB model (tab, cost array, originalCost, contents, badge, limitedUntil). Costs and contents are arrays of `{ type: "currency"|"item", id, amount }` — supports mixed currency+item costs. `GET /shop/items` (JWT), admin CRUD at `/admin/shop/*`. `ShopPurchase` command handler in v1 pipeline. Frontend at `/store` with Featured/Currencies/Bundles/Items tabs, countdown timers for limited offers, GameIcon currency display, and a slide-up confirm bar. Seed data auto-created on first boot.
- **Context-Aware Gift System**: `GiftDef` definitions with `rewardSpec` and `presentation` snapshotted at gift creation. `createGiftForPlayer(userId, giftDefId, sourceType?, sourceId?, idempotencyKey?, contextData?)` accepts optional `contextData: Record<string, unknown>` snapshotted alongside `rewardSpec`. At claim time, `reward-spec-resolver.util.ts` resolves `${dotted.path}` tokens in the spec against the snapshotted `contextData`, plus `${random("a","b","c")}` for random selection. `EventService.dispatch()` auto-builds `{ job: {...} }` context when `sourceType` is a known job type (`MissionJob`, `CraftingJob`, `BuildingJob`) by looking up the job by `sourceId`. Event payloads can also include a `contextData` field for manual context. Check-in passes `{ checkin: { streak, trackId, day } }`. Admin endpoint accepts optional `contextData` body field. Reward types: `currency`, `item`, `entity`, `bundle`, `lootTable`, `cosmetic`. Resolver is a no-op when `contextData` is absent — fully backward-compatible.
- **Generic Effects System**: Universal modifier engine for all game systems. `EffectDef` (20 categories, 6 value modes, 7 duration models, 6 stacking rules) and `ActiveEffect` DB models. `EffectService` (global module) handles apply/remove/resolve/cleanup. `EffectResolver` aggregates active effects into `ResolvedModifier` (flatAdd, percentAdd, multiplier, stat maps, traits). `UseConsumable` command handler processes consumable items with effects (instant/timed/session). Integrated into: mission power/success/rewards (`mission.service.ts`), production rates (`location-settlement.service.ts`). Bootstrap includes `activeEffects` in snapshot. Admin CRUD via generic admin panel. 8 seeded effect definitions + 6 consumable item definitions. Shared types in `packages/shared/src/types/effects.ts` with `applyModifier`/`applyStatModifiers` helpers.

**Command/Delta/SSE Pipeline (v1 API):**
- **Infrastructure**: PubSubService, PlayerLockService, IdempotencyService for scalable and consistent command processing.
- **Commands**: Single `POST /v1/commands` endpoint for all player write operations, processed through a pipeline ensuring idempotency, locking, and delta persistence.
- **Query**: `GET /v1/bootstrap` for full player snapshot, `GET /v1/delta?since=<cursor>` for incremental patches.
- **Stream**: `GET /v1/stream` SSE endpoint for server-to-client push notifications and real-time delta updates.
- **Patch Format**: `{ op: "upsert"|"delete", entity: string, id: string, data?: any }`.
- **UiIntent Format**: `{ type: "modal"|"toast"|"navigate", ... }`.
- **Database Models**: `PlayerDelta` (append-only log), `IdempotencyKey`.

**Frontend Sync Layer:**
- **SyncEngine**: Manages bootstrap, SSE stream, delta fetching, patch application to Redux store, and reconnection.
- **syncSlice (Redux)**: Stores bootstrapped snapshot as entity tables and manages connection status and delta cursor.
- **useSyncSelectors**: Memoized selector hooks for reading synchronized data.
- **useCommand hook**: Sends commands, applies patches, and dispatches UI intents.
- **API Routing**: v1 endpoints use `/api/v1/*` via Vite proxy; SSE uses `/api/v1/stream?token=<jwt>`.

**Admin Panel:**
- **Dashboard**: Provides tools for player editing, game state manipulation, and testing.
- **Definition Editor**: Schema-aware editor for all definition tables, supporting CRUD, validation, and data management.
- **Modal Editor** (`/admin/modal-editor`): Dedicated editor for `modal_defs` — three collapsible stacked sections: (1) Editor with DB metadata, dismiss options, header, drag/drop body blocks (all 11 block types with per-type form fields; richText uses HTML textarea → `RichTextDoc` via DOMParser), and drag/drop buttons with full action editors; (2) Payload panel with JSON textarea, "Load recent jobs" (10 most recent via `GET /admin/jobs/recent`), and `TokenPathChips` component that flattens payload JSON to dot-notation paths as clickable chips copying `${path}` to clipboard; (3) Live Preview using actual `GameModal.css` + `BlockRenderer` components with client-side token resolution from payload JSON. Each block editor includes a `FromField` (purple-accented) for specifying a payload path that populates block data at resolve time.

**App Storage:**
- Replit App Storage for hosting art and media assets, served by the backend via `GET /media/*`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Prisma ORM**: Database toolkit.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **NestJS**: Backend framework.
- **pnpm**: Monorepo package manager.
- **@google-cloud/storage**: Object storage SDK.