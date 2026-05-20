# Admin API Schemas

All admin endpoints require the `X-Admin-Secret` header matching the `ADMIN_SECRET` environment variable unless noted. Player endpoints require a valid JWT via `Authorization: Bearer <token>`.

---

## NFT Collections — `/api/nft/collections`

### `GET /api/nft/collections`
List all NFT collection definitions.

**Auth:** Admin

**Response:** `NftCollectionDef[]`

---

### `POST /api/nft/collections`
Create a new NFT collection definition.

**Auth:** Admin

**Body:**
```json
{
  "id": "derp_bird",
  "name": "Derp Birds",
  "chain": "CARDANO",
  "collectionId": "<policy_id>",
  "entityDefinitionId": "derp_bird",
  "mintMode": "one_per_token",
  "data": {}
}
```

Either `entityDefinitionId` or `locationDefinitionId` must be set (not both).

---

### `PUT /api/nft/collections/:id`
Update a collection definition.

**Auth:** Admin

**Body:** Partial `NftCollectionDef` fields.

---

### `DELETE /api/nft/collections/:id`
Deactivate a collection (sets `active = false`).

**Auth:** Admin

---

### `POST /api/nft/collections/:id/import`
**NEW** — Bulk-fetch all tokens in the collection's Cardano policy from Blockfrost and upsert them into the `NftAsset` cache table. This does **not** create any game instances (Entity/LocationInstance). Runs in the background.

**Auth:** Admin

**Response:**
```json
{ "started": true, "total": 1234 }
```

---

### `POST /api/nft/collections/:id/create-instances`
**RENAMED** (was `POST /:id/import`) — Create game Entity instances for all tokens in the collection. Uses the NftAsset cache as the metadata source. Run `POST /:id/import` first to populate the cache.

Only supported for entity-backed (CARDANO) collections.

**Auth:** Admin

**Response:**
```json
{ "started": true, "total": 1234 }
```

---

### `POST /api/nft/collections/:id/refresh`
**NEW** — Re-fetch the current on-chain holder address for every cached NftAsset row in the collection and update `ownerAddress` + `lastSyncedAt`. Runs in the background.

Does not affect game instance ownership (Entity/LocationInstance) — that remains the wallet-sync path.

**Auth:** Admin

**Response:**
```json
{ "started": true, "total": 1234 }
```

---

### `GET /api/nft/collections/:id/assets`
**NEW** — List cached NftAsset rows for a collection.

**Auth:** Admin

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number (1-indexed) |
| `limit` | `100` | Items per page (max recommended: 500) |
| `owner` | — | Filter by `ownerAddress` |

**Response:**
```json
{
  "items": [
    {
      "nftAssetId": "CARDANO:<policy>:<token>",
      "collectionId": "derp_bird",
      "chain": "CARDANO",
      "policyId": "<policy>",
      "tokenName": "<token>",
      "ownerAddress": "addr1...",
      "name": "Derp Bird #42",
      "imageUrl": "ipfs://Qm...",
      "nftAttributes": { "body": "rare_body", "eyes": "laser" },
      "rawMetadata": { ... },
      "lastSyncedAt": "2026-05-16T00:00:00.000Z",
      "createdAt": "2026-05-16T00:00:00.000Z",
      "updatedAt": "2026-05-16T00:00:00.000Z"
    }
  ],
  "total": 1234,
  "page": 1,
  "limit": 100
}
```

---

### `POST /api/nft/collections/sync`
Sync NFT ownership for the authenticated user's linked wallets.

**Auth:** JWT (player)

**Response:** `SyncResult`

---

### `GET /api/nft/collections/entities`
List all NFT-backed entities owned by the authenticated user.

**Auth:** JWT (player)

---

### `POST /api/nft/collections/images/import`
Trigger a background job that downloads all IPFS NFT images to object storage and generates thumbnails. Sources its work list from the `NftAsset` table (`imageUrl` field).

**Auth:** Admin

---

### `GET /api/nft/collections/images/import/status`
Return the current status of the NFT image import job.

**Auth:** Admin

**Response:**
```json
{
  "status": "running | idle | done | error",
  "total": 1234,
  "done": 100,
  "failed": 2,
  "skipped": 50,
  "alreadyHosted": 1084,
  "thumbsGenerated": 100,
  "thumbsAlreadyPresent": 1084,
  "thumbsFailed": 0,
  "errors": [],
  "startedAt": "2026-05-16T00:00:00.000Z",
  "finishedAt": null
}
```

---

## NftAsset Cache Architecture

The `NftAsset` table is the **single mandatory gateway** between the app and Blockfrost for asset metadata. Rules:

- **No code outside `NftAssetCacheService`** may call Blockfrost for asset metadata.
- All builders (`NftEntityBuilder`, `NftLocationBuilder`) and sync paths call `NftAssetCacheService.fetchAndCache(nftAssetId)`.
- If `fetchAndCache` fails (Blockfrost error or asset not found), the calling builder throws and the game instance is **not** created (no silent fallback).
- `nftAssetId` format: `CHAIN:POLICY_ID:TOKEN_NAME` (e.g. `CARDANO:abc123:DerpBird0042000`).

### NftAsset fields

