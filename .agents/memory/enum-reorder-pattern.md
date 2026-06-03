---
name: Enum reorder pattern
description: How to safely reorder a PostgreSQL enum when a partial index references the old type.
---

When you rename a PostgreSQL enum type (e.g. to reorder its values) and a partial index uses it in a WHERE clause, the normal ALTER COLUMN TYPE ... USING cast will fail with "operator does not exist".

**Pattern:**
1. Rename old type: `ALTER TYPE "Foo" RENAME TO "Foo_old"`
2. Create new type with correct order: `CREATE TYPE "Foo" AS ENUM (...)`
3. Drop all indexes on the column (especially partial indexes with WHERE clauses referencing the type)
4. Drop the column DEFAULT
5. Cast column to text: `ALTER TABLE t ALTER COLUMN c TYPE text USING c::text`
6. Drop the old type: `DROP TYPE "Foo_old"`
7. Cast text to new type: `ALTER TABLE t ALTER COLUMN c TYPE "Foo" USING c::"Foo"`
8. Restore the DEFAULT using the new type
9. Recreate all dropped indexes using the new type

**Why:** Partial indexes embed type-specific operators in their WHERE clauses. Renaming the type makes those operators unresolvable during the ALTER COLUMN TYPE step. Dropping the indexes first removes that dependency.
