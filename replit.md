# Derp Universe
A season-based idle strategy RPG offering strategic gameplay in a persistent world.

## Run & Operate
- `pnpm install`: Install dependencies.
- `pnpm dev`: Run frontend (port 5000) and backend (port 3001) with hot reload.
- `pnpm build`: Build all packages.
- `pnpm typecheck`: Run TypeScript checks.
- `pnpm prisma generate`: Generate Prisma client.
- `pnpm prisma db push`: Apply schema changes to the database.

**Required Environment Variables:**
- `JWT_SECRET`
- `ADMIN_SECRET`
- `CORS_ORIGIN` (comma-separated origins; no wildcard in production)

## Stack
- **Frontend:** React, Vite, Tailwind CSS v3
- **Backend:** NestJS
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Package Manager:** pnpm (monorepo)
- **Validation:** _Populate as you build_
- **Build Tool:** Vite

## Where things live
- `apps/web/`: React + Vite frontend application.
- `apps/api/`: NestJS backend application.
- `packages/shared/`: Shared TypeScript types and constants.
- `packages/math/`: Shared math utilities and progression formulas.
- `prisma/schema.prisma`: Database schema definition.
- `admin-schemas.md`: Admin API documentation.
- `definition-schemas.json`: Game definition schemas.
- `apps/web/src/core/theme/`: UI theme files.
- `apps/web/src/components/ui/`: Shared Tailwind UI kit (Card, SectionHeader, Badge, StatPill, Chip, EmptyState, Divider, Row, IconLabel, KeyValue, CostEntry, RewardChip).
- `apps/web/tailwind.config.js`, `apps/web/postcss.config.js`: Tailwind + PostCSS configuration.

## Architecture decisions
- **Monorepo Structure:** Uses pnpm for a monorepo with `apps/web`, `apps/api`, and shared `packages/`. Shared packages are pre-built to JavaScript.
- **API/Frontend Ports:** API binds to `0.0.0.0:3001`, Frontend to `0.0.0.0:5000`. CORS is enabled for all origins on the API.
- **Server-Authoritative Game Logic:** All core game mechanics, calculations, and state mutations reside on the server.
- **Definition/Instance Architecture:** Core game entities (Entities, Locations, Items) are managed through a definition/instance pattern.
- **Unified Command/Delta/SSE Pipeline:** Backend provides a scalable pipeline for commands, full state snapshots, incremental updates, and real-time push notifications.

## Product
- Season-based idle strategy RPG with a persistent world.
- Blockchain wallet integration for authentication, management, and multi-chain NFT ownership verification (Cardano, EVM chains).
- Core game systems include: level-based rules, tick-based timing, location production/consumption, data-driven currency, unified job system, lootboxes, daily check-ins, quests, achievements, store, and gift systems.
- Comprehensive in-game effects system for universal modifiers.
- Admin panel for game state manipulation and content definition.
- Progressive Web App (PWA) for enhanced user experience.
- Immersive UI/UX with mobile-first design, dark RPG theme, custom typography, and performant animations.

## User preferences
- Frontend on port 5000, backend on port 3001
- Development workflow with hot reload (Vite HMR + NestJS watch mode)
- Mobile-first RPG game UI style inspired by idle strategy games
- Always update admin-schemas.md and definition-schemas.json to document changes
- Always prefer to combine and update existing code and functions over create mostly duplicate code
- Always use the sever for data authority while the frontend simply displays data or does very minor calculations. All formulaic updates should only exist server side
- Always remove legacy code instead of creating fallbacks. When you do this, make sure to implement proper error handling

## Frontend styling convention
- **Tailwind-first:** New `apps/web` UI is built with Tailwind utility classes; plain `.css` files for new pages are discouraged. Tailwind preflight is enabled, with `@tailwind base/components/utilities` directives at the top of `apps/web/src/index.css`.
- **Theme tokens:** All design tokens (`--derp-blue`, `--bg-card`, `--text-primary`, `--page-top-gap`, etc.) remain CSS variables in `apps/web/src/index.css` and are mirrored into `tailwind.config.js` so utilities like `bg-bg-card`, `text-text-secondary`, and `pt-page-top` map to the variables. Update both places when adding a token.
- **UI kit:** Use the shared primitives in `apps/web/src/components/ui/` (`Card`, `SectionHeader`, `Badge`, `StatPill`, `Chip`, `EmptyState`, `Divider`, `Row`, `IconLabel`, `KeyValue`, `CostEntry`, `RewardChip`) before reaching for raw markup. Add a primitive when a pattern shows up on ≥2 pages or ≥3 times on one page.
- **Reference page:** `apps/web/src/features/home/HomePage.tsx` (plus `BannerCarousel.tsx`, `MissionRow.tsx`, and `HomePageSkeleton`) is the canonical Tailwind + UI-kit example. The legacy `HomePage.css` has been removed.
- **Existing page CSS:** Other pages keep their `.css` files for now — convert them in follow-up tasks; do not mass-rewrite.

## Gotchas
- Stat-bearing equip/unequip actions are blocked when the target entity is non-idle (`working`, `mission`, `injured`).
- Some visual effect combinations may not compose well; order matters (halos outside, surface effects inside).
- CSP is deliberately off for flexibility; `helmet` is used for other security headers.
- Production environment variables `JWT_SECRET`, `ADMIN_SECRET`, and `CORS_ORIGIN` are mandatory.

## Pointers
- **Development principles skill**: `.agents/skills/derp-dev-principles/SKILL.md`
- **Prisma Documentation**: `https://www.prisma.io/docs/`
- **NestJS Documentation**: `https://docs.nestjs.com/`
- **React Documentation**: `https://react.dev/`
- **Vite Documentation**: `https://vitejs.dev/`
- **pnpm Documentation**: `https://pnpm.io/`
- **Cardano CIP-30**: `https://cips.cardano.org/cip/cip30/`
- **Cardano CIP-8**: `https://cips.cardano.org/cip/cip8/`