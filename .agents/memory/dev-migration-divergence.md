---
name: Schema migration policy
description: prisma migrate dev is mandatory for all schema changes; db push is forbidden.
---

**Rule:** Always use `prisma migrate dev --name <description>` for schema changes. Never use `prisma db push`.

**Why:** Production runs `prisma migrate deploy`, which only applies files in `prisma/migrations/`. `db push` updates the local dev DB without writing a migration file, so production never sees the change. This caused the `item_defs.dustingData` column to be missing in production, breaking every publish attempt with `P2022: column does not exist`.

**How to apply:** For every `schema.prisma` edit, run `prisma migrate dev` before committing. The migration file and schema change must ship together.

**`db push` exception:** Only acceptable for throwaway experiments you are about to discard. If you keep the change, you must follow up with `migrate dev`.

**Historical note:** Many old migration files were created after the fact to patch columns that were originally added via `db push`. Those gaps are closed. Going forward, every schema change must have a migration file from the start.
