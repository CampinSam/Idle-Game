#!/bin/bash

cd /home/runner/workspace

cleanup() {
  # Preserve the original exit code (passed in as $1) so a failed
  # `pnpm prisma generate` or build step actually surfaces as a non-zero
  # workflow exit instead of being masked by `exit 0`.
  local rc=${1:-0}
  kill $(jobs -p) 2>/dev/null
  exit "$rc"
}
trap 'cleanup $?' SIGTERM SIGINT EXIT

echo "Building shared packages..."
pnpm --filter @derp/shared build || { echo "shared build failed"; exit 1; }
pnpm --filter @derp/math build   || { echo "math build failed";   exit 1; }

# Regenerate the Prisma client on every boot so it can never drift from
# `prisma/schema.prisma`. Without this, a schema change pulled from git
# (or any branch switch) leaves a stale client on disk and the next API
# bootstrap fails on the very first upsert with a confusing "Argument X
# is missing" error — exactly the silent hang Task #368 chased down.
# Hard-stop on failure so we never start the API against a stale client.
echo "Regenerating Prisma client..."
pnpm prisma generate || { echo "prisma generate failed — refusing to start API with stale client"; exit 1; }

echo "Starting API server..."
pnpm --filter @derp/api dev &
API_PID=$!

echo "Starting web dev server..."
pnpm --filter @derp/web dev &
WEB_PID=$!

wait $WEB_PID
