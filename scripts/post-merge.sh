#!/bin/bash
set -e

pnpm install --frozen-lockfile 2>/dev/null || pnpm install

cd packages/shared && pnpm run build && cd ../..
cd packages/math && pnpm run build && cd ../..

npx prisma generate --schema=prisma/schema.prisma
