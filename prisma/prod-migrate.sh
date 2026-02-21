#!/bin/bash
set -e

cd /home/runner/workspace

echo "Checking for failed migrations..."
node prisma/reset-prod-db.js

echo "Running prisma migrate deploy..."
npx prisma migrate deploy

echo "Running seed..."
npx tsx prisma/seed.ts
