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
