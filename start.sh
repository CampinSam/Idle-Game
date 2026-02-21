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

echo "Starting API server..."
pnpm --filter @derp/api dev &
API_PID=$!

echo "Starting web dev server..."
pnpm --filter @derp/web dev &
WEB_PID=$!

wait $WEB_PID
