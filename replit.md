# Derp Universe

## Overview
Derp Universe is a season-based idle strategy RPG set in a persistent world, offering strategic gameplay. The project aims to provide a rich gaming experience through a scalable and maintainable modern tech stack, ensuring continuous content development and growth with a focus on continuous content development and growth.

## User Preferences
- Frontend on port 5000, backend on port 3001
- Development workflow with hot reload (Vite HMR + NestJS watch mode)
- Mobile-first RPG game UI style inspired by idle strategy games
- Always update admin-schemas.md and definition-schemas.json to document changes
- Always prefer to combine and update existing code and functions over create mostly duplicate code
- Always use the sever for data authority while the frontend simply displays data or does very minor calculations. All formulaic updates should only exist server side
- Always remove legacy code instead of creating fallbacks. When you do this, make sure to implement proper error handling
- **Development principles skill**: `.agents/skills/derp-dev-principles/SKILL.md` — load before any feature work, bug fix, or refactor

## System Architecture
The project is organized as a pnpm monorepo, integrating a React+Vite frontend, a NestJS backend, and shared TypeScript packages. The backend handles API services and serves static frontend files in production.

**Monorepo Structure:**
- `apps/web/`: React + Vite frontend
- `apps/api/`: NestJS backend
- `packages/shared/`: Shared TypeScript types/constants
- `packages/math/`: Shared math utilities

**Key Technical Decisions:**
- Shared packages are pre-built to JavaScript.
- API binds to `0.0.0.0:3001` and Frontend to `0.0.0.0:5000`.
- CORS is enabled for all origins on the API.
- A `start.sh` script automates build and startup processes.

**UI/UX Design:**
- **Navigation**: Floating bottom navigation bar with SVG icons.
- **Theme**: Dark purple RPG style with gradients, glowing accents, radial gradient depth, and SVG noise textures.
- **Typography**: Cinzel for headings, Exo 2 for body text.
- **Styling**: Plain CSS utility shim.
- **Performance**: Code splitting for page components, lazy-loaded admin pages, and layout-accurate skeleton screens.
- **Animations**: Page transitions with fade/rise and staggered card entry.
- **Unified controls bars**: Entities and Inventory pages share a consistent controls bar pattern (search input + filter dropdowns + sort dropdown) with localStorage persistence. When `showControls` is true on `EntityList` or `ItemList`, the bar replaces legacy tab strips. Legacy tabs remain available for other consumers (e.g. potion picker) via `showControls=false`.
- **Page layout model** (canonical — do not override per page):
  - Token: `--page-top-gap: 8px` defined in `Layout.css :root`. All page roots use `padding-top: var(--page-top-gap)`.
  - Horizontal gutter: `Layout.css .content` provides `padding: 60px 16px 80px`. No page-level horizontal padding or `max-width` overrides.
  - **Browser pages** (Entities, Inventory, Missions, Store): page root has `display:flex; flex-direction:column; flex:1; min-height:0`. Wrapper card also `flex:1; min-height:0; overflow:hidden` (or `overflow-y:auto`). Inner content area scrolls — nav bar always visible.
  - **Dashboard pages** (Home, Rewards, Locations, Profile, Settings, Entity Detail, Location Detail): free-flow, cards stack vertically. Global `.content` scroll handles overflow.

**Blockchain Wallet System:**
- **DB Models**: `LinkedWallet` and `WalletNonce` for user wallets and authentication.
- **Auth Endpoints**: Wallet-based login/registration and linking to existing accounts.
- **Wallet Management**: CRUD operations for player wallets, including setting primary wallets.
- **NFT Ownership Service**: Multi-chain NFT verification for Cardano (Blockfrost) and EVM chains (Alchemy).
- **Frontend**: `useWalletConnect` hook, wallet buttons, and a `/profile` page.
- **Supported chains**: CARDANO (CIP-30), ETH, BASE, MATIC.
- **NFT Collection System**: `NftCollectionDef` for tracking collections, supporting admin bulk imports and player-initiated syncs.

