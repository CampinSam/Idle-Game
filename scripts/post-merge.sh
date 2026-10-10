#!/bin/bash
set -e

pnpm install --frozen-lockfile 2>/dev/null || pnpm install

cd packages/shared && pnpm run build && cd ../..
cd packages/math && pnpm run build && cd ../..

# This project syncs schema with `prisma db push` (see replit.md), not the
# `prisma migrate` workflow, so the dev database has no _prisma_migrations
# baseline. Running `migrate deploy` here errors with P3005. Use `db push`
# to keep the post-merge environment in lockstep with the schema.
npx prisma db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate
npx prisma generate --schema=prisma/schema.prisma
