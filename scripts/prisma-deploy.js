#!/usr/bin/env node
/**
 * Idempotent Prisma deploy wrapper.
 *
 * Why this exists:
 *   An earlier deployment build command used `prisma db push --accept-data-loss`,
 *   which mutates the database schema WITHOUT recording entries in
 *   `_prisma_migrations`. After we switched to `prisma migrate deploy`, those
 *   migrations whose DDL had already been silently applied via push now fail
 *   with errors like "type AudioBus already exists".
 *
 * What this script does:
 *   For each migration NOT marked applied in `_prisma_migrations`, parse the
 *   migration's SQL to extract the creation statements (CREATE TYPE,
 *   CREATE TABLE, ALTER TABLE ... ADD COLUMN) that lack idempotency guards
 *   (no IF NOT EXISTS / IF EXISTS), and probe the database to see whether
 *   those objects already exist. If EVERY non-idempotent creation in the
 *   migration would already conflict, the migration was clearly pre-applied
 *   via `db push`, so we baseline it via `prisma migrate resolve --applied`.
 *
 *   Then we run `prisma migrate deploy` normally. On a healthy database (no
 *   drift) the baseline pass is a no-op, so this script is safe to run on
 *   every deploy.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations');
const SCHEMA_PATH = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');

// These additive replay migrations must execute: the drift heuristic can see
// conflicts from only part of their DDL and incorrectly baseline the remainder.
const MUST_EXECUTE_REPLAY_MIGRATIONS = new Set([
  '20260209000000_replay_prerequisite_tables',
  '20260516060100_replay_global_active_power_effect_fields',
  '20260629000000_add_safe_schema_gaps',
]);

function shouldAutoBaselineMigration(name) {
  return !MUST_EXECUTE_REPLAY_MIGRATIONS.has(name);
}

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Extract from a migration.sql the set of objects it creates that would FAIL
 * if those objects already exist (i.e. statements without `IF NOT EXISTS`).
 *
 * Returns: { types: string[], tables: string[], columns: Array<{table, column}> }
 * or null when the migration contains no detectable creation statements
 * (e.g. pure DROPs, UPDATEs, idempotent ADDs) — those should NOT be auto-baselined.
 */
function extractConflictingCreations(sql) {
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const types = [];
  const tables = [];
  const columns = [];
  const constraints = [];
  // Columns added with IF NOT EXISTS are idempotent DDL, but they still represent
  // schema state that must exist before we can safely baseline a migration.
  // Track them separately so the baseline check can confirm they are present.
  const softColumns = [];

  const typeRe = /CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  let m;
  while ((m = typeRe.exec(stripped)) !== null) {
    if (!/IF\s+NOT\s+EXISTS/i.test(m[0])) types.push(m[1]);
  }

  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  while ((m = tableRe.exec(stripped)) !== null) {
    if (!/IF\s+NOT\s+EXISTS/i.test(m[0])) tables.push(m[1]);
  }

  const colRe = /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  while ((m = colRe.exec(stripped)) !== null) {
    if (/IF\s+NOT\s+EXISTS/i.test(m[0])) {
      softColumns.push({ table: m[1], column: m[2] });
    } else {
      columns.push({ table: m[1], column: m[2] });
    }
  }

  // ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS guard in PostgreSQL —
  // every such statement is non-idempotent.
  const constraintRe = /ADD\s+CONSTRAINT\s+"([^"]+)"/gi;
  while ((m = constraintRe.exec(stripped)) !== null) {
    constraints.push(m[1]);
  }

  if (types.length === 0 && tables.length === 0 && columns.length === 0 && constraints.length === 0 && softColumns.length === 0) {
    return null;
  }
  return { types, tables, columns, constraints, softColumns };
}

async function ensureMigrationsTable(client) {
  const r = await client.query(
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists",
  );
  return r.rows[0].exists;
}

async function hasAnyUserTables(client) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name != '_prisma_migrations' LIMIT 1",
  );
  return r.rowCount > 0;
}

