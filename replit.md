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
- **Unified Outcome System**: Flexible JSON structure for game outcomes. Currency / item / entity_xp / keeper_xp entries use a canonical `min`/`max` shape (rolled per-grant). Legacy single `amount` entries are auto-migrated to `min=max=amount` on every save (admin generic CRUD), during seed insert, and via a one-time idempotent boot-time backfill in `BootstrapService`. The `resolveOutcomes` resolver no longer reads `amount`. Set `OUTCOME_SPEC_BACKFILL_DISABLED=1` to skip the boot scan in CI.
- **Unified Requirement System**: Universal `operator` field for flexible requirement comparisons.
- **Flag System**: Generic key-value variables on the User model for dynamic game state.
- **GameRulesService**: Centralized service for consistent game logic.
- **Server-Authoritative Meta System**: Provides game enums and rules via API.
- **Player Telemetry System**: Records player events for analytics.
- **Lootbox System**: Defines weighted outcome pools and manages item-based lootbox openings.
- **Reusable Bundle Definitions (`BundleDef`)**: Saved, named outcome bundles that any reward-bearing definition (missions, lootboxes, recipes, gifts, effects) can reference via a `{ type: 'bundle_ref', bundleDefId }` outcome entry. References may override `odds`, `pickMin`, `pickMax`, and `requirements` per-usage. `GameRulesService.resolveOutcomesAsync` preloads referenced defs and expands them recursively (cycle-safe; missing/disabled refs resolve to empty + log warning) before normal resolution. Edited via the standard smart admin editor.
- **Daily Check-In System**: Configurable daily check-in tracks with streaks and rewards.
- **Quest System**: Defines objectives based on player telemetry, tracks progress, and manages rewards. `QuestDef.cadence` is one of `"daily" | "weekly" | "oneoff"` (default `oneoff`); daily/weekly are treated as repeatable regardless of the legacy `repeatable` flag. `QuestInstance.windowStartedAt` records the start of the current cadence window; `QuestService.resetExpiredCadenceQuests` runs lazily at the top of `listInstances` AND `processEvent` and rolls any instance whose window is older than `getWindowStart(now, cadence)` back to a fresh `active` state with zeroed progress. On claim, daily/weekly bump `windowStartedAt = now` and set `status='claimed'` so the next window cleanly opens. `getWindowStart`/`windowsMissed` live in shared `apps/api/src/common/util/cadence.ts` (also imported by `CheckInService` so the two systems share one implementation).
- **Retention Loops (Daily/Weekly + Achievements)**: Built on top of the existing telemetry + quest plumbing. Seeded by `apps/api/src/seeds/retention.seed.ts` (called from `BootstrapService.onModuleInit` after `seedSounds`): 3 daily quests (`q_daily_*`), 2 weekly quests (`q_weekly_*`), 5 achievements (`ach_*`, two with permanent EffectDef-backed bonuses).
- **Achievement System**: One-shot lifetime milestones with optional permanent bonuses on claim. `AchievementDef` (id, name, tier, objectives, rewardSpec, optional `permanentEffectSpec`) + `AchievementInstance` (per-user lazy-materialized progress row, unique on `[userId, achievementDefId]`). `AchievementService` mirrors `QuestService`'s telemetry-subscriber model: `processEvent` ticks progress against any candidate def matching the event, `getOrInitInstance` lazy-creates rows on first qualifying event so the table stays small. `claimReward` resolves rewards through `GameRulesService` (same min/max outcome shape as quests), grants currency/items, and — if `permanentEffectSpec` is set — writes an `ActiveEffect` row with `expiresAt: null` + `expiresAtTick: null` (already recognized as "never expires" by `fetchActiveEffects` in patch-builder) sourced as `'achievement'`. Claim is wired through `ClaimAchievementRewardHandler` in the v1 commands router. `PatchBuilder.upsertAchievement` and `buildAchievementPatches` keep the sync layer in step. Bootstrap snapshot now exposes `state.achievements` alongside `state.quests`; frontend `syncSlice` mirrors the table and `ENTITY_KEY_MAP['achievement']` lets delta patches land. UI: `/achievements` page (`apps/web/src/features/achievements/`) with `AchievementCard`, header progress %, claim button, and a "permanent bonus" pill on claimed entries; `/quests` `QuestList` was rebuilt with `Daily | Weekly | Story | All` cadence tabs (status sort: completed → active → claimed within each tab). Layout dropdown nav got an `Achievements` entry.
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

