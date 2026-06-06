/**
 * Thin entry point so the script can be run from the repo root:
 *   npx tsx scripts/seed-test-account.ts
 *
 * All implementation lives in apps/api/src/seeds/seed-test-account.ts where
 * the API package's module resolution (Prisma client, @derp/math, etc.) is
 * available.  This wrapper re-executes the canonical script with the API
 * package as the working directory so every import resolves correctly.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..');
const script = resolve(repoRoot, 'apps/api/src/seeds/seed-test-account.ts');

execSync(`npx tsx "${script}"`, {
  stdio: 'inherit',
  cwd: resolve(repoRoot, 'apps/api'),
});
