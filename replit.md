# Derp Universe

## Overview
Derp Universe is a season-based idle strategy RPG set in a persistent world, offering strategic gameplay. The project focuses on providing a rich gaming experience through a scalable and maintainable modern tech stack, ensuring continuous content development and growth.

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
The project is organized as a pnpm monorepo, integrating a React+Vite frontend, a NestJS backend, and shared TypeScript packages. The backend is responsible for both API services and serving static frontend files in production.

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
- **Navigation**: Floating bottom navigation bar with SVG icons and active item indicators.
- **Theme**: Dark purple RPG style with gradients, glowing accents, radial gradient depth, and SVG noise textures.
- **Typography**: Cinzel for headings, Exo 2 for body text.
- **Styling**: Plain CSS utility shim.
- **Performance**: Code splitting for page components and lazy-loaded admin pages.
- **Animations**: Page transitions with fade/rise and staggered card entry.
- **Skeletons**: Layout-accurate skeleton screens for main pages.
- **Home Screen**: Consolidates production, missions, season events, and keeper status.
- **Inventory Screen**: Category filter tabs, scrollable card grid with rarity visuals, and detailed info panel.

**Blockchain Wallet System:**
- **DB Models**: `LinkedWallet` and `WalletNonce` for tracking user wallets and authentication nonces.
- **Auth Endpoints**: Support wallet-based login/registration and linking wallets to existing accounts.
- **Wallet Management**: CRUD operations for player wallets, including setting primary wallets.
- **NFT Ownership Service**: Integrates `CardanoOwnershipProvider` (Blockfrost) and `EvmOwnershipProvider` (Alchemy) for multi-chain NFT ownership verification.
- **Frontend**: `useWalletConnect` hook, wallet buttons, and a `/profile` page for wallet management.
- **Supported chains**: CARDANO (CIP-30 wallets), ETH, BASE, MATIC.
- **NFT Collection System**: `NftCollectionDef` DB model for tracking NFT collections. Supports admin-triggered bulk imports and player-initiated syncs to claim NFTs. Uses `Entity.nftAssetId` and `Entity.nftCollectionDefId` for tracking ownership.

