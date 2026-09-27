# Parallel-agent Git workflow

This repository is a pnpm monorepo. Keep the web application in `apps/web`, the NestJS API in `apps/api`, shared contracts in `packages/shared`, game math in `packages/math`, and database history in `prisma/`. An agent's branch is a unit of review, not an isolated runtime environment.

## Isolation and integration

- Prerequisites: Node.js 20, pnpm 9, PostgreSQL 16 command-line tools (`initdb`, `pg_ctl`, `psql`, `createdb`), and Git. From a **clean, committed** integration checkout:
  ```bash
  bash scripts/agent-env.sh create alice
  cd ../agent-worktrees/alice
  bash scripts/agent-env.sh setup
  bash scripts/agent-env.sh check
  bash scripts/agent-env.sh start
  ```
  `create` branches `agent/alice` from the current HEAD and creates a sibling worktree. `setup` initializes a PostgreSQL cluster under that worktree's ignored `.agent-local/`, bound only to its private Unix socket. `check` installs from the lockfile, generates Prisma, builds/type-checks, lints, runs unit tests, deploys **every tracked migration** to its own empty database, then checks migration status. `start` runs the dev API and web server on worktree-specific ports (printed in the terminal). Use `bash scripts/agent-env.sh run <command...>` for additional commands with the same isolated environment. `stop` stops that worktree's database; it does not delete data. Never use `pnpm prisma ...` directly when working in an agent worktree: that could inherit the parent workspace's `DATABASE_URL`.
- The wrapper clears inherited environment variables, including database and Object Storage settings, and sets a private HOME, pnpm store, XDG cache/data/config paths, and temporary directory under `.agent-local/` for each checkout. Runtime seed sync therefore uses the committed `prisma/seed-data.json` fallback locally and cannot fetch or upload shared Object Storage content. No production credentials are needed. The local passwordless PostgreSQL server accepts connections only through the checkout-private socket. If `check` fails, leave the database and logs in `.agent-local/` for diagnosis; do not point it at another agent's database.
- To finish: stop the app, run `bash scripts/agent-env.sh stop`, commit the branch, and merge normally. Remove a **disposable** agent worktree with `git worktree remove` only after its local data and branch are no longer needed. Do not force-remove someone else's worktree.
- Use **one branch and one worktree per agent**. Branch from an up-to-date integration branch, keep changes scoped, and merge through reviewed pull requests. Do not have two agents editing the same checkout.
- Give each agent a **separate disposable development PostgreSQL database**. Branches do not isolate a shared database; never point test or migration commands at production or another agent's DB. Do not use `prisma db push` to deliver schema changes.
- Serialize ownership of `prisma/schema.prisma`, `prisma/migrations/`, `packages/shared/`, the root lockfile, the web/API app shells and sync plumbing, and canonical content exports. Assign one integrator to a cross-cutting change, or sequence dependent branches after the upstream change merges. Regenerate Prisma and rebuild shared packages when switching branches.
- A schema change needs a new migration committed alongside the schema; preserve all prior migration files and the migration lockfile. Do not edit or rebaseline historical migrations to make a new environment pass. On failure, diagnose the migration/schema divergence in a disposable database before changing anything.
- Definition content is authoritative in Object Storage at `seed/seed-data.json`; `prisma/seed-data.json` is a cold-start fallback. Coordinate admin edits and exports through one content owner. A branch with code changes does not automatically carry edits made to shared Object Storage. Review and promote an export deliberately; do not run production seed/export tooling as part of an agent's local checks.
- Do not bypass layer boundaries for speed: player UI reads the sync store and calls the central API adapter/command hook; it does not mutate server-owned state or duplicate gameplay formulas. Commands and services own server mutations, including transaction, idempotency, and resulting patches. New shared shapes must be reviewed in both apps and the admin definition editor.

## Pull-request checks

CI uses a clean checkout and an isolated PostgreSQL service. It installs the lockfile, generates Prisma, builds and type-checks workspaces, lints, runs unit tests, applies migrations to an empty database, checks migration status, and checks its remaining schema differences against a reviewed fingerprint. It never runs the production deploy/baselining script or seed, and needs no production credentials.

**Known schema difference:** Fresh replay includes all application tables and required columns, but it also preserves legacy tables/fields and some historical defaults and constraints that differ from `schema.prisma`. The fingerprint check fails on *new* differences and prints the actual SQL; it does not claim the residual differences have been fixed. Do not update the fingerprint without reviewing the complete generated diff, testing on a disposable database, and documenting whether existing player data is affected. Reconciling the remaining tables/fields and constraints requires a separate data-safety decision; see [migration replay notes](./migration-replay-notes.md).

For changes that touch the sync protocol, include tests for both server serialization/patch generation and client patch consumption. For schema and content work, describe how a fresh database and existing data are affected; production migration approval remains a separate release decision.

See [Web/API sync contract](./web-api-sync-contract.md) for the current cross-app interface.