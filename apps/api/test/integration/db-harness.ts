/**
 * Real-DB test harness for NestJS modules.
 *
 * Boots a Nest testing module against the `integration_test` Postgres schema
 * (set up by `global-setup.ts`) and exposes:
 *   - `app`: the compiled INestApplication for getting providers
 *   - `prisma`: the live PrismaService (NOT mocked)
 *   - `resetDb()`: TRUNCATE every table in the test schema between tests
 *   - `close()`: tear down the Nest app + Prisma client
 *
 * Usage:
 *   ```ts
 *   let h: TestHarness;
 *   beforeAll(async () => { h = await createTestHarness(); });
 *   afterAll(async () => { await h.close(); });
 *   beforeEach(async () => { await h.resetDb(); });
 *   ```
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestHarness {
  app: INestApplication;
  module: TestingModule;
  prisma: PrismaService;
  resetDb: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    module,
    prisma,
    resetDb: () => resetDb(prisma),
    close: async () => {
      await app.close();
    },
  };
}

/**
 * Truncate every table in the `integration_test` schema. We discover tables
 * dynamically from `pg_tables` so the harness keeps working as the Prisma
 * schema evolves — no maintenance burden adding a model.
 *
 * Excludes `_prisma_migrations` (Prisma's own bookkeeping table) so db push
 * doesn't think the schema is empty on the next run.
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'integration_test'
      AND tablename NOT LIKE '\\_%' ESCAPE '\\'
  `;
  if (rows.length === 0) return;
  const qualified = rows
    .map((r) => `"integration_test"."${r.tablename}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${qualified} RESTART IDENTITY CASCADE`,
  );
}