async function appliedMigrations(client) {
  const r = await client.query(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL",
  );
  return new Set(r.rows.map((row) => row.migration_name));
}

async function failedMigrations(client) {
  const r = await client.query(
    "SELECT migration_name FROM _prisma_migrations WHERE started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL",
  );
  return r.rows.map((row) => row.migration_name);
}

function resolveAsRolledBack(name) {
  console.log(`[prisma-deploy] Resetting failed migration ${name} so it can be re-applied`);
  execSync(`npx prisma migrate resolve --rolled-back ${name} --schema=${SCHEMA_PATH}`, {
    stdio: 'inherit',
  });
}

async function typeExists(client, name) {
  const r = await client.query('SELECT 1 FROM pg_type WHERE typname = $1 LIMIT 1', [name]);
  return r.rowCount > 0;
}

async function tableExists(client, name) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1",
    [name],
  );
  return r.rowCount > 0;
}

async function columnExists(client, table, column) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1",
    [table, column],
  );
  return r.rowCount > 0;
}

async function constraintExists(client, name) {
  const r = await client.query(
    'SELECT 1 FROM pg_constraint WHERE conname = $1 LIMIT 1',
    [name],
  );
  return r.rowCount > 0;
}

async function allCreationsConflict(client, creations) {
  for (const t of creations.types) {
    if (!(await typeExists(client, t))) return false;
  }
  for (const t of creations.tables) {
    if (!(await tableExists(client, t))) return false;
  }
  for (const c of creations.columns) {
    if (!(await columnExists(client, c.table, c.column))) return false;
  }
  for (const c of creations.constraints) {
    if (!(await constraintExists(client, c))) return false;
  }
  // Also require any IF NOT EXISTS columns to already be present.
  // Without this check, a migration whose only non-idempotent statements are
  // ADD CONSTRAINT can be falsely baselined when the constraint name pre-existed
  // (e.g. a table's original PK), even though the IF NOT EXISTS columns it adds
  // are genuinely missing from the database.
  for (const c of (creations.softColumns || [])) {
    if (!(await columnExists(client, c.table, c.column))) return false;
  }
  return true;
}

async function anyCreationsConflict(client, creations) {
  for (const t of creations.types) {
    if (await typeExists(client, t)) return true;
  }
  for (const t of creations.tables) {
    if (await tableExists(client, t)) return true;
  }
  for (const c of creations.columns) {
    if (await columnExists(client, c.table, c.column)) return true;
  }
  for (const c of creations.constraints) {
    if (await constraintExists(client, c)) return true;
  }
  for (const c of (creations.softColumns || [])) {
    if (await columnExists(client, c.table, c.column)) return true;
  }
  return false;
}

function resolveAsApplied(name) {
  console.log(`[prisma-deploy] Baselining ${name} (DDL already present in DB)`);
  execSync(`npx prisma migrate resolve --applied ${name} --schema=${SCHEMA_PATH}`, {
    stdio: 'inherit',
  });
}

function runMigrateDeploy() {
  console.log('[prisma-deploy] Running prisma migrate deploy');
  execSync(`npx prisma migrate deploy --schema=${SCHEMA_PATH}`, { stdio: 'inherit' });
}

function runPrismaGenerate() {
  console.log('[prisma-deploy] Running prisma generate');
  execSync(`npx prisma generate --schema=${SCHEMA_PATH}`, { stdio: 'inherit' });
}

