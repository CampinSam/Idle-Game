---
name: Migration replay safety
description: Why empty-database validation and populated-database deployment need independent safety checks.
---

Treat a clean migration replay and a safe rollout on an existing database as two separate proofs. Do not infer that an additive, idempotent migration is safe on populated databases solely because it passes on an empty PostgreSQL instance. A schema change can preserve rows while changing their interpretation, and a deployment wrapper that auto-baselines partial DDL can skip required steps.

**Why:** Repairing a historical migration gap revealed both out-of-band schema objects and legacy data whose meaning cannot be inferred from the current schema. Empty replay and schema-diff checks could not expose those risks; explicit failure on ambiguous populated state was safer than automatic conversion.

**How to apply:** For future schema work, exercise an isolated populated/partially baselined fixture in addition to fresh replay, check that migration wrappers actually execute the new SQL, and require a separately reviewed data-migration plan for destructive or semantic conversions.