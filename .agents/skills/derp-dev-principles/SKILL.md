---
name: derp-dev-principles
description: Development principles and patterns for the Derp Universe project. Load this skill before starting any feature work, bug fix, or refactor on this codebase.
---

# Derp Universe — Development Principles

These principles are derived from the architecture decisions and bugs encountered during active development. Apply them to every task.

---

## 1. Server Authority

The server is the single source of truth for all game state.

- All game logic, calculations, rule evaluation, and state mutations live exclusively in the NestJS backend.
- The frontend only **renders** what the sync store provides. It never calculates authoritative values.
- The one accepted exception is **cosmetic progress emulation** — e.g. a timer counting down visually — which is clearly labeled as display-only and never submitted back as state.
- Never duplicate a formula on the client. If the client needs a derived value, the server must provide it in the bootstrap snapshot or via a patch.

---

## 2. Transactional DB Writes

- Any service method that writes to the database must accept an optional Prisma transaction client (`tx`) parameter and forward it to all nested writes.
- Services called inside Prisma interactive transactions (e.g. `TelemetryService.record()`, `NotificationService.createNotification()`) **must** receive the `tx` client — never open a parallel connection inside a transaction.
- Pattern:
  ```typescript
  async myMethod(data: MyDto, tx?: PrismaClient) {
    const db = tx ?? this.prisma;
    await db.someModel.create({ data });
  }
  ```

---

## 3. Command Handler Contract

All player write operations go through `POST /v1/commands` and follow this strict shape:

1. **Validate** — check required fields, throw `BadRequestException` on failure.
2. **Verify ownership** — confirm the player owns the resource, throw `ForbiddenException` otherwise.
3. **Mutate** — all DB writes happen inside the provided `ctx.tx` transaction.
4. **Build patches** — use `PatchBuilder` and the `build*Patches` helpers to describe every state change.
5. **Return** — emit `{ patches, ui }`. Never return raw data. All state changes reach the client through patches only.

Missing a patch = silent client drift. If a command touches currencies, items, player data, or active effects, the relevant `buildCurrencyPatches`, `buildItemPatches`, `buildPlayerPatch`, or `buildEntityPatch` helpers must be called.

---

## 4. Sync-State Discipline (Frontend)

- All frontend reads come from `useSyncSelectors` hooks backed by the Redux sync store.
- All player actions that change server state go through the `useCommand` hook, which applies the resulting patches back to the store.
- Never maintain parallel local state for data the server owns. If a value comes from the server, it lives in the sync store — not in `useState`.
- Real-time updates arrive via SSE (`/v1/stream`). Do not poll for state changes.

---

## 5. Admin Schema Fidelity (Critical)

Two files must always stay in sync with the Prisma schema:

### `packages/shared/src/schemas/definition-schemas.json`
Drives validation and documents data structures for content editors. Update it whenever a model field is added, removed, or renamed.

### `apps/web/src/features/admin/smart/tableSchemas.ts`
Drives the Smart Editor UI. **Field names must exactly match Prisma column names — no aliases.** Rules:
- Use `ref` type for FK string fields → renders as a searchable dropdown.
- Use `enum` or `options` for Prisma enum columns → renders as a select.
- Use `json` for Prisma `Json` columns, even if the value is a structured object. Never use `enum` for a `Json` column.
- Provide a sensible structural `default` for complex JSON fields so editors see the expected shape immediately.
- When a field was added to Prisma, it must be added to `tableSchemas.ts` in the **same commit** — the LootboxDef `outcomePool`/`outcomes` incident is the canonical example of what happens when they drift.

### `packages/shared/src/schemas/admin-schemas.md`
Human-readable documentation for admins. Update it when adding or significantly changing any definition table.

---

## 6a. Shared Naming and Structure Conventions

Whenever possible, data should share naming and structure conventions across the codebase. Don't invent new field names when the codebase already has one.

- Before adding a new field name (`currencyId`, `itemDefId`, `entries`, `qty`, `amount`), search how the same concept is already represented elsewhere. If the canonical resolver, mission service, crafting service, lootbox handler, or content editor already uses a name (e.g. `key`, `bundle`, `min`/`max`), reuse it.
- This applies in both directions:
  - **Inputs** — JSON specs read by the runtime (rewards, outcomes, requirements) should use the same field names everywhere a similar concept appears. The canonical reward shape is `{ type, key, min, max, odds?, requirements?, bundle? }`.
  - **Outputs** — grants, patches, and structured results returned to clients should use the same field names. Mixing `{ type, currencyId, amount }` in one path and `{ type, key, amount }` in another forces every consumer to write fallback chains.