| Field | Type | Description |
|-------|------|-------------|
| `nftAssetId` | String (PK) | `CHAIN:POLICY:TOKEN` composite key |
| `collectionId` | String (FK) | References `NftCollectionDef.id` |
| `chain` | String | `CARDANO` (only chain supported) |
| `policyId` | String | Cardano policy ID |
| `tokenName` | String | Hex token name (the part after the policy) |
| `ownerAddress` | String? | Current on-chain holder address |
| `name` | String? | Human-readable token name from on-chain metadata |
| `imageUrl` | String? | IPFS (`ipfs://`) or hosted (`/media/nft/...`) image URL |
| `rawMetadata` | Json | Full `onchain_metadata` from Blockfrost |
| `nftAttributes` | Json | Decoded attributes map (trait key → value) |
| `lastSyncedAt` | DateTime? | When this row was last fetched from Blockfrost |
| `createdAt` | DateTime | Row creation time |
| `updatedAt` | DateTime | Row last-updated time |

---

## Synergy Rules — `/api/admin/synergy`

### `POST /api/admin/synergy/preview`
Runs all **enabled** `SynergyRule` rows from the database against the supplied entity descriptors and activity context. Nothing is persisted. Used by the admin "Test Rules" button to validate the live rule set against an example team.

**Auth:** Admin (`X-Admin-Secret`)

**Body:**
```json
{
  "entityDescriptors": [
    { "entityId": "ent_1", "traits": { "head": "Ninja", "body": "Ninja" } },
    { "entityId": "ent_2", "traits": { "head": "magic", "body": "Dave" } }
  ],
  "activityContext": {
    "activityType": "mission",
    "missionTags": ["stealth"],
    "teamSize": 2
  }
}
```

> `entityDescriptors` — an array of entity trait objects representing the team.  
> The resolver uses the **same array** for both source and target selector matching (any entity can match either side of a pair-based rule).  
> `activityContext` — the activity the team is participating in. `activityType` is required; `missionTags` and `teamSize` are optional.

**Response:**
```json
{
  "matchedRules": [
    {
      "ruleId": "syn_ninja_magician",
      "name": "Ninja + Magician Synergy",
      "applications": 1,
      "effects": [{ "type": "synergy_score_modifier", "operation": "flat_add", "value": 5 }]
    }
  ],
  "totals": {
    "synergyScore": 5,
    "statModifiers": {},
    "durationModifiers": {},
    "resourceYieldModifiers": [],
    "immunities": []
  }
}
```

---

## SynergyRule — Admin Smart Table

`SynergyRule` rows are managed through the generic admin smart-editor at `GET /api/admin/records/synergyRule`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `syn_ninja_magician`) |
| `name` | string | ✓ | Admin-facing display name |
| `description` | string | | What this rule does and when it fires |
| `enabled` | boolean | | Default `true`. Disabled rules are never evaluated. |
| `sourceSelector` | Json | | Which entities match the "source" side. Empty `{}` = unconstrained. |
| `targetSelector` | Json | | Which entities match the "target" side. Empty `{}` = unconstrained. |
| `context` | Json | | Activity context constraints. Empty `{}` = all contexts. |
| `conditions` | Json | | Reserved for future condition expressions (leave as `[]`). |
| `effects` | Json | ✓ | Array of effect objects (see effect types below). |
| `priority` | number | | Evaluation order. Lower = first. Default `100`. |
| `stackGroup` | string | | Group name for cross-rule stacking logic. |
| `stackMode` | enum | | `additive` \| `best_only` \| `highest_abs_only` \| `unique`. Default `additive`. |
| `maxApplications` | number | | Max times this rule may fire per resolver call. Default `1`. |
| `startsAt` | datetime | | ISO — rule only fires after this time. |
| `endsAt` | datetime | | ISO — rule stops firing after this time. |

### Selector shape

```json
{
  "entityTypes": ["derp_bird"],
  "speciesIds": ["derp_bird"],
  "collections": ["derp_birds_s1"],
  "traitsAny": ["ninja", "magic"],
  "traitsAll": ["ninja"],
  "minTraitCount": 2,
  "entityIds": ["ent_abc"],
  "rarities": ["rare", "legendary"],
  "regions": ["region_1"],
  "locationTypes": ["outpost"],
  "buildingTagsAny": ["forge"],
  "missionTagsAny": ["stealth"],
  "factions": ["derps", "vamps"]
}
```

All fields are optional. Trait matching is case-insensitive (`"ninja"` matches `"Ninja"`).

### Context shape

```json
{
  "activityTypes": ["mission", "crafting"],
  "missionTypes": ["boss", "quick"],
  "missionTagsAny": ["stealth", "rescue"],
  "regionIds": ["region_forest"],
  "seasonIds": ["s1"],
  "requiresTeamSizeMin": 2,
  "requiresTeamSizeMax": 6
}
```

### Effect types

| Effect type | Extra fields | Description |
|-------------|--------------|-------------|
| `synergy_score_modifier` | `operation: "flat_add"`, `value: number` | Adds/subtracts from the team's total synergy score |
| `stat_modifier` | `stat: string`, `operation: "flat_add"\|"percent_add"\|"multiplier"`, `value: number` | Modifies an entity stat (ATK, DEF, SPD, …) |
| `duration_modifier` | `activity: string`, `operation: "flat_seconds"\|"percent_add"\|"multiplier"`, `value: number` | Modifies activity duration (negative = faster) |
| `resource_yield_modifier` | `resourceId: string`, `operation: "flat_add"\|"percent_add"\|"multiplier"`, `value: number` | Modifies resource output |
| `immunity` | `immuneTo: string` | Grants immunity to a named effect/debuff type |