function runSeed() {
  // Seed runs after migrations and generate so the Prisma client reflects the
  // current schema. All seeders use upsert / createMany+skipDuplicates so this
  // step is fully idempotent — running it multiple times against the same
  // database produces no errors and no duplicate data.
  //
  // NODE_ENV=production is passed explicitly so prisma/seed.ts skips the
  // dev-only test-account seeder — only definition/content tables are touched.
  console.log('[prisma-deploy] Running prisma db seed (production mode)');
  execSync(`npx prisma db seed --schema=${SCHEMA_PATH}`, {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[prisma-deploy] DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const hasMigrationsTable = await ensureMigrationsTable(client);

    if (!hasMigrationsTable) {
      const nonEmpty = await hasAnyUserTables(client);
      if (nonEmpty) {
        // Schema exists (e.g. copied from dev via db push) but has no migration
        // history. Baseline historical migrations so migrate deploy doesn't hit
        // P3005, but leave additive replay migrations pending so their remaining
        // DDL is applied.
        const all = listMigrations();
        const toBaseline = all.filter(shouldAutoBaselineMigration);
        console.log(
          `[prisma-deploy] No _prisma_migrations table but schema is non-empty — baselining ${toBaseline.length} historical migrations; leaving ${all.length - toBaseline.length} replay migration(s) for deploy`,
        );
        for (const name of toBaseline) {
          resolveAsApplied(name);
        }
        for (const name of all.filter((migration) => !shouldAutoBaselineMigration(migration))) {
          console.log(`[prisma-deploy] ${name}: protected replay migration — leaving for migrate deploy`);
        }
      } else {
        console.log(
          '[prisma-deploy] Empty database, no _prisma_migrations table — prisma migrate deploy will create it',
        );
      }
    } else {
      // Reset any migrations that started but never finished (failed mid-apply).
      // Marking them as rolled-back lets migrate deploy re-attempt them on this run.
      const failed = await failedMigrations(client);
      for (const name of failed) {
        resolveAsRolledBack(name);
      }

      const applied = await appliedMigrations(client);
      const all = listMigrations();
      const unapplied = all.filter((m) => !applied.has(m));
      const dbIsNonEmpty = await hasAnyUserTables(client);

      if (unapplied.length === 0) {
        console.log('[prisma-deploy] No unapplied migrations — nothing to baseline');
      } else {
        console.log(
          `[prisma-deploy] Found ${unapplied.length} unapplied migration(s); checking for drift…`,
        );

        for (const name of unapplied) {
          if (!shouldAutoBaselineMigration(name)) {
            console.log(
              `[prisma-deploy] ${name}: protected replay migration — leaving for migrate deploy`,
            );
            continue;
          }

          const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
          if (!fs.existsSync(sqlPath)) continue;
          const sql = fs.readFileSync(sqlPath, 'utf8');
          const creations = extractConflictingCreations(sql);

          if (!creations) {
            console.log(
              `[prisma-deploy] ${name}: no detectable non-idempotent creations — leaving for migrate deploy`,
            );
            continue;
          }

          if (await allCreationsConflict(client, creations)) {
            resolveAsApplied(name);
          } else if (dbIsNonEmpty && (await anyCreationsConflict(client, creations))) {
            // Partial conflict: some but not all DDL already exists in the DB.
            // This happens when the schema was partially copied out-of-band (e.g.
            // via Replit's "copy dev schema to production" flow). Baselining avoids
            // the "type already exists" error while still letting subsequent
            // migrations apply any schema that is genuinely missing.
            console.log(
              `[prisma-deploy] ${name}: partially present in DB — baselining to avoid conflicts`,
            );
            resolveAsApplied(name);
          } else {
            console.log(
              `[prisma-deploy] ${name}: not fully present in DB — leaving for migrate deploy`,
            );
          }
        }
      }
    }
  } finally {
    await client.end();
  }

  // Step 1: apply pending migrations (baselining handled above)
  runMigrateDeploy();

  // Step 2: regenerate the Prisma client so the seed script sees the
  // up-to-date types produced by the migrations we just applied.
  runPrismaGenerate();

  // Step 3: upsert all game definition data so dev and prod stay in sync
  // without manual intervention. Runs on every deploy; fully idempotent.
  runSeed();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[prisma-deploy] failed:', err);
    process.exit(1);
  });
}

module.exports = { shouldAutoBaselineMigration };