**Progressive Web App (PWA):**
- Built via `vite-plugin-pwa` (registerType `autoUpdate`, generateSW). Plugin runs as part of `pnpm --filter @derp/web build` and emits `dist/sw.js`, `dist/workbox-<hash>.js`, and `dist/manifest.webmanifest` alongside the regular bundle.
- Web manifest: name "Derp Universe", short_name "Derp", `display: standalone`, `theme_color: #1e1b3a`, `background_color: #0c0a1a`, `start_url: /`, `scope: /`. Icons live in `apps/web/public/` (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-192.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`, `derp.svg`, `favicon-32.png`) — all generated from `derp.svg` via ImageMagick. Replace any of those PNGs with hand-crafted art and rebuild.
- Workbox runtime caching:
  - **Precache**: app shell (HTML/JS/CSS/SVG/fonts) — auto, ~57 entries, rotated by file hash.
  - **`/media/*`** (icons, sprites, audio): `CacheFirst`, 30 days, ~500 entries.
  - **`/api/audio/config`**: `StaleWhileRevalidate`, 1 day.
  - **All other `/api/*`** (bootstrap, delta, commands, stream, auth, admin): `NetworkOnly` — server-authoritative state is never cached.
  - **Google Fonts**: `CacheFirst`, 1 year.
  - **SSE** (`/api/v1/stream`): bypassed (workbox doesn't intercept the EventSource through this strategy).
- Update flow: when a new SW activates, `PWAUpdateBanner` (mounted in `main.tsx` as a sibling of `<App />` so it covers logged-out and admin routes too, via `virtual:pwa-register/react`) shows a non-blocking "A new version is available — Refresh" banner. Click triggers `updateServiceWorker(true)` which activates + reloads. The banner also calls `registration.update()` on a 30s interval so an active session picks up new deploys quickly without waiting for the browser's default SW update cadence.
- Production server (`apps/api/src/app.module.ts` ServeStaticModule) overrides `Cache-Control` to `no-cache, must-revalidate` for `sw.js`, `registerSW.js`, and `manifest.webmanifest` so a stale SW can never pin the site to an old build. Hashed JS/CSS bundles keep their default static caching.
- Dev mode: `devOptions.enabled: false` — no SW runs during `pnpm --filter @derp/web dev`, so HMR is unaffected. The PWA only activates in production builds.
- Explicitly NOT supported: offline gameplay (server-authoritative architecture requires a live connection for bootstrap/SSE), push notifications, background sync.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Prisma ORM**: Database toolkit.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **NestJS**: Backend framework.
- **pnpm**: Monorepo package manager.
- **@google-cloud/storage**: Object storage SDK for media assets.
## Security & Operations Posture (MVP hardening)
- **Security headers via `helmet`.** `app.use(helmet({ contentSecurityPolicy: false }))` in `main.ts` ships HSTS (1y, includeSubDomains), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, etc. CSP is **deliberately off** because the SPA serves inline scripts/styles from `ServeStaticModule` and the dev preview is iframed via Replit's mTLS proxy — a real CSP needs its own design pass before turning on.
- **Body-size limits.** `main.ts` registers `express.json({ limit: '1mb' })` and `express.urlencoded({ limit: '1mb' })` so a single malicious POST can't wedge memory. Media uploads go through `/admin/media/upload` which streams to GCS and isn't affected by this cap (multipart route uses its own parser).
- **Graceful shutdown.** `app.enableShutdownHooks()` ensures `OnModuleDestroy` (i.e. `PrismaService.onModuleDestroy → $disconnect()`) runs on SIGTERM/SIGINT. Note: this only drains the Prisma pool, **not** in-flight HTTP responses — Nest 10 has no built-in HTTP drain. Acceptable at MVP scale because the global filter + outbox + reserve-first idempotency mean a killed mid-flight command either rolled back or its placeholder row will be replayed on the client retry. Real connection draining is a follow-up.
- **Per-IP throttle on `/auth/*`.** `ThrottlerModule.forRoot` in `app.module.ts` now declares two named scopes: `commands` (120/min, applied to `/v1/commands`) and `auth` (10/min, applied to `/auth/*`). `AuthController` is decorated with `@UseGuards(ThrottlerGuard)` + `@SkipThrottle({ commands: true })` so only the stricter `auth` scope counts. `CommandController.executeCommand` adds `@SkipThrottle({ auth: true })` to the inverse, otherwise the auth budget would silently shrink command throughput. Verified: 11th rapid login returns 429.
- **Frontend error reporting → server logs.** `apps/web/src/services/clientErrorReporter.ts` exposes `reportClientError()` and `installGlobalErrorReporter()`. The reporter:
  - Caps at 25 reports per session and dedupes by `${message}::${stack[0..200]}` so a render loop can't spam itself.
  - Uses `navigator.sendBeacon` (survives unload) with a `fetch({keepalive:true})` fallback. Never throws — must not raise inside an `<ErrorBoundary>` already handling an error.
  - Posts `{ message, stack, componentStack, fallbackTitle, url, release }` (truncated to safe lengths) to `/api/v1/client-errors`. Includes `VITE_BUILD_SHA` env so a future log aggregator can pin reports to a release.
  - Wired into `ErrorBoundary.componentDidCatch`, `window.addEventListener('error', ...)`, and `window.addEventListener('unhandledrejection', ...)` from `main.tsx` so React, raw JS, and floating-promise errors all converge on the same sink.
  - Server side: `ClientErrorsController` at `POST /v1/client-errors` validates payload sizes (DTO with `@MaxLength`), throttles at 60/min/IP on its own scope, and logs via the structured `[ClientError]` Nest logger so pino picks it up. When we wire a log aggregator (Sentry / Logtail / Axiom — vendor TBD), this is the single place it plugs in.
- **Verified: existing protections that still hold.** SSE stream (`stream.controller.ts`) already has `req.on('close', cleanup)` + `req.on('error', cleanup)` and a 15s heartbeat — leak-safe. `PrismaService` already implements `OnModuleInit/OnModuleDestroy` to connect/disconnect. Prod uses real migrations: `prisma/prod-migrate.sh` runs `prisma migrate deploy` (NOT `db push`), and `prisma/migrations/` contains 13 versioned migrations.
- **Structured logging via `nestjs-pino`.** `LoggerModule.forRoot` in `apps/api/src/app.module.ts` wires pino as the Nest logger (replacing console). JSON in prod, `pino-pretty` only in dev. Per-request child logger carries a `req.id` taken from the `x-request-id` request header (or a generated uuid v4 if absent), so any log line emitted while servicing a request can be traced back to its originating request — critical for diagnosing command-pipeline failures in production. `customLogLevel` maps 5xx/exception → `error`, 4xx → `warn`, else `info`. Redaction is configured for `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-admin-key"]` (note: this is the actual header `AdminGuard` reads — `x-admin-secret` is NOT used anywhere), and any nested `*.password` / `*.token` / `*.accessToken` / `*.refreshToken` / `*.JWT_SECRET` / `*.ADMIN_SECRET`. `LOG_LEVEL` env overrides the default level.
- **Global HTTP exception filter.** `apps/api/src/common/filters/http-exception.filter.ts` is wired via `app.useGlobalFilters` in `main.ts`. Behavior:
  - For `HttpException`: passes the controller's response payload through verbatim (so structured bodies like `/health/ready`'s `{ status, checks }` survive intact) and injects `statusCode` + `requestId` for trace correlation.
  - For non-`HttpException` (uncaught) in **production**: returns a sanitized `{ statusCode: 500, message: 'Internal server error', requestId }` so stack traces / internal messages never leak. In dev it surfaces the raw `err.message` and `err.name` for fast debugging.
  - Logs every 5xx (and any non-HttpException) at `error` with the full `err` object plus `requestId`/`method`/`url`/`userId`/`statusCode`. Logs 4xx at `warn` without the stack. **Filter caveat**: passes the controller payload through with shallow spread, so a controller that returns a field literally named `requestId` would have it overwritten — acceptable trade-off for the trace correlation guarantee.
- **Process-level error handlers.** `main.ts` registers `unhandledRejection` and `uncaughtException` listeners that log via the structured logger. Deliberately **does not** call `process.exit` — Replit Deploy / docker / pm2 already decide when to recycle, and silent process death would be worse than a logged-but-alive process.
- **Liveness vs readiness.** `HealthController` now exposes two endpoints:
  - `GET /health` (and `GET /`) — cheap liveness, no I/O. Used by orchestrators that just need to know the process is up.
  - `GET /health/ready` — readiness probe. Runs `prisma.$queryRaw\`SELECT 1\`` with a 1s timeout via `Promise.race`. 200 with `{ status: 'ready', checks: { db: { ok, elapsedMs } } }` on success; 503 with `{ status: 'not_ready', checks: { db: { ok: false, elapsedMs, error } } }` on failure or timeout. Both are added to the `setGlobalPrefix('api', { exclude: [...] })` list so they remain reachable in prod without the `/api` prefix.
- **CORS multi-origin.** `CORS_ORIGIN` is now comma-split before being passed to `enableCors` — set to e.g. `https://derp.replit.app,https://www.derp.gg` to allow multiple explicit origins. Wildcard `*` is still rejected at boot in production. Single-origin string still works (back-compat).
- **No raw `console.*` in `apps/api/src`.** All 16 prior call sites (location.service ×8, jwt.strategy, object-storage routes/objectStorage ×4, nft-entities seed ×2, main.ts ×1) now go through Nest `Logger` instances so pino picks them up and they get the `[context]` tag for filtering.
- **Production env vars are required.** `apps/api/src/main.ts` throws at boot in production if any of `JWT_SECRET`, `ADMIN_SECRET`, or `CORS_ORIGIN` is missing (and refuses `CORS_ORIGIN='*'`). Dev keeps permissive defaults with a one-shot warning. `JwtStrategy` and `AdminGuard` mirror the same behavior individually so no module silently boots with a known-string secret.
- **Cardano login uses real CIP-8 / COSE_Sign1 verification.** `AuthService.verifyCardanoSignature` now runs `@cardano-foundation/cardano-verify-datasignature` (which internally does CBOR + ed25519) over the COSE_Sign1 / COSE_Key pair the wallet returns from CIP-30 `signData`. The verifier checks all three properties: signature is a valid ed25519 sig over the COSE Sig_structure, the COSE payload equals our nonce message, and the COSE address header matches the bech32 form of the recorded wallet address. The frontend (`useWalletConnect.ts`, `walletAuth.ts`, `services/api.ts`) now sends both `signature` AND `key` (both hex CBOR) on `/auth/wallet/verify` and `/auth/wallet/link`. Hex→bech32 conversion happens in `AuthService.hexAddressToBech32` per CIP-19 (high nibble = address type, low nibble = network id; type ≥ 0x0e gets the `stake`/`stake_test` prefix, else `addr`/`addr_test`). If verification fails for any reason — invalid sig, wrong message, mismatched address, missing `key` field in the request, or thrown exception — the login is rejected. The `DEV_ALLOW_CARDANO_BYPASS=true` escape hatch only kicks in when `NODE_ENV !== 'production'` AND the `key` field is absent from the request, so it can't accidentally weaken the prod path.
- **Crafting start is atomic.** `CraftingService.startCrafting` wraps the cost spend, item removal, entity status flip, and Job row creation in a single `prisma.$transaction` using the `*Tx` service variants. Previously each step ran in its own transaction, so a crash mid-flow could spend currency without ever creating the Job.
- **CI.** `.github/workflows/ci.yml` runs `pnpm install`, `prisma generate`, `pnpm -r build`, and `pnpm -r test --if-present` on every push/PR to `main`.
- **Web tests.** `apps/web` now has a Vitest + React Testing Library scaffold:
  - `apps/web/vitest.config.ts` — separate from `vite.config.ts` on purpose; `vite-plugin-pwa` injects Workbox / service-worker globals that explode under jsdom, so the test config skips the PWA plugin entirely.
  - `apps/web/src/test/setup.ts` — registers `@testing-library/jest-dom/vitest` matchers and runs RTL `cleanup()` after each test.
  - `apps/web/src/test/render.tsx` — `renderWithProviders(ui, { preloadedState })` test harness that wraps a component in `<Provider store>` (fresh `configureStore` w/ all 3 slices) + `<MemoryRouter>` + `<ModalProvider>`. Use this for any component that touches Redux, routing, or modals.
  - Scripts: `pnpm --filter @derp/web test` (CI), `test:watch`, `test:ui`.
  - Vitest pinned to `^2.1.0` because Vitest 4 requires Vite 6 and we're on Vite 5.
  - Specs (4 files, 15 tests):
    - `src/utils/formatSeasonRemaining.test.ts` — pure date-formatter unit tests.
    - `src/hooks/useCommand.test.tsx` — happy path: api.sendCommand mocked, asserts patches dispatched into `state.sync.cursor`/`items`, asserts `onUiIntent` callback receives every UI intent, asserts second `execute()` call rejects with "already in progress" while the first is mid-flight.
    - `src/features/home/HomePage.test.tsx` — renders skeleton when player is null; hides season banner when `state.sync.activeSeason` is null; shows banner with uppercased name when active.
    - `src/features/inventory/InventoryPage.test.tsx` — renders category tabs; renders an item from the sync store; opening a LOOTBOX dispatches `OpenLootBox` via mocked `api.sendCommand` and proves the `ui.modal` intent path is wired (covers the "lootbox reveal" UX fix).
  - Mocking patterns to know:
    - Mock `services/api` per-file with `vi.mock('../../services/api', ...)` — never globally, as different specs need different return shapes.
    - Mock `services/AudioEngine` per-file too — Web Audio APIs explode under jsdom.
    - `tick` hooks (`useCurrentTick`/`useTickRate`) need `vi.mock('../../tick', ...)` to return constants — `TickEngineProvider` is too heavy for a smoke test.
- **Lootbox reveal modal.** `InventoryPage` now passes `onUiIntent` into `useCommand({ onUiIntent: (i) => i.type === 'modal' && pushModal(i.spec) })`. The `OpenLootBox` and `OpenGiftPackage` handlers were already returning a `ui: [{ type: 'modal', spec: {…} }]` intent with the rolled rewards; the page just wasn't surfacing it. Closes the "lootbox vanishes silently" UX gap. Same wiring also surfaces any future modal intents from inventory-issued commands without further work.
- **Atomicity sweep on economy mutations.** All non-`/v1/commands` paths that touch currency / inventory now run in a single `prisma.$transaction`:
  - `CraftingService.collectCrafting` wraps the credit + add-item + status flip in `$transaction`; name resolution happens BEFORE the tx so the critical section stays small, and outbox `emitEvent` runs AFTER commit (it has its own dedup).
  - `GiftService.claimGift` was refactored: the public method opens a `$transaction` when no caller-supplied tx is available; the actual logic lives in private `_claimGiftWithTx`. Means the REST `/gifts/:id/claim` controller is now atomic too, not just the `/v1/commands` `ClaimGiftHandler` path.
  - `JobController.skipJob` wraps its skip-cost loop + Job.update in `$transaction` using `currencyService.spendTx`. Previously each loop iteration was its own tx so a partial spend was possible.
  - `PlayerService.addKeeperXp` and `EntityService.setEntityStatus` / `addEntityXp` now accept an optional `tx` arg so callers inside a transaction don't fork their own.
- **Idempotency for non-command POST endpoints.** `IdempotencyService.executeIdempotent(userId, endpoint, key, payload, fn)` (in `apps/api/src/modules/infrastructure/idempotency.service.ts`) reuses the existing `IdempotencyKey` table. Wired into `/gifts/:id/claim`, `/crafting/:id/collect`, `/jobs/:id/skip`, `/jobs/:id/cancel` via an `Idempotency-Key` header.
  - **Reserve-first contract** (mandatory — the obvious "find / fn / create" sequence has a TOCTOU window where two concurrent requests both pass the find and both execute fn() before racing on the create, double-spending). The wrapper INSERTs a placeholder row (`responseJson = JsonNull`) before running fn(). Concurrent retries hit P2002 on that INSERT and the loser sees the placeholder and returns 409 ("in-flight; retry after the original completes") instead of executing fn() a second time. On fn() failure the placeholder is deleted so the key is retryable; on success it's UPDATEd with the response and serves cached replays.
  - **`commandType` discriminator**: REST rows are stored with `commandType: endpoint` (NOT empty string) so the existing `@@unique([userId, commandType, id])` constraint discriminates across endpoints — otherwise the same key reused on `/gifts/:id/claim` and `/crafting/:id/collect` would falsely collide.
  - **Frontend** (`apps/web/src/services/api.ts`) auto-generates a key per call via `newIdempotencyKey(prefix)` and sends the header on those four endpoints, defending against network-layer retries (fetch retries, transient 502s, etc.). NOTE: keys are generated per call, not persisted across page reloads — true user-initiated retry dedupe (e.g. user smashes button after a refresh) would need a per-action key persisted in IndexedDB; deferred until we see real evidence it's needed.
- **Real-DB integration tests.** New `pnpm --filter @derp/api test:integration` script (jest config `apps/api/test/jest-integration.json`, runs files matching `*.integration-spec.ts`).
  - `apps/api/test/integration/global-setup.ts` rewrites `DATABASE_URL` to force `?schema=integration_test` (same Postgres instance as dev, isolated schema) and runs `prisma db push --accept-data-loss` so the test schema mirrors HEAD.
  - `apps/api/test/integration/db-harness.ts` boots a Nest testing module against `AppModule` with the real `PrismaService`, plus `resetDb()` which dynamically `TRUNCATE … CASCADE`s every table in the test schema (so adding a new model never breaks the harness).
  - Specs (4 suites, 8 tests, all passing):
    - `open-lootbox.integration-spec.ts` — proves `OpenLootBoxHandler` credits currency, deletes the lootbox `ItemInstance`, writes a `CurrencyLedger` row with the right `sourceType/sourceId`, AND that throwing from the outer `$transaction` callback rolls back ALL of those writes (no balance, no ledger, item still present).
    - `shop-purchase.integration-spec.ts` — `ShopPurchaseHandler` debits cost currency, credits granted currency, and adds granted items in one transaction; downstream throw rolls every write (balances, items, ledger) back.
    - `open-gift-package.integration-spec.ts` — `OpenGiftPackageHandler` deletes the GIFT_PACKAGE `ItemInstance` and credits the rewardSpec currency atomically; rollback path keeps the package and grants nothing.
    - `claim-gift.integration-spec.ts` — `ClaimGiftHandler` flips the gift `UNCLAIMED → CLAIMED`, writes a `GiftClaimTx` row, and credits the snapshot.rewardSpec rewards atomically; rollback leaves the gift unclaimed with no claimTx + no balance.
  - Run with `--runInBand` (single worker) since all tests share the one schema. The `rewardSpec` shape used by `OpenGiftPackageHandler` / `GiftService.claimGift` is a SINGLE outcome entry (`{ type: 'currency', key, min, max, odds }`), not a `{ grants: [...] }` wrapper — the resolver delegates to `GameRulesService.resolveOutcomesAsync([spec], …)` so anything that doesn't match the canonical entry shape silently grants nothing.
  - Add new specs by following the same `seed()` → `prisma.$transaction(tx => handler.execute({userId, tx}, payload))` → assert pattern.
- **MissionService atomicity sweep.** `MissionService.startMission` and `MissionService.completeMission` now wrap themselves in `prisma.$transaction` when no `externalTx` is supplied (self-recursive call with the tx). Previously `completeMission` had per-reward `if (externalTx) creditTx(…) else credit(…)` ternaries, so the REST `POST /missions/:id/complete` path forked a separate connection per reward and could leave a player half-paid (Keeper XP credited, currency ledger row missing) on a mid-loop crash. With the wrapper, the non-Tx branches are now dead and have been collapsed — the only path is `creditTx` / `addItemTx`, all participating in the same transaction as the keeper-XP / entity-status / Job.update writes. The `/v1/commands` `CompleteMissionHandler` path is unchanged because it already supplies its own outer tx (the wrapper's `if (!externalTx)` guard is a no-op there).
- **Idempotency for mission + location mutation endpoints.** Same `IdempotencyService.executeIdempotent` pattern as the crafting/jobs/gifts round, now wired into:
  - `POST /missions/start`, `POST /missions/:id/complete`
  - `POST /locations/:id/claim`, `POST /locations/:id/build`, `POST /locations/:id/buildings/:buildingId/complete`, `POST /locations/:id/buildings/:buildingId/upgrade`
  - Each row uses `commandType: 'POST:/missions/start'` (full method+route string) so concurrent retries can't false-positive across endpoints. Frontend (`apps/web/src/services/api.ts`) auto-generates an `Idempotency-Key` per call via `newIdempotencyKey(prefix)` and sends the header. Same caveat as before: keys are per-call, not persisted across page reloads.
- **Auth registration race fix.** `AuthService.register` previously did `findFirst({ OR: [email, username] })` then `user.create(…)` as separate queries. A double-clicked submit (or any concurrent registration with the same username/email) could pass the pre-check on both calls before either committed, then the loser's `user.create` would crash with a Prisma `P2002` and bubble up as a generic 500. The pre-check is kept (it's the fast UX path), but `user.create` is now wrapped in `try/catch` that rethrows P2002 as the same `ConflictException('Username or email already taken')` — so the DB constraint becomes the real source of truth and the race window collapses to a clean 409. The catch is narrowed on `err.meta.target` so future unique constraints (e.g. on wallet address) don't get the wrong error message.
- **Idempotency commandType per-resource isolation.** The new mission/location idempotency wrappers use a TEMPLATED commandType (e.g. `` `POST:/missions/${id}/complete` ``, NOT the literal `POST:/missions/:id/complete`) so the same key reused across two different mission/location IDs can't false-positive against each other. The previously-shipped crafting/jobs/gifts endpoints still use literal route strings — same bug shape, but mitigated in practice because the frontend auto-generates a fresh key per call that includes the resource ID in the prefix. Worth tightening if a real reuse is observed.
- **Known: eventService.dispatch inside completeMission.** The mission completion loop calls `eventService.dispatch(…)` for `emitEvent` reward entries (e.g. welcome-gift on first quest). `EventService.dispatch` is NOT transaction-aware (it issues its own writes), so on rollback the dispatched event's side-effects (e.g. a granted gift instance) would persist while the mission's own writes vanish. This was already the behavior before this round's tx wrapper — the `/v1/commands` `CompleteMissionHandler` path has had the same shape since launch, and `EventService` has its own `idempotencyKey` parameter (we pass one derived from `${jobId}`) so a retry won't double-dispatch. Plumbing `tx` through `EventService.dispatch` is the proper fix; deferred as a separate hardening pass.
- **Connection status banner.** `apps/web/src/components/ConnectionStatusBanner.tsx` reads `sync.status` / `sync.lastError` from Redux and shows a top banner with a Retry button that calls `syncEngine.start()` via the new `services/syncEngineSingleton.ts` handle. Replaces the previous inline banner in `Layout.tsx` that had no recovery action.
- **Home season banner is data-driven.** `HomePage.tsx` reads `state.sync.activeSeason` (already streamed from the bootstrap/delta pipeline) and only renders the banner when a season is active. The previous hardcoded "VOID CONVERGENCE / 24d 17h" copy is gone.
- **Inventory craft-with-this gate.** When the player has no Workshop building anywhere, the inventory "⚒️ Craft with this" button is disabled (instead of navigating to a route that would redirect away). Mirrors the server-side workshop preflight in `ForgePage.tsx`.
- **Unified visual tag system + reusable visual effects.** New `TagDef` and `VisualEffectDef` Prisma models (migration `20260503010000_add_tag_defs_and_visual_effects`) ship the entire badge/pill/chip catalog through the bootstrap snapshot. `<Tag tagKey="rarity-epic">` (apps/web/src/components/Tag.tsx) does an O(1) lookup in `state.sync.tagDefs` (keyed by `key`, NOT `id` — admins reference stable string keys, ids are internal) and renders inline-styled pills using CSS custom props (`--tag-bg`, `--tag-color`, `--tag-border-color`, `--tag-opacity`, `--tag-font-size`). Unknown keys render a loud "tag--unknown" pill so missing seeds surface in dev instead of vanishing.
  - `<VisualEffect effectKey="...">` (apps/web/src/components/VisualEffect.tsx) is a generic wrapper that maps a `VisualEffectDef` to one of 6 hard-coded CSS animations (`shimmer/pulse/glow/shake/bounce/rainbow` in `VisualEffects.css`). The def's `params` (color, intensity, minOpacity, maxScale) are passed through as `--fx-*` custom properties so two consumers — e.g. an "epic" `<Tag>` and an "epic" item icon — can share the SAME effect key and update together when an admin tweaks the color. Adding a new animation is a deliberate frontend code change (CSS keyframes aren't data-authorable) — params + duration + easing are the only data-driven knobs. Honors `prefers-reduced-motion` globally.
  - Bootstrap delivery: `QueryService.bootstrap()` fetches `tagDef.findMany({where: {enabled:true}})` and `visualEffectDef.findMany({where: {enabled:true}})` in the existing Promise.all, ships them under `snapshot.state.tagDefs / visualEffectDefs`. `syncSlice.setSnapshot` rebuilds both as `{[key]: def}` dicts on every bootstrap (catalog data, not delta-streamed — it's small and changes rarely).
  - Seed (`apps/api/src/seeds/tags.seed.ts`, wired into `BootstrapService.onModuleInit` after `seedRetention`): 8 effects + 28 tags spanning `rarity-{common…legendary}` (9), `ach-tier-{1…5}` (5), `ach-status-{active|completed|claimed}` (3), `quest-{active|completed|claimed}` (3), `entity-status-{idle|mission|working|injured}` (4), and 4 system tags (`permanent-bonus`, `new`, `limited`, `perfect`). Idempotent create-if-missing pattern — admin edits in the Tag Editor win over re-seeds.
  - Replaced existing badge sites: `AchievementCard.tsx` (tier label, status badge, permanent-bonus pill), `QuestCard.tsx` (status badge). Old hardcoded `TIER_LABEL` map and inline status ternaries are gone.
  - Admin Tag Editor at `/admin/tag-editor` (apps/web/src/features/admin/tag-editor/): two-tab UI (Tags / Effects) with live preview that renders FROM THE DRAFT FORM STATE (not the Redux catalog) so uncommitted edits are visible before save. Bypasses the SmartAdmin generic editor on purpose because "see the change before you save it" is the entire point. Reload after save propagates new bootstrap snapshot. Tables exposed via `AdminController.getTables` + `AdminService.getModel` so the generic `/admin/:table` CRUD also works as a fallback.