### Stack modes

| Mode | Behaviour |
|------|-----------|
| `additive` | Each matching (source, target) pair triggers the rule independently, up to `maxApplications` |
| `unique` | Rule fires exactly once if any pairs match, regardless of pair count |
| `best_only` | Within the `stackGroup`, only the rule with the highest positive effect value fires |
| `highest_abs_only` | Within the `stackGroup`, only the rule with the highest absolute effect value fires |

---

## DisplayDef — `style` field

`DisplayDef.style` is a JSON blob that controls visual overrides for any entity that references the def (Mission Category cards, Mission hero headers, etc.). All sub-objects are optional; omitted keys fall back to hardcoded defaults.

### Top-level keys

| Key | Type | Description |
|-----|------|-------------|
| `overlay` | object | Colour/gradient rendered on top of the background image |
| `background` | object | CSS background-image layout |
| `title` | object | Card heading / hero title font overrides |
| `body` | object | Body / inline text font overrides |
| `inlineButtons` | object | Inline button placement and per-state styling (Mission Category only) |
| `data` | object | Admin-editor UI hints — `data._mode` stores the selected editing context and is ignored by the game engine |

### `overlay`

| Field | Type | Description |
|-------|------|-------------|
| `color` | string | Solid CSS colour, e.g. `#0F0A28` |
| `opacity` | number 0–1 | Overlay opacity |
| `gradient` | string | Raw CSS gradient — overrides `color`+`opacity` when set |

### `background`

| Field | Type | Description |
|-------|------|-------------|
| `position` | string | CSS `background-position` |
| `size` | string | CSS `background-size` |
| `repeat` | string | CSS `background-repeat` |
| `attachment` | string | CSS `background-attachment` |

### `title` / `body`

| Field | Type | Description |
|-------|------|-------------|
| `fontFamily` | string | CSS font-family stack |
| `fontWeight` | string \| number | CSS font-weight |
| `fontSize` | string | CSS font-size, e.g. `22px` |
| `color` | string | CSS colour |
| `letterSpacing` | string | CSS letter-spacing (`title` only) |
| `textTransform` | string | CSS text-transform (`title` only) |
| `textShadow` | string | CSS text-shadow (`title` only) |
| `lineHeight` | string | CSS line-height |

### `inlineButtons`

Controls the inline mission-launch buttons shown on Mission Category cards.

| Field | Type | Description |
|-------|------|-------------|
| `placement` | `"inline"` \| `"bottom"` | `"inline"` (default) — buttons sit beside card content; `"bottom"` — pushed to card bottom edge |
| `normal` | `DisplayButtonStateStyle` | Style when player can afford the mission |
| `requirementsNotMet` | `DisplayButtonStateStyle` | Style when player cannot afford the mission |
| `disabled` | `DisplayButtonStateStyle` | Style for explicitly disabled buttons |

#### `DisplayButtonStateStyle`

| Field | Type | Description |
|-------|------|-------------|
| `background` | string | CSS `background` — plain colour or gradient |
| `color` | string | CSS text colour |
| `borderColor` | string | CSS border colour |
| `opacity` | number 0–1 | Element opacity |

### `data` (admin-editor hints)

| Key | Type | Description |
|-----|------|-------------|
| `_mode` | `"missionCategory"` \| `"mission"` \| `"generic"` | Remembers which editing context was last selected in `DisplayStyleEditor`. Persisted so the choice survives navigation. **Ignored by the game engine.** |

---

## Outcome Entry Types

Outcome arrays appear on mission `success` / `failure` blocks and inside bundle defs. Each entry in a `rewards` array is one of the following types.

### Common fields

| Field | Applies to | Description |
|-------|-----------|-------------|
| `type` | all leaf types | Discriminator string — see type table below |
| `odds` | most types | In **flat** resolve: percentage gate (0–100). In **pick-mode** bundles (`pickMin`/`pickMax`): relative weight used by the weighted-random picker. |

### Entry types

| `type` | Fields | Description |
|--------|--------|-------------|
| `currency` | `key`, `min`, `max`, `odds` | Grants `min`–`max` units of the named currency |
| `item` | `key`, `min`, `max`, `odds` | Grants `min`–`max` copies of the named item |
| `entity_xp` | `min`, `max`, `odds` | Grants `min`–`max` XP split across all mission entities |
| `keeper_xp` | `min`, `max`, `odds` | Grants `min`–`max` XP to the keeper (player account) |
| `flag` | `operation`, `key`, `value`, `odds` | Mutates a user flag. Operations: `set`, `unset`, `increment`, `decrement`, `invert`, `remove` |
| `text` | `message`, `odds` | Weighted flavor-text entry; the resolver picks one text per bundle pass and surfaces it in the result modal |
| `emitEvent` | `defId`, `payload`, `idempotencyKey`, `odds` | Dispatches a named game event |
| `nothing` | `odds` | **No-op weight entry** — selected by the picker but grants nothing. Use this to express low-probability rewards in pick-mode bundles (see example below). |
| `effect` | `odds`, _any effect fields_ | **UI only — backend not yet wired.** Placeholder for a future in-game effect grant. |

### Inline bundle / pick-bundle wrapper

| Field | Description |
|-------|-------------|
| `bundle` | Array of leaf entries — when present the entry is an inline bundle |
| `pickMin` / `pickMax` | If set, `bundle` is resolved in pick-mode: `pickMin`–`pickMax` entries are drawn by weighted-random selection |
| `odds` | On a bundle wrapper: gate odds (flat) or weight (pick-mode parent) |