**Core Systems & Features:**
- **Database**: PostgreSQL with Prisma ORM.
- **Definition/Instance Architecture**: Used for Entities, Locations, and Items.
- **Level-Based Rules System**: Standardized JSON `rules` for configurable game mechanics.
- **Tick-Based Timing System**: Global and frontend-specific game timers.
- **Server-Authoritative Notifications**: Postgres-persisted notifications.
- **Server-Driven Modal System (ModalSpecV1)**: Dynamic backend-generated modals.
- **Location Production & Consumption System**: Level-based production with dynamic storage.
- **Currency System**: Data-driven currencies with BigInt balances and audit trails.
- **Editor-Ready Balance System**: JSON fields for data-driven game balancing.
- **Unified Job System**: Single `Job` table for all timer-based activities.
- **DB-Backed Definitions**: `MissionDef` and `RecipeDef` as database models.
- **Unified Outcome System**: Flexible JSON structure for game outcomes with canonical `min`/`max` shape.
- **Unified Requirement System**: Universal `operator` field for flexible requirement comparisons.
- **Flag System**: Generic key-value variables on the User model.
- **GameRulesService**: Centralized service for consistent game logic.
- **Server-Authoritative Meta System**: Provides game enums and rules via API.
- **Player Telemetry System**: Records player events for analytics.
- **Lootbox System**: Defines weighted outcome pools and manages openings.
- **Reusable Bundle Definitions (`BundleDef`)**: Named outcome bundles referenced by reward-bearing definitions.
- **Daily Check-In System**: Configurable daily check-in tracks with streaks and rewards.
- **Quest System**: Defines objectives based on player telemetry, tracks progress, and manages rewards. Supports daily, weekly, and one-off cadences.
- **Achievement System**: One-shot lifetime milestones with optional permanent bonuses on claim.
- **Store System**: `ShopItemDef` DB model for store items with flexible costs.
- **Context-Aware Gift System**: `GiftDef` definitions with dynamic `rewardSpec` resolution.
- **Generic Effects System**: Universal modifier engine for all game systems, with `EffectDef` and `ActiveEffect` models.
- **Equipment System**: Players equip GEAR items (weapon/armor/accessory) onto entities via `EquipItem`/`UnequipItem` commands. Slot capacity comes from `EntityDef.equipmentSchema`; over-capacity equips auto-evict the oldest occupant. Stat contributions are layered through `EffectResolver` (synthesized STAT_BOOST/FLAT_ADD effects from `equipData.stats`) — `Entity.stats` is never mutated. Server serializes both `baseStats` and `equippedStats` on each entity payload; the entity sheet renders a dual-outline radar (dashed purple base, solid gold equipped) with per-axis ± deltas. Entry points: tap a slot tile on the entity sheet (opens slot-filtered `EquipPickerModal`, or unequips if filled), or tap Equip/Unequip on a gear row in the inventory page.
- **Audio System**: Full audio pipeline with `SoundDef` and `SoundMapping` models, admin CRUD, public config endpoint, and frontend `AudioEngine`.
- **Shared Progression Math (`@derp/math`)**: Entity progression formulas (`STAT_KEYS`, `POWER_SCORE_WEIGHTS`, `computeScaling`, `applyWeightedLevelUp`, `getPowerScore`) as a single source of truth.
- **Balance Simulator (`/admin/balance`)**: Admin-only Monte Carlo tool for charting average power score per level.
- **Command/Delta/SSE Pipeline (v1 API)**: Infrastructure for scalable command processing, full snapshots, incremental updates, and real-time push notifications.
- **Frontend Sync Layer**: Manages bootstrap, SSE stream, delta fetching, and Redux store updates.
- **Admin Panel**: Dashboard for player editing, game state manipulation, and definition/modal editors.
- **App Storage**: Replit App Storage for hosting art and media assets.
- **Progressive Web App (PWA)**: Built via `vite-plugin-pwa` for offline capabilities and faster loading.

**Security & Operations Posture:**
- **Security headers**: `helmet` is used to apply security headers, with CSP deliberately off for flexibility.
- **Body-size limits**: `express.json` and `express.urlencoded` limits prevent large malicious POSTs.
- **Graceful shutdown**: `app.enableShutdownHooks()` ensures Prisma disconnection on SIGTERM/SIGINT.
- **Per-IP throttling**: `ThrottlerModule` for rate limiting on auth and command endpoints.
- **Frontend error reporting**: Client-side errors are reported to the server logs via `navigator.sendBeacon`.
- **Structured logging**: `nestjs-pino` is used for JSON logging in production with `pino-pretty` in dev, including request IDs for traceability.
- **Global HTTP exception filter**: Handles exceptions, sanitizing errors in production.
- **Process-level error handlers**: Listeners for `unhandledRejection` and `uncaughtException` log errors without exiting.
- **Liveness vs readiness**: `/health` (liveness) and `/health/ready` (readiness with DB check) endpoints.
- **CORS multi-origin**: `CORS_ORIGIN` supports comma-separated origins, rejecting wildcard in production.
- **No raw `console.*`**: All logging in `apps/api/src` goes through Nest `Logger`.
- **Production env vars**: `JWT_SECRET`, `ADMIN_SECRET`, and `CORS_ORIGIN` are required in production.
- **Cardano login**: Uses real CIP-8 / COSE_Sign1 verification for secure authentication.
- **Atomicity sweeps**: Critical economy mutations (crafting, gifts, jobs, shop purchases, mission actions) are wrapped in `prisma.$transaction`.
- **Idempotency**: `IdempotencyService` protects non-command POST endpoints (`/gifts/:id/claim`, `/crafting/:id/collect`, `/jobs/:id/skip`, `/jobs/:id/cancel`, mission and location mutation endpoints) against retries.
- **Real-DB integration tests**: Jest integration tests using a dedicated schema and `db-harness.ts` for atomic transaction verification.
- **Connection status banner**: Frontend component to display real-time connection status and retry option.
- **Unified visual tag system**: `TagDef` and `VisualEffectDef` models provide data-driven styling for badges, pills, and visual effects.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Prisma ORM**: Database toolkit.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **NestJS**: Backend framework.
- **pnpm**: Monorepo package manager.
- **@google-cloud/storage**: Object storage SDK for media assets.
- **@cardano-foundation/cardano-verify-datasignature**: Cardano signature verification.