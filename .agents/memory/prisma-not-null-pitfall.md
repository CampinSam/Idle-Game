---
name: Prisma NOT filter excludes NULLs
description: NOT { field: value } in Prisma WHERE clauses silently excludes rows where the field is NULL, matching PostgreSQL's three-valued logic.
---

# Prisma NOT filter excludes NULLs

## The Rule
Never use `NOT: { field: value }` when NULL in that field means "unrestricted" / "infinite".
Prisma translates `NOT: { field: 0 }` to `NOT (field = 0)` which in PostgreSQL evaluates to
NULL (not TRUE) when `field IS NULL`. Those rows are silently dropped from results.

**Why:** SQL three-valued logic — any comparison involving NULL returns NULL, not TRUE or FALSE.
`NOT NULL` → NULL, which is falsy in a WHERE clause.

## How to Apply
Whenever a nullable column has a semantic "null = no restriction / infinite", use an explicit OR:

```typescript
// ❌ WRONG — silently excludes null rows
{ NOT: { remainingChargeUnits: 0 } }

// ✅ CORRECT — null = infinite, positive = has uses, 0 = exhausted
{
  OR: [
    { remainingChargeUnits: null },       // infinite
    { remainingChargeUnits: { gt: 0 } }, // has remaining uses
  ],
}
```

## Where It Bit Us
`PowerGrantService.findActiveGrant` used `NOT: { remainingChargeUnits: 0 }` to skip exhausted
grants. The schema comment says `null = infinite`, so all real NFT grants (which use null) were
never returned by the query. The fix was an explicit OR with `null` + `{ gt: 0 }` arms.
Discovery method: integration test seeding grants with null remainingChargeUnits and calling the
real handler — the test got NotFoundException instead of the expected success.

File fixed: `apps/api/src/modules/global-power/power-grant.service.ts` — `findActiveGrant`.