### `bundle_ref` — reference to a BundleDef

| Field | Description |
|-------|-------------|
| `type` | `"bundle_ref"` |
| `bundleDefId` | ID of the `BundleDef` record to expand |
| `odds` | Override the def's own odds (leave unset to use the def's value) |
| `pickMin` / `pickMax` | Override the def's pick range |

---

## `selectionRule` — Rich Contextual Conditions on Quest/Achievement Objectives

Quest and achievement objectives support an optional `selectionRule` field in addition to the existing `eventType`, `key`, and `dataFilter` filters. When set, the rule is evaluated against a `SelectionContext` attached in-memory to the telemetry event — progress only increments if the rule **passes**.

> **Note:** Achievements are now unified with quests. Use `category: "achievement"` on a `QuestDef` to mark it as an achievement. The `tier` field (1=bronze, 2=silver, 3=gold) and `permanentEffectSpec` field are available on all `QuestDef` rows.

### Objective shape

```json
{
  "eventType": "mission_complete",
  "key": "mission_boss_alpha",
  "target": 3,
  "dataFilter": { "outcome": "success" },
  "selectionRule": {
    "op": "AND",
    "rules": [
      {
        "scope": "team",
        "field": "traits.archetype",
        "aggregate": "any",
        "operator": "eq",
        "value": "Ninja"
      },
      {
        "scope": "player",
        "field": "keeperLevel",
        "operator": "gte",
        "value": 5
      }
    ]
  },
  "label": "Complete the boss 3 times with a Ninja at Keeper Level 5+"
}
```

### Objective fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventType` | string | ✓ | Telemetry event type that increments progress (e.g. `mission_complete`, `crafting_completed`, `checkin_completed`) |
| `key` | string | | Narrows matches to events whose key equals this value (e.g. a specific `missionDefId`) |
| `target` | number | ✓ | Number of qualifying events required to complete this objective |
| `dataFilter` | object | | Shallow equality filter on the event's `data` payload — all specified keys must match |
| `selectionRule` | `RichSelection` | | Optional — rich contextual condition tree; see below |
| `label` | string | | Human-readable label shown in the UI |

### How `selectionRule` is evaluated

1. The `eventType`, `key`, and `dataFilter` checks run first. If any fail, the objective is skipped immediately (no `selectionRule` evaluation).
2. If `selectionRule` is set and the event carries a `SelectionContext`, `SelectionResolverService.evaluateAll()` is called with the full context. Progress increments only if it returns `true`.
3. If `selectionRule` is set but the event has **no** `SelectionContext`, a warning is logged and the check is treated as a **pass** — this prevents misconfigured emitters from silently blocking progress on existing objectives.
4. If `selectionRule` is absent, behaviour is identical to before this feature (fully backward-compatible).

### Events that carry a SelectionContext

| Event type | Context includes |
|------------|-----------------|
| `mission_complete` | Team entities (traits, stats, level, rarity), mission metadata (missionTags, missionType, regionId, activityType), player (keeperLevel, flags) |
| `crafting_completed` | Crafting entity (traits, stats, level, rarity), player (keeperLevel, flags) |
| `checkin_completed` | Player only (keeperLevel, flags) — no entities |

### Example use cases

| Goal | Rule sketch |
|------|------------|
| Complete a mission with a Ninja on the team | `team.traits.archetype eq "Ninja"` with `any` aggregate |
| Win a mission where all entities are level 5+ | `team.level gte 5` with `all` aggregate |
| Complete 10 missions in Region A | `missionContext.regionId eq "region_a"` (use `scope: "context"` / `mission` scope) |
| Craft an item using a Legendary entity | `entity.traits.rarity eq "legendary"` |

`selectionRule` accepts the full `RichSelection` DSL including nested `AND`/`OR`/`NOT` groups and `rule_ref` references to shared `SelectionRuleDef` rows.

---

## `launchRequirements` — Mission Launch Gate

`MissionDef` now has a **second** `RichSelection` field alongside the existing `requirements`:

| Field | Evaluated at | Purpose |
|-------|-------------|---------|
| `requirements` | Browse / listing time (no team) | Gates whether the mission row is open and clickable. Drives the lock icon. Use for player-level rules (`keeperLevel`, flags). |
| `launchRequirements` | Launch time (real selected team) | Gates `startMission`. Evaluated with the actual team context (`teamSize`, entity traits, stats). Both blocks must pass for the mission to start. |

`launchRequirements` is nullable (`Json?`). If omitted, only `requirements` is checked. When present its top-level rule labels are returned in the `launchRequirementStatus` array on each mission-def in `GET /api/missions/definitions`.

---

## MissionDef — `tiers` field

`MissionDef` supports an optional `tiers` object that enables quality-tiered outcomes for missions, using the same Gaussian bell-curve mechanic as crafting recipes. When `tiers` is present, the server rolls a quality level for each successful mission based on the team's mission power (in place of, or in addition to, the flat `success`/`failure` outcome blocks).

### Tier keys

| Key | Type | Description |
|-----|------|-------------|
| `failure` | `OutcomeTierBlock` | Fires when the mission **fails** (i.e. the success roll is below `minSuccessChance`). Equivalent to the flat `failure` outcome block. |
| `common` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 15. |
| `uncommon` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 45. |
| `scare` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 75. |
| `rare` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 105. |
| `epic` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 135. |
| `mythic` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 165. |
| `legendary` | `OutcomeTierBlock` | Success quality tier. Gaussian center CL = 195. |

