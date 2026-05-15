#!/bin/bash

cd /home/runner/workspace

cleanup() {
  kill $(jobs -p) 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT EXIT

echo "Building shared packages..."
pnpm --filter @derp/shared build
pnpm --filter @derp/math build

# Regenerate the Prisma client on every boot so it can never drift from
# `prisma/schema.prisma`. Without this, a schema change pulled from git
# (or any branch switch) leaves a stale client on disk and the next API
# bootstrap fails on the very first upsert with a confusing "Argument X
# is missing" error — exactly the silent hang Task #368 chased down.
echo "Regenerating Prisma client..."
pnpm prisma generate

echo "Starting API server..."
pnpm --filter @derp/api dev &
API_PID=$!

echo "Starting web dev server..."
pnpm --filter @derp/web dev &
WEB_PID=$!

wait $WEB_PID