- When you find an outlier path that invented its own names, prefer **converging it onto the canonical shape** over preserving the divergence. If converging would break too much at once, document the migration plan and converge incrementally — but the destination is always one shape.
- Outliers are a primary source of silent bugs: when the editor saves the canonical shape and one runtime path reads the legacy shape, fields read as `undefined`, amounts default to 0, and the user gets nothing — with no error.
- **Write-time migration is allowed; runtime read paths are not.** Normalizing legacy data on the way in (bootstrap load, seed upsert, admin save, claim time) is the right place to bridge old shapes to the canonical one. Runtime read paths (services that consume the stored shape) must read **only** the canonical shape — no `?? oldField` chains. This complements principle #6.
- Output fallback chains (e.g. a UI summary that reads `g.key ?? g.currencyId ?? g.itemDefId`) are tolerable as a transition aid for historical records that were stored before convergence — but every such chain should carry a comment naming the records it covers, and should be removed once those records are unreachable.
- A converging refactor often quietly **activates** behaviors that the canonical resolver implements but the outlier did not (e.g. `odds`, `requirements`, weighted picks, bundle_ref). Call these out in the PR / changelog so content authors aren't surprised when an entry that previously always granted now respects its `odds`.

---

## 6. No Legacy Fallbacks

The project has no production data to protect. When replacing a field name, function, or code path:

- **Remove** the old path entirely.
- Do not add `?? oldField` dual-read patterns or conditional bridges.
- Add proper error handling (`NotFoundException`, `BadRequestException`, `ForbiddenException`) in place of silent fallbacks.
- If something breaks during the transition, fix it properly — don't paper over it.

---

## 7. NestJS Exception Types

Always throw typed NestJS exceptions. Never use `throw new Error(...)` or return `null` to signal failure:

| Situation | Exception |
|---|---|
| Resource not found | `NotFoundException` |
| Invalid input / missing field | `BadRequestException` |
| Player doesn't own the resource | `ForbiddenException` |
| Auth required | `UnauthorizedException` |

---

## 8. Reusable Functions Over Specific Ones

- Before writing a new utility, check if an existing service or helper can be extended with a parameter.
- Keep business logic in services, not in controllers or command handlers.
- Helpers that span the whole system (patch building, requirement evaluation, reward resolution) live in dedicated utilities and are imported wherever needed.
- A function used in more than one place belongs in a shared module, not duplicated inline.

---

## 9. Reusable React Components

- Before building a new layout with raw `div` containers, check if an existing component covers it.
- Extract any UI element used more than twice into a shared component.
- Keep components focused on one job. A component that renders a card should not also fetch data.
- New `apps/web` UI uses Tailwind utility classes plus the shared kit at `apps/web/src/components/ui/`. CSS variables in `apps/web/src/index.css` remain the source of truth for theme tokens and are mirrored into `tailwind.config.js`. Existing `.css` files alongside legacy components stay until those pages are converted; do not introduce new `.css` files for new pages. See `replit.md` → "Frontend styling convention" for the full reference.
- **Every page-level section must sit inside a card, not directly against the page background.** When adding a new page, list, or feature region, wrap it in a card container (gradient bg, `rgba(139,92,246,0.25)` border, `border-radius: 16px`, `padding: 14px`) — see `.rewards-card` / `.achievement-section` for the canonical pattern. New top-level content rendered straight on the dark purple backdrop without a card is considered a layout bug.

---

## 10. Bootstrap & Delta Coverage

- When a new player-owned entity type is added (new DB model with a `userId` relationship), it **must** be included in the bootstrap snapshot in `apps/api/src/bootstrap.service.ts`. Clients that connect after the change must receive the new data immediately.
- Every field a command mutates must have a corresponding patch emitted. Audit patch coverage whenever a new command handler is written.

---

## 11. BigInt Serialization

- Currency balances, XP, and tick counters are stored as `BigInt` in Postgres.
- Always pass API responses through `serializeBigInts()` before returning from any endpoint.
- On the frontend, these arrive as strings. Parse carefully — never pass them raw to arithmetic.

---

## 12. Seed Data Location

- Definition content belongs in `apps/api/src/seeds/data/*.json` and is upserted on startup (idempotent, never destructive).
- Do not manually insert seed records through the admin panel as a substitute — they will be lost if the DB is reset.
- After adding entries to a seed file, confirm the relevant `seedDefinitions` call in `definitions.seed.ts` covers the new table.

---