### `OutcomeTierBlock` shape

```json
{
  "rewards": [ /* OutcomeEntry array — same format as mission success/failure rewards */ ],
  "clRequirement": 120
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rewards` | `OutcomeEntry[]` | Reward entries for this tier (same shape as `success.rewards` / `failure.rewards`). |
| `clRequirement` | number | Optional — overrides the default Gaussian center CL for this tier. Useful to shift the probability distribution for specific missions. |

### Top-level `sigma`

An optional `sigma` key (number, default `22`) may be placed at the root of the `tiers` object to override the Gaussian bell-curve spread for this mission. Lower values produce sharper distributions (more predictable outcomes); higher values produce flatter distributions.

### Example

```json
{
  "tiers": {
    "sigma": 20,
    "failure": {
      "rewards": [{ "type": "currency", "key": "soft_coins", "min": 10, "max": 20 }]
    },
    "common": {
      "rewards": [{ "type": "currency", "key": "soft_coins", "min": 50, "max": 100 }]
    },
    "rare": {
      "clRequirement": 120,
      "rewards": [
        { "type": "currency", "key": "soft_coins", "min": 200, "max": 300 },
        { "type": "item", "key": "mat_rare_ore", "min": 1, "max": 2, "odds": 40 }
      ]
    },
    "legendary": {
      "rewards": [{ "type": "item", "key": "mat_legendary_core", "min": 1, "max": 1 }]
    }
  }
}
```

---

## Player Jobs — `POST /api/jobs/preview`

Returns a real-time server-computed preview of a job context. Replaces any client-side math for power, success chance, synergy, cost affordability, and requirements evaluation. Supports `"mission"`, `"crafting"`, and `"building"` job types.

**Auth:** Player JWT required.

### Request body

