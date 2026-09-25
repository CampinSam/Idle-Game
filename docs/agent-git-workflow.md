# Parallel-agent Git workflow

This repository is a pnpm monorepo. Keep the web application in `apps/web`, the NestJS API in `apps/api`, shared contracts in `packages/shared`, game math in `packages/math`, and database history in `prisma/`. An agent's branch is a unit of review, not an isolated runtime environment.

## Isolation and integration

- Use **one branch and one worktree per agent**. Branch from an up-to-date integration branch, keep changes scoped, and merge through reviewed pull requests. Do not have two agents editing the same checkout.
- Give each agent a **separate disposable development PostgreSQL database**. Branches do not isolate a shared database; never point test or migration commands at production or another agent's DB. Do not use `prisma db push` to deliver schema changes.
- Serialize ownership of `prisma/schema.prisma`, `prisma/migrations/`, `packages/shared/`, the root lockfile, the web/API app shells and sync plumbing, and canonical content exports. Assign one integrator to a cross-cutting change, or sequence dependent branches after the upstream change merges. Regenerate Prisma and rebuild shared packages when switching branches.
- A schema change needs a new migration committed alongside the schema; preserve all prior migration files and the migration lockfile. Do not edit or rebaseline historical migrations to make a new environment pass. On failure, diagnose the migration/schema divergence in a disposable database before changing anything.
- Definition content is authoritative in Object Storage at `seed/seed-data.json`; `prisma/seed-data.json` is a cold-start fallback. Coordinate admin edits and exports through one content owner. A branch with code changes does not automatically carry edits made to shared Object Storage. Review and promote an export deliberately; do not run production seed/export tooling as part of an agent's local checks.
- Do not bypass layer boundaries for speed: player UI reads the sync store and calls the central API adapter/command hook; it does not mutate server-owned state or duplicate gameplay formulas. Commands and services own server mutations, including transaction, idempotency, and resulting patches. New shared shapes must be reviewed in both apps and the admin definition editor.

## Pull-request checks

CI uses a clean checkout and an isolated PostgreSQL service. It installs the lockfile, generates Prisma, builds and type-checks workspaces, lints, runs unit tests, applies migrations to an empty database, checks migration status, and compares the migrated database with the Prisma schema. It never runs the production deploy/baselining script or seed, and needs no production credentials.

For changes that touch the sync protocol, include tests for both server serialization/patch generation and client patch consumption. For schema and content work, describe how a fresh database and existing data are affected; production migration approval remains a separate release decision.

See [Web/API sync contract](./web-api-sync-contract.md) for the current cross-app interface.