**Core Systems & Features:**
- **Database**: PostgreSQL with Prisma ORM.
- **Definition/Instance Architecture**: Used for Entities, Locations, and Items, enabling rich attributes and state management.
- **Level-Based Rules System**: Standardized JSON `rules` for configurable, level-based game mechanics.
- **Tick-Based Timing System**: Global and frontend-specific tick systems for game timers.
- **Server-Authoritative Notifications**: Postgres-persisted notifications with advanced management features.
- **Server-Driven Modal System (ModalSpecV1)**: Dynamic modal generation by the backend, supporting various content types and interactive actions, with context-aware token resolution.
- **Location Production & Consumption System**: Level-based production with dynamic storage, atomic resource claims, and starvation mechanics.
- **Currency System**: Data-driven currencies with BigInt balances and audit trails.
- **Editor-Ready Balance System**: Extensive use of JSON fields for data-driven game balancing.
- **Unified Job System**: Single `Job` table for all timer-based activities.
- **DB-Backed Definitions**: `MissionDef` and `RecipeDef` as database models.
- **Unified Outcome System**: Flexible JSON structure for game outcomes.
- **Unified Requirement System**: Universal `operator` field for flexible requirement comparisons.
- **Flag System**: Generic key-value variables on the User model for dynamic game state.
- **GameRulesService**: Centralized service for consistent game logic.
- **Server-Authoritative Meta System**: Provides game enums and rules via API.
- **Player Telemetry System**: Records player events for analytics.
- **Lootbox System**: Defines weighted outcome pools and manages item-based lootbox openings.
- **Reusable Bundle Definitions (`BundleDef`)**: Saved, named outcome bundles that any reward-bearing definition (missions, lootboxes, recipes, gifts, effects) can reference via a `{ type: 'bundle_ref', bundleDefId }` outcome entry. References may override `odds`, `pickMin`, `pickMax`, and `requirements` per-usage. `GameRulesService.resolveOutcomesAsync` preloads referenced defs and expands them recursively (cycle-safe; missing/disabled refs resolve to empty + log warning) before normal resolution. Edited via the standard smart admin editor.
- **Daily Check-In System**: Configurable daily check-in tracks with streaks and rewards.
- **Quest System**: Defines objectives based on player telemetry, tracks progress, and manages rewards.
- **Store System**: `ShopItemDef` DB model for store items with flexible costs and contents. Frontend at `/store` with tabs and limited offer timers.
- **Context-Aware Gift System**: `GiftDef` definitions with dynamic `rewardSpec` resolution based on creation context. Supports various reward types and automatic context building from job events.
- **Generic Effects System**: Universal modifier engine for all game systems, with `EffectDef` and `ActiveEffect` models, supporting various categories, value modes, durations, and stacking rules. Integrated into mission, production, and consumable item systems.
- **Audio System**: Full audio pipeline with `SoundDef` and `SoundMapping` Prisma models, 31 seeded placeholder sound defs, admin CRUD endpoints at `/api/admin/audio/*`, public config endpoint at `GET /api/audio/config`, frontend `AudioEngine` singleton with 4 buses (music/sfx/ui/ambient), volume settings panel in the nav, navigation-based music (`useAudioNavigation`), and audio triggers wired to modals and notifications. Admin UI at `/admin/audio`.
- **Shared Progression Math (`@derp/math`)**: Entity progression formulas (`STAT_KEYS`, `POWER_SCORE_WEIGHTS`, `computeScaling`, `applyWeightedLevelUp`, `getPowerScore`) live in `packages/math/src/entity-progression.ts` and are imported by both backend (entity service, NFT entity builder, entity generator) and frontend (entities page, balance simulator). Single source of truth for level-up math.
- **Balance Simulator (`/admin/balance`)**: Admin-only Monte Carlo tool that runs the real progression math client-side to chart average power score per level (1-50) for any entity definition, with mean and p10/p50/p90 bands, configurable sample size, and a re-run button. Pulls entity defs and trait stats via `GET /admin/balance/bundle`.

**Command/Delta/SSE Pipeline (v1 API):**
- **Infrastructure**: PubSubService, PlayerLockService, IdempotencyService for scalable command processing.
- **Commands**: Single `POST /v1/commands` endpoint for player write operations.
- **Query**: `GET /v1/bootstrap` for full snapshot, `GET /v1/delta` for incremental updates.
- **Stream**: `GET /v1/stream` SSE endpoint for real-time push notifications.
- **Patch Format**: `{ op, entity, id, data? }`.
- **UiIntent Format**: `{ type, ... }`.
- **Database Models**: `PlayerDelta`, `IdempotencyKey`.

**Frontend Sync Layer:**
- **SyncEngine**: Manages bootstrap, SSE stream, delta fetching, and Redux store updates.
- **syncSlice (Redux)**: Stores bootstrapped snapshot and manages connection status.
- **useSyncSelectors**: Memoized selector hooks for synchronized data.
- **useCommand hook**: Sends commands, applies patches, and dispatches UI intents.
- **API Routing**: v1 endpoints via Vite proxy; SSE uses `/api/v1/stream?token=<jwt>`.

**Admin Panel:**
- **Dashboard**: Tools for player editing, game state manipulation, and testing.
- **Definition Editor**: Schema-aware editor for definition tables.
- **Modal Editor**: Dedicated editor for `modal_defs` with rich editing capabilities, payload panel, and live preview.

**App Storage:**
- Replit App Storage for hosting art and media assets.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Prisma ORM**: Database toolkit.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **NestJS**: Backend framework.
- **pnpm**: Monorepo package manager.
- **@google-cloud/storage**: Object storage SDK for media assets.