```json
{
  "jobType": "mission" | "crafting" | "building",
  "defId": "string",
  "entityIds": ["entity_a"],
  "entityId": "optional_single_entity_id",
  "quantity": 1,
  "locationId": "optional_location_id"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `jobType` | `"mission"` \| `"crafting"` \| `"building"` | Job type discriminator. |
| `defId` | string | `MissionDef.id` for missions; `RecipeDef.id` for crafting; `BuildingDef.id` for building. |
| `entityIds` | string[]? | Entity IDs for the mission team. Pass `[]` or omit for crafting/building. |
| `entityId` | string? | Single crafter entity ID for crafting previews. Enables per-entity `passRate`, `entityCl`, and `qualityProbabilities` in the response. |
| `quantity` | number? | Batch quantity for multicraft recipes. Scales `scaledCost` in the response. Defaults to 1. |
| `locationId` | string? | Workshop/outpost `LocationInstance.id`. Required for full workshop context in crafting; enables upgrade preview in building. |

### Response — `jobType: "mission"`

```json
{
  "jobType": "mission",
  "requirements": [
    { "label": "Keeper Level 5+", "met": true, "source": "requirements" },
    { "label": "Team size 1–4", "met": false, "source": "launchRequirements" }
  ],
  "allRequirementsMet": false,
  "canAfford": true,
  "cost": [{ "type": "currency", "id": "gold", "amount": 100 }],
  "durationSeconds": 300,
  "mission": {
    "teamMin": 1,
    "teamMax": 4,
    "missionPower": 142.5,
    "difficulty": 100,
    "successChance": 75,
    "injuryChance": 12,
    "synergy": {
      "synergyScore": 3,
      "missionPowerBonus": 10,
      "durationBonus": -5,
      "matchedRules": [...]
    }
  }
}
```

### Response — `jobType: "crafting"`

```json
{
  "jobType": "crafting",
  "requirements": [{ "label": "Keeper Level 3+", "met": true }],
  "allRequirementsMet": true,
  "canAfford": true,
  "cost": [{ "type": "currency", "id": "gold", "amount": 50 }],
  "durationSeconds": 120,
  "crafting": {
    "recipeId": "recipe_sword",
    "recipeName": "Iron Sword",
    "recipeTier": 1,
    "effectiveDurationTicks": 108,
    "rewards": { ... },
    "workshopTier": 2,
    "slotsTotal": 2,
    "slotsUsed": 1,
    "slotsOpen": 1,
    "recipeTierCap": 2,
    "timerMultiplier": 0.9,
    "recipeTierMet": true,
    "entityCl": 42.5,
    "passRate": 0.75,
    "qualityProbabilities": [
      { "key": "common",    "label": "Common",    "probability": 0.12 },
      { "key": "uncommon",  "label": "Uncommon",  "probability": 0.54 },
      { "key": "scare",     "label": "Scare",     "probability": 0.28 },
      { "key": "rare",      "label": "Rare",      "probability": 0.05 },
      { "key": "epic",      "label": "Epic",      "probability": 0.01 },
      { "key": "mythic",    "label": "Mythic",    "probability": 0.00 },
      { "key": "legendary", "label": "Legendary", "probability": 0.00 }
    ],
    "scaledCost": [{ "type": "currency", "id": "gold", "amount": 150 }],
    "difficulty": 50
  }
}
```

**`crafting` sub-object fields:**

| Field | Description |
|-------|-------------|
| `recipeId` | The `RecipeDef.id` |
| `recipeName` | Display name of the recipe |
| `recipeTier` | Recipe tier (1–3) read from `recipeDef.data.tier` |
| `effectiveDurationTicks` | Post-modifier duration in ticks (reflects player effects and workshop tier) |
| `tiers` | Per-tier reward blocks from the recipe definition (see `RecipeDef.tiers`) |
| `difficulty` | Pass/fail gate difficulty from the recipe (`passRate = effectiveCL / (effectiveCL + difficulty)`) |
| `workshopTier` | Level of the workshop at `locationId` (0 if no `locationId` or no workshop found) |
| `slotsTotal` | Parallel crucible slots available at this workshop |
| `slotsUsed` | Active crafting jobs currently occupying slots at this location |
| `slotsOpen` | Available slots (`slotsTotal - slotsUsed`) |
| `recipeTierCap` | Highest recipe tier supported by this workshop |
| `timerMultiplier` | Timer speed factor applied by the workshop tier |
| `recipeTierMet` | Whether the recipe tier is within the workshop's cap (`null` when no `locationId` given) |
| `entityCl` | Computed crafting luck (CL) for the entity supplied via `entityId`. `null` when no entity given. |
| `passRate` | Probability of passing the fail gate: `entityCl / (entityCl + difficulty)`. `null` when no entity given. |
| `difficulty` | Recipe fail-gate difficulty value used for `passRate` computation. |
| `qualityProbabilities` | Array of `{ key, label, probability }` for each quality tier at the entity's CL (with per-recipe `clRequirement` overrides applied). `null` when no entity given. |
| `scaledCost` | Recipe base cost multiplied by `quantity`. Equals base cost when `quantity` is 1. |

`allRequirementsMet` is `false` if any requirement rule fails.

### Response — `jobType: "building"`

```json
{
  "jobType": "building",
  "requirements": [{ "label": "Outpost Level 2+", "met": true }],
  "allRequirementsMet": true,
  "canAfford": false,
  "cost": [{ "type": "currency", "id": "stone", "amount": 200 }],
  "durationSeconds": 600,
  "building": {
    "buildingDefId": "forge",
    "name": "Forge",
    "description": "A workshop for crafting gear.",
    "category": "WORKSHOP",
    "buildLevel": 1,
    "maxLevel": 3,
    "effectiveDurationTicks": 540,
    "upgrade": {
      "toLevel": 2,
      "cost": [{ "type": "currency", "id": "stone", "amount": 400 }],
      "durationSeconds": 1200,
      "effectiveDurationTicks": 1080,
      "canAfford": true
    }
  }
}
```

**`building` sub-object fields:**

| Field | Description |
|-------|-------------|
| `buildingDefId` | The `BuildingDef.id` |
| `name` | Display name |
| `description` | Flavor text |
| `category` | Building category (e.g. `"WORKSHOP"`) |
| `buildLevel` | Always `1` — new-construction cost/timer |
| `maxLevel` | Maximum allowed level from `rules.maxLevel` |
| `effectiveDurationTicks` | Post-modifier build duration in ticks (reflects `BUILDING_BUILD_TIMER_SPEED` effects) |
| `upgrade` | Upgrade preview to the next level (present only when `locationId` is given and the building already exists and is below max level); `null` otherwise |
| `upgrade.toLevel` | Target level of the upgrade |
| `upgrade.cost` | Resource cost entries for the upgrade |
| `upgrade.durationSeconds` | Base duration for the upgrade in seconds |
| `upgrade.effectiveDurationTicks` | Post-modifier upgrade duration in ticks (reflects `BUILDING_UPGRADE_TIMER_SPEED` effects) |
| `upgrade.canAfford` | Whether the player can currently afford the upgrade |

The top-level `cost`, `canAfford`, and `durationSeconds` always reflect the **new-build** (level 1) scenario regardless of whether the building already exists at `locationId`.

**Common fields (all job types):**

| Field | Description |
|-------|-------------|
| `requirements` | Top-level rules from the def's `requirements` block, each with `label` and `met` |
| `allRequirementsMet` | `true` only when every requirement entry is met |
| `canAfford` | Whether the player has sufficient resources for the primary cost |
| `cost` | Primary cost entries array |
| `durationSeconds` | Base timer duration in seconds (raw, before player effect modifiers) |

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Unknown `jobType` |
| `404` | `defId` not found |

---

## SelectionRuleDef — Reusable Rule Library

`SelectionRuleDef` rows store named, reusable `RichSelection` trees. Any `requirements` or `visibilityRequirements` field (on missions, buildings, recipes, etc.) can embed a reference to one via a `rule_ref` node instead of copy-pasting the full condition tree.

Managed through the generic admin smart-editor at `GET /api/admin/records/selectionRuleDef`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `rule_ninja_team`) |
| `name` | string | ✓ | Admin-facing display name |
| `description` | string | | What condition this rule represents |
| `tags` | string[] | | Classification tags for filtering |
| `selection` | Json (`RichSelection`) | ✓ | The reusable condition tree |
| `enabled` | boolean | | Default `true`. Disabled rules always return `false` when referenced. |
| `createdAt` | datetime | auto | Row creation time |
| `updatedAt` | datetime | auto | Row last-updated time |

---

## `rule_ref` Node Type

Within any `RichSelection` tree (requirements, visibilityRequirements, etc.), a child node can be a `rule_ref` instead of a plain rule or group:

```json
{
  "op": "AND",
  "rules": [
    { "scope": "player", "field": "keeperLevel", "operator": "gte", "value": 5 },
    { "type": "rule_ref", "id": "rule_ninja_team", "label": "Ninja team check" }
  ]
}
```

### `rule_ref` fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"rule_ref"` | ✓ | Discriminator. Identifies this node as a library rule reference. |
| `id` | string | ✓ | ID of the `SelectionRuleDef` row to evaluate. |
| `label` | string | | Optional human-readable label for admin display. |

