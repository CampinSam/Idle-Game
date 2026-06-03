---
name: Dev DB migration divergence
description: Why dev shows many old migrations as "not yet applied" — expected, pre-existing condition.
---

The dev database has been built up over time using `prisma db push` (and occasional raw SQL) rather than `prisma migrate dev`. As a result, many historical migration files in `prisma/migrations/` are not recorded in dev's `_prisma_migrations` table.

**The rule:** This is expected and does not affect production. `prisma migrate deploy` in production only looks at production's `_prisma_migrations` table to decide what to apply.

**When adding a new migration that was already applied to dev via raw SQL:**
Use `prisma migrate resolve --applied <migration_name>` to mark it as applied in dev without re-running the SQL.

**Why:** Avoids false "pending" status and keeps dev status from growing more confusing.
