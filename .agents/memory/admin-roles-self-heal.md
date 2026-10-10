---
name: Admin roles self-heal pattern
description: How admin_roles got wiped and how the startup self-heal works
---

## Root cause of admin_roles / admin_accounts deletion

`db push --accept-data-loss` was run while the Prisma schema required `admin_roles.key TEXT NOT NULL UNIQUE`. Because existing rows had no `key` value, Prisma truncated `admin_roles` to satisfy the constraint. With the role table empty, `admin_accounts` (FK RESTRICT to `admin_roles`) was also effectively orphaned/empty. Game instance tables (entities, locations, users) were unaffected — only the admin tables were hit.

**Giveaway:** `admin_roles` has the `key` column but zero rows.

## Safeguard: BootstrapService.seedBuiltInRoles()

`BootstrapService.onModuleInit()` now always calls `seedBuiltInRoles()` before anything else (non-fatal try/catch). This method does a single `adminRole.upsert({ where: { key: 'role_super_admin' } })`. If the table was truncated, the role is recreated on next startup.

`seedDevAdmin()` (creates the `superadmin`/`admin` dev account) is only called when `NODE_ENV !== 'production'`, and only after `seedBuiltInRoles()` has run.

**Why:** Production should not have a default `superadmin/admin` account. Admins are created manually via the bootstrap x-admin-key auth. But the built-in role must always exist so that newly-created accounts can reference it.

## Safeguard: prisma/seed.ts syncBackToStorage()

After every deployment seed run, `syncBackToStorage()` does `findMany` on all 30 definition tables and uploads the fresh snapshot to Object Storage. This keeps the Object Storage snapshot's UUIDs aligned with whatever the production DB actually has, eliminating FK remap errors in the runtime `SeedSyncService`.