---

## Player Jobs — `/api/admin/players/:id/jobs`

### `POST /api/admin/players/:id/jobs/:jobId/force-complete`

Force-complete an active job for a player, driving all side effects exactly as if the player had completed the action normally.

**Auth:** Admin

**Behaviour by job type:**

| Job type | Side effects executed |
|----------|-----------------------|
| `MissionJob` | Calls `completeMission` — entities return to idle, rewards are granted, notifications are updated |
| `BuildingJob` | Calls `completeBuilding` — building instance state is set to `active` (or levelled up for upgrades), settlement is recalculated |
| `CraftingJob` | Calls `collectCrafting` — item results are rolled with full luck/synergy, items are granted, entity returns to idle |
| *(other)* | Job status is stamped `completed`; no additional side effects |

For all types the job's internal timer is backdated so that the completion-time check passes without error.

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Job is already `completed` or `failed` |
| `404` | Job not found for this player |

**Response:** The result object returned by the underlying service call (serialised), or `{ forced: true, jobId }` if the service returns nothing.

---

### Resolver behaviour

- The resolver fetches the referenced `SelectionRuleDef` by `id` from an in-memory cache and evaluates its `selection` tree inline, transparently to the caller.
- If the referenced rule does not exist, is not in the cache, or is **disabled**, the node evaluates to `false`.
- **Circular references** are detected at resolve time: if a `rule_ref` chain visits the same `id` more than once, resolution short-circuits to `false` and logs a warning. The game never hangs.
- **Cache lifecycle:** `SelectionResolverService` loads ALL `SelectionRuleDef` rows from the database on startup (`OnModuleInit`) and resolves transitive nested `rule_ref` IDs via BFS. Any admin create/update/delete of a `SelectionRuleDef` row automatically reloads the full cache via `reloadRuleCache()`. Changes are live immediately without a server restart.

---

### Using `nothing` to express low-probability rewards

In pick-mode bundles `odds` values are **relative weights**, not percentages. To express a 2% chance of dropping an item alongside a 98% chance of nothing:

```json
{
  "bundle": [
    { "type": "item", "key": "mat_golden_hay_core", "min": 1, "max": 1, "odds": 2 },
    { "type": "nothing", "odds": 98 }
  ],
  "pickMin": 1,
  "pickMax": 1
}
```

The picker draws one entry. `nothing` wins ~98% of the time and produces no reward.

---

## Global Active Powers — `/admin/global-powers`

### `GET /admin/global-powers`

Returns active + scheduled powers (by default). Pass `?all=true` to include the full history.

**Response array items:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `label` | string | Human-readable label shown in UI |
| `effectDefId` | string \| null | ID of the linked EffectDef. `null` = tick_speed_boost (handled via BoostEvent, no effect resolver) |
| `effectDefName` | string \| null | Resolved display name of the EffectDef |
| `effectCategory` | string \| null | Category of the linked EffectDef (e.g. `xp_multiplier`, `mission_power`) |
| `effectOverrides` | object \| null | Optional field overrides that shadow the EffectDef defaults (e.g. `{ value, valueMode }`) |
| `selection` | object \| null | `EffectSelection` restricting which targets the power applies to |
| `value` | number | Effective value (from effectOverrides or EffectDef) |
| `valueMode` | string | `percent_add` \| `flat_add` \| `multiplier` |
| `startTime` | ISO string | When the power activated (or will activate if scheduled) |
| `endTime` | ISO string | When the power expires |
| `status` | string | `active` \| `scheduled` \| `expired` \| `cancelled` |
| `durationMinutes` | number | Total duration |
| `triggeredByUserId` | string \| null | User that triggered the power, if any |

---

### `POST /admin/global-powers`

**Auth:** Admin

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | ✓ | Display label |
| `effectDefId` | string \| null | ✓ | EffectDef ID. `null` = tick_speed_boost (legacy BoostEvent). Use `GET /admin/effect-defs` to list available defs |
| `effectOverrides` | object | — | Override fields on the EffectDef (e.g. `{ "value": 50, "valueMode": "percent_add" }`) |
| `selection` | object | — | `EffectSelection` for targeted global powers (scope/agg/filter) |
| `durationMinutes` | number | ✓ | Duration in minutes |
| `scheduledFor` | ISO string | — | If future, schedules the power instead of activating immediately |
| `triggeredByUserId` | string | — | User to credit for the trigger |

**Response:** Serialized `GlobalActivePower` record.

---

### `DELETE /admin/global-powers/:id`

Cancels an active or scheduled global power.

---

## Effect Defs — `/admin/effect-defs`

### `GET /admin/effect-defs`

Returns all enabled `EffectDef` rows. Used by the admin UI to populate the Effect Definition dropdown when creating Global Active Powers.

**Response array items:** `id`, `name`, `category`, `valueMode`, `value`, `durationModel`, `targetType`, `description`.

---

## Telemetry Definitions — `/admin/telemetry` and `/telemetry`

