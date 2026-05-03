/**
 * Jest global setup for real-DB integration tests.
 *
 * Strategy:
 *   - Take the existing DATABASE_URL (pointing at the dev Postgres) and force
 *     the Prisma `?schema=` query parameter to a dedicated `integration_test`
 *     schema. This isolates test data from dev data inside the SAME Postgres
 *     instance — no separate database server required.
 *   - Run `prisma db push --accept-data-loss` against that schema so the
 *     schema matches `prisma/schema.prisma` HEAD. db push is idempotent and
 *     orders of magnitude faster than `migrate deploy` for a test harness.
 *   - The push happens ONCE per `pnpm test:integration` invocation; tests
 *     truncate between cases via `resetDb()` from `db-harness.ts`.
 *
 * To run: `TEST_DATABASE_URL` (optional) overrides the auto-derived URL.
 * Set DATABASE_URL is required either way (Replit projects always have it).
 */
import { execSync } from 'child_process';
import * as path from 'path';

export default async function globalSetup() {
  const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      'Integration tests require DATABASE_URL (or TEST_DATABASE_URL) to be set.',
    );
  }

  // Force schema=integration_test (preserving every other query param).
  const url = new URL(baseUrl);
  url.searchParams.set('schema', 'integration_test');
  const testUrl = url.toString();

  // Expose to the worker process so PrismaService picks up the test schema.
  process.env.DATABASE_URL = testUrl;

  // Push the latest schema to the test schema. db push is idempotent and
  // accepts data loss because we're going to TRUNCATE before every test
  // anyway, so any existing data in `integration_test` is fair game.
  const schemaPath = path.resolve(__dirname, '../../../../prisma/schema.prisma');
  execSync(
    `npx prisma db push --schema=${schemaPath} --skip-generate --accept-data-loss`,
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testUrl },
    },
  );
}
