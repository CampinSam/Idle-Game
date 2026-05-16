# Derp Universe — Admin Schema Reference

Human-readable documentation for definition tables managed via the admin panel at `/admin/def`.

> **Task #367 update:** the former `BodySchema`, `EquipmentSchema`, `ProgressionProfile`, and `TraitDefinition` tables (and the `attributeMap` blob on `NftCollectionDef.data`) were collapsed into a single self-contained `EntityDefinition` row.
>
> **Task #371 update:** the legacy boolean/int progression columns (`leveling`, `ascension`, `mastery`, `prestigeEligible`, `maxLevel`, `ascensionCap`) and the top-level `attributeMap` column have been replaced with four structured JSON sub-objects: `progression`, `ascension`, `mastery`, and `init`. The old `attributeMap` now lives at `init.nft.attributeMap`.

---

## EntityDefinition

Self-contained blueprint for a species/type of game entity. One row per species (e.g. `derp_bird`, `perp`).

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier, also used as the `kind` for frontend rendering |
| name | string | Human-readable display name |
| speciesId | string | Species reference |
| slots | json | Body slot layout: `{ slotName: [allowedArchetype, ...] }` |
| equipmentSlots | json | Equipment slot capacities: `{ slotName: maxCount }` |
| traits | json | Per-archetype trait metadata, keyed by archetype name (see below) |
| progression | json | Progression rules: `{ enabled, maxLevel, xpCurve, statGain? }` (see [`progression` format](#progression-format)) |
| ascension | json | Ascension rules: `{ enabled, cap?, ... }` (see [`ascension` format](#ascension-format)). Currently `{ "enabled": false }` for all entities. |
| mastery | json | Mastery rules: `{ enabled, branches? }` (see [`mastery` format](#mastery-format)). Currently `{ "enabled": false }` for all entities. |
| init | json | Init rules used when minting an entity: `{ scratch, nft }` (see [`init` format](#init-format)). The renamed `attributeMap` lives at `init.nft.attributeMap`. |
| rules | json | Entity-type-specific rule overrides. Supports `rules.uniques` — a map of `nftAssetId → { powers: UniqueLocationPower[] }` for triggerable NFT powers (see [Unique NFT Powers](#unique-nft-powers-entitydefinition)). |
| data | json | Extra configuration |

### Known entity definitions

| ID | Body slots | Notes |
|----|-----------|-------|
| `derp_bird` | head, ears, beak, eyes, body, back, tail | 7-slot avian, teal card theme |
| `derpling` | head, ears, beak, eyes, body, back, tail | 7-slot avian |
| `derp_ape` | head, ears, beak, eyes, body, back, tail | 7-slot avian |
| `pred` | head, ears, beak, eyes, body, back, tail | 7-slot avian |
| `perp` | body, special, faction, leader | 4-slot perp layout, ships with `attributeMap` for the Cardano Perps collection |
| `derp_outpost` | head, ears, beak, eyes, body, back, tail | 7-slot avian (outpost variant) |

### `slots` format

Keys are slot names, values are arrays of allowed archetype strings. Example for the 7-slot avian layout used by Derp Birds, Derplings, Derp Apes, and Preds:

```json
{
  "head": ["Dave", "Astro", "Magician", "Ninja", "Redneck", "Stoner", "DJ", "Viking", "Monk", "Corpo", "Cyborg", "Buff", "Mad Scientist", "Deity"],
  "ears": ["..."],
  "beak": ["..."],
  "eyes": ["..."],
  "body": ["..."],
  "back": ["..."],
  "tail": ["..."]
}
```

The Perps definition uses a 4-slot layout with collection-specific archetype values:

| Slot | Allowed values |
|------|---------------|
| body | None, Yellow, Cyan, Grey, Purple, Neon, Blue |
| special | None, Sparkles, Leaves, Bubble Show, Water, Earthen, Ice Storm, Electric Aura, Low Life, Crystal Storm, Press Speech, Dark Energy, The Incubator |
| faction | None, Genovault, Astro Schism, Kraashers |
| leader | None, Leader, Multiverse Leader |

### `equipmentSlots` format

Equipment slot → max count:

```json
{
  "weapon": 1,
  "armor": 1,
  "accessory": 2
}
```

### `traits` format

Keyed by archetype name; each entry carries per-slot stat bonuses, classification tags, presentation hints, and optional scaling/rarity metadata. Trait metadata is now sourced exclusively from this embedded map — there is no longer a standalone trait table to look up.

```json
{
  "Ninja": {
    "slotStats": { "head": { "SPD": 1, "ATK": 1 }, "tail": { "SPD": 1 } },
    "tags": ["agile"],
    "emoji": "🥷",
    "color": "#0F172A",
    "gradient": "linear-gradient(135deg, #0F172A, #1E293B)",
    "scaling": { "ATK": 1.0, "SPD": 1.1 },
    "rarityMultiplier": 1.0,
    "rarity": null
  }
}
```

Entity stats are computed by summing the per-slot bonuses from each archetype assigned to each slot.

### `progression` format

```json
{
  "enabled": true,
  "maxLevel": 50,
  "xpCurve": { "kind": "geometric", "base": 100, "ratio": 1.15 },
  "statGain": {
    "guaranteed": { "ATK": 1, "DEF": 1, "SPD": 1, "FOC": 1, "LCK": 1, "VIT": 1 },
    "bonusPool": { "kind": "rarityScaled", "base": 14, "exponent": 0.16, "rarityField": "compositRarity" },
    "distribution": { "uniformShare": 0.5, "weightedShare": 0.5, "weightsField": "scaling" }
  }
}
```

`xpCurve` is one of `{ "kind": "geometric", "base": int, "ratio": float }` (XP for level L → L+1 = `floor(base × ratio^(L-1))`) or `{ "kind": "table", "perLevel": int[] }` (`perLevel[L-1]` is the XP needed to leave level L). `bonusPool` is either `{ "kind": "rarityScaled", base, exponent, rarityField? }` or `{ "kind": "flat", "amount": int }`. Omitting `statGain` reproduces the legacy 14-pool / 50-50 split exactly.

### `ascension` format

```json
{ "enabled": false, "cap": 5 }
```

Reserved for future gameplay (`enabled: true` will eventually unlock `costPerStep` and effect grants). All seeded entities ship with `{ "enabled": false }`.

### `mastery` format

```json
{ "enabled": false }
```

Reserved for future gameplay (`branches: object[]` will declare per-branch unlocks). All seeded entities ship with `{ "enabled": false }`.

### `init` format

```json
{
  "scratch": {
    "startingLevel": 1,
    "baseStats": { "ATK": 10, "DEF": 10, "SPD": 10, "FOC": 10, "LCK": 10, "VIT": 10 },
    "slotFill": { "kind": "singleRandomArchetype" }
  },
  "nft": {
    "attributeMap": { "meta_body": "body" },
    "missingSlotPolicy": "skip",
    "defaults": {}
  }
}
```

`init.scratch` controls non-NFT mints. `slotFill.kind` is one of:
- `singleRandomArchetype` (default) — one random archetype per slot.
- `multiRandomArchetype` with `count: int` — combines stat / scaling contributions from N distinct random archetypes per slot (the slot itself still stores one visible archetype).
- `fixed` with `fixed: { slot: archetype }` — pins specific archetypes per slot.

`startingLevel > 1` is supported: the generator runs the canonical weighted level-up loop using `progression.statGain` so stats and `levelHistory` match an entity that earned its way to that level.

`init.nft` controls NFT-backed claims. `attributeMap` translates raw on-chain attribute keys (case-insensitively; multiple raw keys may point to the same slot) to body-slot names. `missingSlotPolicy` is one of:
- `skip` — drop the slot from the build (preserves the legacy NFT-builder behavior; this is the default for collections that were already on this code path).
- `default` — use the slot's entry in `defaults`.
- `error` — throw if any allowed slot is missing.

**Example (Cardano Perps, embedded on the `perp` EntityDefinition under `init.nft.attributeMap`):**

```json
{
  "meta_body": "body",
  "meta_special": "special",
  "meta_faction": "faction",
  "meta_leader": "leader",
  "meta_multiverse leader": "leader"
}
```

### Perp trait stats (subset of `traits`)

| Archetype | Slot | Stats | Rarity |
|-----------|------|-------|--------|
| None | any | — | common |
| Yellow | body | ATK+1 | common |
| Cyan | body | DEF+1, SPD+1 | uncommon |
| Grey | body | VIT+1, DEF+1 | uncommon |
| Purple | body | FOC+1, LCK+1 | scare  |
| Neon | body | LCK+2 | rare |
| Blue | body | SPD+1, ATK+1 | rare |
| Sparkles | special | LCK+1 | uncommon |
| Leaves | special | VIT+1 | uncommon |
| Bubble Show | special | FOC+1 | scare  |
| Water | special | DEF+1 | scare  |
| Earthen | special | VIT+2 | rare |
| Ice Storm | special | SPD+1, DEF+1 | rare |
| Electric Aura | special | ATK+2 | epic      |
| Low Life | special | LCK+2 | rare |
| Crystal Storm | special | FOC+2 | epic      |
| Press Speech | special | ATK+1, LCK+1 | epic |
| Dark Energy | special | ATK+2, DEF+1 | epic |
| The Incubator | special | all+1 | legendary |
| Genovault | faction | DEF+1 | uncommon |
| Astro Schism | faction | FOC+1 | uncommon |
| Kraashers | faction | ATK+1 | uncommon |
| Leader | leader | all+1 | rare |
| Multiverse Leader | leader | ATK+2, DEF+2, FOC+2, SPD+1, LCK+1, VIT+2 | legendary |

### RND — hidden randomness stat

`RND` is a valid stat key in trait and effect definitions but is **never stored as a base entity stat**.

| Context | Behaviour |
|---------|-----------|
| `traits[archetype].slotStats` | RND is resolved immediately during entity generation: the entire bonus is added to a single randomly chosen visible stat (ATK/DEF/SPD/FOC/LCK/VIT). |
| `traits[archetype].scaling.RND` | Preserved as a scaling weight. At each level-up, any bonus points whose weighted draw lands on RND are redirected individually to a randomly chosen visible stat. |
| `stats.RND` (effect definition) | Resolved at the moment the effect is applied (instant) or stored (persistent). The full RND value lands on one randomly chosen visible stat and is locked in for the lifetime of the effect. |

Multiple separate `RND` entries (e.g. two effect specs each with `RND: 3`) each pick independently and may land on the same stat. A single `RND: N` entry always picks one stat and adds the full N to it.

RND is excluded from: PowerScore, Mission Power, role determination, and all stat display UI.

---

## NftCollectionDef

Links an on-chain NFT collection to an EntityDefinition or LocationDefinition.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| name | string | Admin-facing display name |
| chain | enum | CARDANO, ETH, BASE, MATIC |
| collectionId | string | On-chain policy/collection ID |
| entityDefinitionId | string? | Entity type for character NFTs |
| locationDefinitionId | string? | Location type for outpost NFTs |
| mintMode | enum | one_per_token |
| active | boolean | Whether syncing is active |
| data | json | Extra config (no longer carries `attributeMap` — that lives on the linked EntityDefinition) |

---

## Admin Backfill Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /admin/backfill/item-rarity` | One-time migration: renames `SCARCE→SCARE` in the enum type, merges `ADVANCED→RARE` and `ULTRA_RARE→EPIC` rows in `item_defs`. Fully idempotent — safe to re-run. Call this on production **before** publishing the schema change that removes old enum values. Returns `{ advanced, ultraRare, scarceRenamed, message }`. |
| `POST /admin/backfill/entity-stats` | Recompute `stats.scaling` and `stats.compositRarity` for all entities from stored traits |
| `POST /admin/backfill/nft-metadata` | Fetch and cache NFT metadata for outpost `LocationInstance` records missing `state.nftRawMeta` |
| `POST /admin/backfill/nft-entity-traits?collectionId=<id>` | Rebuild `traits`, `stats`, `definitionId`, and `speciesId` for existing NFT entities from `state.nftAttributes`. `collectionId` is optional — omit to process all entity collections. No on-chain requests are made. |
| `POST /admin/backfill/production-rates` | Recompute production rates for all location instances |

---

## Global Active Powers

Time-limited server-side powers that apply globally to all players simultaneously. Created and cancelled by admins via the admin panel.

### Admin Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /admin/global-powers` | List currently active (non-expired) global powers |
| `GET /admin/global-powers?all=true` | List all powers (including expired/cancelled), most recent 100 |
| `GET /admin/global-powers/types` | List all valid power type strings |
| `POST /admin/global-powers` | Activate a new global power (see body schema below) |
| `DELETE /admin/global-powers/:id` | Cancel an active global power immediately |

### POST /admin/global-powers body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| label | string | yes | Admin-facing label shown in toasts and admin panel |
| powerType | string | yes | One of the valid power types (see below) |
| value | number | yes | Numeric modifier value |
| valueMode | string | no | `percent_add` (default), `flat_add`, or `multiplier` |
| durationMinutes | integer | yes | How long the power lasts (whole minutes, max 10080) |
| scheduledFor | string | no | Optional ISO 8601 datetime. If provided and in the future, the power is stored with `status=scheduled` and automatically activated by the tick processor when that time arrives. Omit or leave blank to activate immediately. |
| triggeredByUserId | string | no | Admin user ID for audit trail |

### Power Types

| powerType | Effect Category | Description |
|-----------|-----------------|-------------|
| `tick_speed_boost` | _(direct)_ | **Global Tick Boost** — accelerates world tick rate for all players. Acts directly on `BoostEvent`/`TickRateInterval` rather than the effect resolver. |
| `keeper_xp_boost` | `KEEPER_XP_MULTIPLIER` | Boosts keeper XP earned from missions |
| `entity_xp_boost` | `XP_MULTIPLIER` | Boosts entity XP earned from missions |
| `mission_power_boost` | `MISSION_POWER` | Increases mission power for all players |
| `mission_duration_reduction` | `MISSION_TIMER_SPEED` | Reduces mission timer duration |
| `crafting_duration_reduction` | `CRAFTING_TIMER_SPEED` | Reduces crafting timer duration |
| `building_build_duration_reduction` | `BUILDING_BUILD_TIMER_SPEED` | Reduces building construction time |
| `building_upgrade_duration_reduction` | `BUILDING_UPGRADE_TIMER_SPEED` | Reduces building upgrade time |
| `injury_recovery_boost` | `INJURY_RECOVERY_SPEED` | Reduces injury recovery ticks |

### SSE Broadcast

When a global power starts, expires, or is cancelled, a `global_power.changed` SSE event is broadcast to all connected clients:

```json
{
  "type": "global_power.changed",
  "active": [
    {
      "id": "uuid",
      "label": "Weekend XP Boost",
      "powerType": "entity_xp_boost",
      "value": 50,
      "valueMode": "percent_add",
      "durationMinutes": 60,
      "startTime": "2026-05-17T18:00:00.000Z",
      "endTime": "2026-05-17T19:00:00.000Z",
      "status": "active"
    }
  ],
  "changes": [
    {
      "event": "started | ended",
      "id": "uuid",
      "powerType": "entity_xp_boost",
      "label": "Weekend XP Boost",
      "durationMinutes": 60
    }
  ]
}
```

`active` is the full current list of active powers after the change. `changes` lists each power that started or ended. Clients display a transient toast for each change entry.

---

## LocationPowerUsage

Tracks per-(location-instance, power-key) daily usage for unique NFT location powers. Enforces a global UTC-day gate so each power can only be triggered once per day regardless of who triggers it.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID primary key |
| locationInstanceId | string | FK → LocationInstance |
| powerKey | string | The `powerType` string (e.g. `tick_boost`) |
| lastUsedUtcDay | string | UTC date string `YYYY-MM-DD` of last trigger |
| usageCount | integer | Number of triggers on `lastUsedUtcDay`; reset to 1 on a new UTC day |

**Unique constraint:** `(locationInstanceId, powerKey)`.

Daily limit is enforced per the `dailyLimit` field in the power definition. When `usageCount >= dailyLimit` for the current UTC day, further triggers are rejected.

---

## TriggerLocationPower Command

**Command type:** `TriggerLocationPower`

Triggers a unique power belonging to a specific NFT location. The caller must own the location (or have admin role). Checks/updates `LocationPowerUsage` for today's UTC date against the power's `dailyLimit`. All power types (including `tick_boost`, which is remapped to `tick_speed_boost`) route through `GlobalPowerService.triggerPower`.

| Payload field | Type | Required | Description |
|--------------|------|----------|-------------|
| locationId | string | yes | The `LocationInstance.id` to trigger from |
| powerKey | string | yes | The power type to trigger (e.g. `tick_boost`) |

**Errors:**
- `ForbiddenException` — caller does not own the location
- `BadRequestException` — no unique powers defined, power key not found, or daily limit reached (`"Resets at 00:00 UTC"`)

---

## LocationDefinition `uniques` field

The `rules` JSON on `LocationDefinition` supports an optional `uniques` map keyed by NFT asset ID string. Each entry defines per-NFT custom powers:

```json
{
  "uniques": {
    "CARDANO:policy123:asset456": {
      "powers": [
        {
          "powerType": "tick_speed_boost",
          "value": 50,
          "durationMinutes": 60,
          "dailyLimit": 1
        },
        {
          "powerType": "entity_xp_boost",
          "value": 25,
          "durationMinutes": 120,
          "dailyLimit": 1
        }
      ]
    }
  }
}
```

**Power types:** `tick_speed_boost` | `keeper_xp_boost` | `entity_xp_boost` | `mission_power_boost` | `mission_duration_reduction` | `crafting_duration_reduction` | `building_build_duration_reduction` | `building_upgrade_duration_reduction` | `injury_recovery_boost`

For `tick_speed_boost` ("Global Tick Boost"), `value` is the additive percent increase (e.g. `50` = +50% world tick speed). Multiple concurrent boosts are summed additively. Legacy definitions using `tick_boost` as the powerType are automatically remapped to `tick_speed_boost` at trigger time. For all other power types, the same `powerType`/`value` semantics as `GlobalActivePower` apply.

---

## EntityPowerUsage

Tracks per-(entity-id, power-key) daily usage for unique NFT entity powers. Mirrors `LocationPowerUsage` with the same UTC-day gate and daily limit enforcement.

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID primary key |
| entityId | string | FK → Entity |
| powerKey | string | The `powerType` string (e.g. `tick_boost`) |
| lastUsedUtcDay | string | UTC date string `YYYY-MM-DD` of last trigger |
| usageCount | integer | Number of triggers on `lastUsedUtcDay`; reset to 1 on a new UTC day |

**Unique constraint:** `(entityId, powerKey)`.

---

## TriggerEntityPower Command

**Command type:** `TriggerEntityPower`

Triggers a unique power belonging to a specific NFT entity. The caller must own the entity (or have admin role). Checks/updates `EntityPowerUsage` for today's UTC date against the power's `dailyLimit`. All power types (including `tick_boost`, which is remapped to `tick_speed_boost`) route through `GlobalPowerService.triggerPower`.

| Payload field | Type | Required | Description |
|--------------|------|----------|-------------|
| entityId | string | yes | The `Entity.id` to trigger from |
| powerKey | string | yes | The power type to trigger (e.g. `tick_boost`) |

**Errors:**
- `ForbiddenException` — caller does not own the entity
- `BadRequestException` — entity has no NFT asset ID, no unique powers defined, power key not found, or daily limit reached (`"Resets at 00:00 UTC"`)

---

## EntityDefinition `rules.uniques` field

The `rules` JSON on `EntityDefinition` supports an optional `uniques` map keyed by NFT asset ID string. Each entry defines per-NFT custom powers that the entity owner can trigger once per UTC day:

```json
{
  "uniques": {
    "CARDANO:policy123:asset456": {
      "powers": [
        {
          "powerType": "entity_xp_boost",
          "value": 50,
          "durationMinutes": 120,
          "dailyLimit": 1
        },
        {
          "powerType": "tick_speed_boost",
          "value": 25,
          "durationMinutes": 60,
          "dailyLimit": 1
        }
      ]
    }
  }
}
```

**Power types:** `tick_speed_boost` | `keeper_xp_boost` | `entity_xp_boost` | `mission_power_boost` | `mission_duration_reduction` | `crafting_duration_reduction` | `building_build_duration_reduction` | `building_upgrade_duration_reduction` | `injury_recovery_boost`

These use the same `UniqueLocationPower` type as `LocationDefinition.rules.uniques`. The frontend entity detail panel renders a "Unique NFT Powers" section below the progression tabs for any entity with powers defined.

---

## boost.changed SSE Event

Broadcast to all connected clients whenever the underlying tick-boost state changes (a `BoostEvent` starts, ends, or is cancelled). This event is emitted by `GlobalPowerService` when a `tick_speed_boost` global power is created, cancelled, or expires:

```json
{
  "type": "boost.changed",
  "active": [
    {
      "id": "uuid",
      "name": "global_power:<powerId>",
      "percentBoost": 50,
      "endTime": "2026-05-17T19:00:00.000Z"
    }
  ],
  "combinedPercent": 50
}
```

`active` is the list of all currently active tick boosts. `combinedPercent` is the sum of all `percentBoost` values. Clients use this to update the local tick rate. Toast notifications for tick-speed changes are driven by the `global_power.changed` SSE event and the `useGlobalPowerToasts` hook, not by this event directly.