Admins author `TelemetryDef` records, each with a name, optional date window, and an array of sub-event counters. Each sub-event counter binds a unique key, an event type (`MISSION_START`, `MISSION_SUCCESS`, `MISSION_FAIL`), and an optional `RichSelection` filter. Counters are atomically incremented server-side whenever a matching event fires.

### `GET /telemetry/:id` _(public, no auth)_

Returns a `TelemetryDef` with all current counter values. Intended for frontend use (e.g. live event trackers).

**Response:** `TelemetryDefWithCountsDto`

```json
{
  "id": "uuid",
  "name": "Season 1 Missions",
  "description": "Track mission starts and outcomes",
  "enabled": true,
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-12-31T23:59:59.000Z",
  "subEvents": [
    { "key": "all_starts", "eventType": "MISSION_START", "filter": null },
    { "key": "wins", "eventType": "MISSION_SUCCESS", "filter": { "op": "AND", "rules": [] } }
  ],
  "createdAt": "...",
  "updatedAt": "...",
  "counts": [
    { "subEventKey": "all_starts", "count": "1042", "lastIncrementedAt": "..." },
    { "subEventKey": "wins", "count": "831", "lastIncrementedAt": "..." }
  ]
}
```

---

### `GET /admin/telemetry`

List all telemetry definitions (without counts).

**Auth:** Admin

**Response:** `TelemetryDefDto[]`

---

### `GET /admin/telemetry/:id`

Get a single definition with all counter values.

**Auth:** Admin

**Response:** `TelemetryDefWithCountsDto`

---

### `POST /admin/telemetry`

Create a new telemetry definition.

**Auth:** Admin

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Display name |
| `description` | string | — | Optional notes |
| `enabled` | boolean | — | Active flag (default `true`) |
| `startDate` | ISO string | — | Events before this are ignored |
| `endDate` | ISO string | — | Events after this are ignored |
| `subEvents` | `TelemetrySubEventSpec[]` | — | Counter definitions |

Each `TelemetrySubEventSpec`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | ✓ | Unique key within the def |
| `eventType` | `MISSION_START` \| `MISSION_SUCCESS` \| `MISSION_FAIL` | ✓ | Event to match |
| `filter` | `RichSelection` \| `null` | — | Optional match filter; `null` = count all |

---

### `PUT /admin/telemetry/:id`

Update an existing definition. Partial fields accepted.

**Auth:** Admin

---

### `DELETE /admin/telemetry/:id`

Delete a definition and all its counters.

**Auth:** Admin

---

### `POST /admin/telemetry/:id/reset`

Reset all counters for a definition to zero (deletes all `TelemetryCount` rows for this def).

**Auth:** Admin

**Response:** `{ "reset": <number of rows deleted> }`

---

## GiftSpec — Inline Gift Definitions

Every place in the definition layer that previously required a bare `giftDefId` string now accepts a **`GiftSpec`** union. This lets content authors either reference an existing `GiftDef` row or author a one-off gift directly on the issuing definition (no separate DB row needed).

### GiftSpec union

```typescript
type GiftSpec = { giftDefId: string } | InlineGiftDef;
```

| Variant | Discriminant | When to use |
|---------|--------------|-------------|
| `{ giftDefId }` | `giftDefId` key present | The gift is reused across multiple sources — keep it in a `GiftDef` row |
| `InlineGiftDef` | `name` key present (no `giftDefId`) | One-off reward specific to this definition entry |

### InlineGiftDef fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Admin-facing display name |
| `presentation` | `GiftPresentation` | — | `{ iconKey, title, subtitle, animationKey, accentColor }` |
| `claimRules` | `GiftClaimRules` | — | `{ limitPerPlayer, expiresInSeconds }` |
| `rewardSpec` | `OutcomeEntry[]` | — | Same shape as mission/lootbox outcome arrays |
| `instant` | boolean | — | `true` (default) = immediate delivery; `false` = GIFT_PACKAGE item |
| `modalDefId` | string | — | Optional `ModalDef.id` to show when the gift is opened |

### Where GiftSpec is used

| Definition | Field |
|-----------|-------|
| `CheckInDef.rewards[]` | `gift: GiftSpec` (replaces `giftDefId: string`) |
| `EventDefinition` handler payload | `gift: GiftSpec` (replaces `giftDefId: string`) for the `createGiftForPlayer` handler key |

### Example — CheckInDef rewards with a ref

```json
{
  "rewards": [
    { "day": 0, "gift": { "giftDefId": "gift_daily_starter" } },
    { "day": 6, "gift": { "giftDefId": "gift_weekly_bonus" } }
  ]
}
```

### Example — CheckInDef rewards with an inline gift

```json
{
  "rewards": [
    {
      "day": 0,
      "gift": {
        "name": "Day 1 Bonus",
        "presentation": { "title": "Welcome Back!", "iconKey": "gift_star" },
        "rewardSpec": [{ "type": "currency", "key": "soft_coins", "min": 100, "max": 100 }],
        "instant": true
      }
    }
  ]
}
```

### Example — EventDefinition payload with a ref

```json
{ "gift": { "giftDefId": "gift_welcome_gems" } }
```

### Example — EventDefinition payload with an inline gift

```json
{
  "gift": {
    "name": "Event Bonus",
    "rewardSpec": [{ "type": "currency", "key": "event_tokens", "min": 50, "max": 50 }],
    "instant": true
  }
}
```