## 13. Shared Package Changes

After editing anything in `packages/shared/` or `packages/math/`:

- The package must be rebuilt before the API or web app will see the changes.
- `start.sh` handles this on cold start, but mid-session edits require a workflow restart or a manual `pnpm --filter @derp/shared build`.
- Always restart the workflow after shared package changes before testing.

---

## 14. Two-Step Lootbox / Openable Item Pattern

Creating a functional lootbox requires two definition records:

1. **`LootboxDef`** — defines the outcome pool (`outcomes[]`), `rollCount`, and display.
2. **`ItemDef`** with `type: LOOTBOX` and `lootboxDefId` pointing to the `LootboxDef`.

When the player opens the item, the handler reads `lootboxDefId` from the item definition to locate the outcome pool. If `lootboxDefId` is missing, the command throws `BadRequestException`. This same two-step pattern applies to any item type that delegates behavior to a separate definition record.

---

## 15. Notification Source Lifecycle

Every notification is created with a `sourceType` / `sourceId` that identifies
the entity whose state the notification represents (a gift, job, quest, mission,
achievement, etc.). When that source entity transitions to a terminal state
(claimed, completed, collected, cancelled), the notification's relevance ends.
The command handler responsible for that transition **must** do both:

1. **Mark the notification read inside the transaction** — do an inline
   `findFirst` + `update` within the `ctx.tx` scope so the updated record is
   available as a return value from the service method. `markReadBySource` (which
   uses `updateMany` and returns only a count) is acceptable only for REST
   fire-and-forget paths that don't feed a patch back to the client.

2. **Emit a notification patch** — call `pb.upsertNotification(markedReadNotif)`
   so the client's Redux store reflects the read state in the same response cycle.
   Omitting this step causes the bell badge and unread indicator to persist after
   the player has acted — a "ghost notification" that silently erodes trust.

**Correct reference handlers:** `complete-mission.handler.ts`,
`collect-crafting.handler.ts`, `complete-building.handler.ts`,
`claim-gift.handler.ts`, `claim-quest-reward.handler.ts`,
`claim-achievement-reward.handler.ts`.

**Risk pattern to avoid:** any handler that mutates or removes a sourced entity
without a corresponding `pb.upsertNotification()` or `pb.delete('notification', id)`
call. When adding a new command handler, explicitly ask: *does this action make
an existing notification irrelevant?* If yes, mark it read and emit the patch.

---

## 16. Icon-First Cost & Reward Display

When showing a currency or item quantity anywhere in the UI (costs, rewards, balances, production rates), always render an **icon + amount** pair — never a plain text string like `"100 gold"`.

### Rules

- **Use `ItemQty`** (`apps/web/src/components/ItemQty.tsx`) for any quantity display. Pass the currency/item `id` (or resolved `iconKey`) as `src` and the numeric amount as `amount`.
- **Use `CostEntry`** (`apps/web/src/components/ui/CostEntry.tsx`) for cost rows — it is a thin semantic wrapper around `ItemQty`.
- **Resolve icons via `resolveIcon`** (`apps/web/src/utils/iconResolver.ts`) when you have access to `currencyDefs`/`itemDefs` and the `iconKey` may differ from the `id`. Pass the result as `src` to `GameIcon` or `ItemQty`.
- **Display names must come from the definition's `name` field.** Use `resolveName` (which reads `def.name`) or look up the def directly. Do not derive, fabricate, or transform a human-readable name from a raw ID (no prefix-stripping, no underscore-to-space, no `toUpperCase` transforms). If no definition is found, show the raw `id` unchanged.
- **Never render `${amount} ${id}` as a plain string.** This applies in button annotations, tooltips, panels, footers, and anywhere else a cost or reward quantity appears.

### Canonical patterns

```tsx
// Correct — icon + amount
<ItemQty src={entry.id} amount={entry.amount} size={13} />

// Correct — when iconKey may differ from id
<ItemQty src={resolveIcon('CURRENCY', entry.id, currencyDefs, [])} amount={entry.amount} size={13} />

// Correct — semantic cost row
<CostEntry id={entry.id} amount={entry.amount} />

// Wrong — plain text
{`${entry.amount} ${entry.id}`}
```

### Reference implementations

- `apps/web/src/features/missions/components/MissionDetailFooter.tsx` — cost rows inside mission planning footer
- `apps/web/src/features/missions/components/MissionsList.tsx` — cost chips in the mission list
- `apps/web/src/features/locations/types/derpOutpost/components/BuildingCard.tsx` — production cost/output rows
