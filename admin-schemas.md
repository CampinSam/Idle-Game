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

Exactly one of `entityDefinitionId`, `locationDefinitionId`, or `itemDefinitionId` must be set.

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

## Quest/Achievement Objective `selector` — Unified RichSelection Matching

Quest and achievement objectives use a single `selector: RichSelection` field to match telemetry events and filter world state. The `selector` is evaluated against a `SelectionContext` that is extended with the live telemetry event under the `event` scope — so both event matching and contextual filtering live in one block.

> **Note:** Achievements are unified with quests. Use `category: "achievement"` on a `QuestDef` to mark it as an achievement. The `tier` field (1=bronze, 2=silver, 3=gold) and `permanentEffectSpec` field are available on all `QuestDef` rows.

### Objective shape

```json
{
  "selector": {
    "op": "AND",
    "rules": [
      { "scope": "event", "field": "type", "operator": "eq", "value": "mission_complete" },
      { "scope": "event", "field": "key", "operator": "eq", "value": "mission_boss_alpha" },
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
  "target": 3,
  "label": "Complete the boss 3 times with a Ninja at Keeper Level 5+"
}
```

### Objective fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `RichSelection` | ✓ | Unified condition tree evaluated against the combined SelectionContext (event + world state) |
| `target` | number | ✓ | Number of qualifying events required to complete this objective |
| `label` | string | | Human-readable label shown in the UI |

### The `event` scope

When evaluating quest objectives, the SelectionContext is extended with an `event` property holding the current telemetry event. Rules using `scope: "event"` read from this payload.

| `field` | Resolves to |
|---------|------------|
| `type` | The telemetry event type string (e.g. `"mission_complete"`) |
| `key` | The event's key value (e.g. a `missionDefId`), or `null` if absent |
| `amount` | The numeric amount carried by the event (default `1`) |
| `data.<dotted.path>` | A value nested inside the event's `data` payload |

### How the selector is evaluated

1. `QuestService.processEvent` builds a combined context: the event's `SelectionContext` (player, entities, inventory, locations, mission metadata) merged with the `event` property.
2. `SelectionResolverService.evaluateAll(obj.selector, contextWithEvent)` is called for each objective. Progress increments only if the selector returns `true`.
3. If the emitting event carries no `SelectionContext` (rare), a minimal empty context is used — objectives that only use `event`-scope rules still work correctly.

### Example use cases

| Goal | Rule sketch |
|------|------------|
| Match any `mission_complete` event | `event.type eq "mission_complete"` |
| Match a specific mission | `event.type eq "mission_complete"` AND `event.key eq "mission_boss_alpha"` |
| Match event with data filter | `event.data.outcome eq "success"` |
| Complete a mission with a Ninja on the team | AND `event.type eq "mission_complete"` + `team.traits.archetype any eq "Ninja"` |
| Complete 10 missions in Region A | AND `event.type eq "mission_complete"` + `context.regionId eq "region_a"` |
| Craft with a Legendary entity | AND `event.type eq "crafting_completed"` + `entity.rarity eq "legendary"` |

`selector` accepts the full `RichSelection` DSL including nested `AND`/`OR`/`NOT` groups and `rule_ref` references to shared `SelectionRuleDef` rows.

---

## MissionDef — `leadInModalDefId` field

`MissionDef` supports an optional `leadInModalDefId` that attaches a narrative lead-in modal to a mission. When set, the modal appears automatically the first time a player opens the mission details page each session. The player can reopen it any time using the **"Open Narrative"** button in the mission footer.

### Endpoint

`GET /api/missions/:defId/lead-in` — Returns the resolved `ModalSpecV1` for the lead-in. Auth: JWT (player). Returns `404` if the mission has no `leadInModalDefId` set or if the referenced `ModalDef` is disabled.

### Behaviour

| Aspect | Detail |
|--------|--------|
| Auto-open | Fires once per session per mission, tracked via `sessionStorage`. Subsequent visits to the same mission do not re-trigger the modal automatically. |
| Manual reopen | An **"Open Narrative"** button appears in the mission footer whenever `leadInModalDefId` is set. Clicking it always opens the modal, bypassing the session guard. |
| Multi-page | Fully supported via existing `NEXT_PAGE` / `PREV_PAGE` button actions in the `ModalDef` spec. |
| Context | The modal spec is resolved server-side with context `{ mission }`, so template tokens like `${mission.name}` work. |

### Modal fields summary

| Field | Description |
|-------|-------------|
| `leadInModalDefId` | `ModalDef.id` for the narrative lead-in (auto-opened once per session; reopenable). |
| `activeModalDefId` | `ModalDef.id` shown while the mission job is in progress. |
| `readyModalDefId` | `ModalDef.id` when ready to claim (falls back to `activeModalDefId`). |
| `completedModalDefId` | `ModalDef.id` after mission success. |
| `failedModalDefId` | `ModalDef.id` on mission failure (falls back to `completedModalDefId`). |

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

### How the quality roll works

When a mission **succeeds**, the server calls `rollQualityFromCl(teamMP, rng, centerOverrides, sigma)` from `packages/math/src/crafting-luck.ts` — the identical function used by the crafting pipeline (see [RecipeDef `tiers`](#player-jobs--post-apijobspreview) for the crafting counterpart).

**Step 1 — compute a Gaussian weight for every tier**

```
weight_i = exp( -(center_i − teamMP)² / (2 × sigma²) ) + ε
```

where `center_i` is the tier's default CL value (or its `clRequirement` override), `sigma` defaults to `22`, and `ε = 0.005` is a small floor that keeps every tier reachable regardless of team power.

**Step 2 — normalise to probabilities**

```
probability_i = weight_i / Σ weight_j
```

**Step 3 — pick a tier**

A seeded random number in `[0, 1)` walks the cumulative probability distribution; the first tier whose running sum exceeds the roll is awarded.

> **The CL axis for missions is team Mission Power (teamMP).** This is the combined stat of the whole team after equipment, active effects, synergy bonuses, and the anti-whale cap are applied — not any single entity's crafting luck.

### Probability table (default sigma = 22)

The table below shows each tier's probability (%) at seven reference team-MP values. All seven tiers are always reachable, but the floor is ≈ 0.3 % when far from the center.

| Team MP | Common | Uncommon | Scare | Rare | Epic | Mythic | Legendary |
|--------:|-------:|---------:|------:|-----:|-----:|-------:|----------:|
| **15**  | 69.1 % |   27.5 % |  2.0 % | 0.4 % | 0.3 % | 0.3 % | 0.3 % |
| **45**  | 21.6 % |   54.4 % | 21.6 % | 1.6 % | 0.3 % | 0.3 % | 0.3 % |
| **75**  |  1.6 % |   21.3 % | 53.7 % | 21.3 % | 1.6 % | 0.3 % | 0.3 % |
| **105** |  0.3 % |    1.6 % | 21.3 % | 53.6 % | 21.3 % | 1.6 % | 0.3 % |
| **135** |  0.3 % |    0.3 % |  1.6 % | 21.3 % | 53.6 % | 21.3 % | 1.6 % |
| **165** |  0.3 % |    0.3 % |  0.3 % |  1.6 % | 21.6 % | 54.3 % | 21.6 % |
| **195** |  0.3 % |    0.3 % |  0.3 % |  0.4 % |  2.0 % | 27.5 % | 69.1 % |

Each tier peaks when team MP equals its default center CL. Adjacent tiers share roughly 21 % of the probability mass, and the next-nearest tiers share ~1.6 %, so the curve is fairly tight: a team at MP 75 almost never sees legendary.

### Worked example — effect of `sigma`

Consider a mission where the design intent is **uncommon outcomes** at team MP 45.

| sigma | Common | Uncommon | Scare | Rare | Epic | Mythic | Legendary |
|------:|-------:|---------:|------:|-----:|-----:|-------:|----------:|
| **10** (narrow) |  1.5 % | **95.1 %** |  1.5 % | 0.5 % | 0.5 % | 0.5 % | 0.5 % |
| **22** (default) | 21.6 % | **54.4 %** | 21.6 % | 1.6 % | 0.3 % | 0.3 % | 0.3 % |
| **40** (wide) | 25.7 % | **33.9 %** | 25.7 % | 11.1 % | 2.9 % | 0.5 % | 0.2 % |

- **Low sigma** → outcomes concentrate tightly around the winning tier. Good for predictable, skill-gated missions where the team MP is well above or well below the threshold.
- **High sigma** → outcomes spread across many tiers. Good for high-variance "lottery" missions or when the design wants adjacent tiers to feel equally likely.

### Worked example — effect of `clRequirement`

`clRequirement` on a tier block shifts **where that tier's Gaussian bell peaks** without affecting other tiers.

Suppose you want the **rare** tier to be attainable at team MP 60 instead of the default 105. Set `"rare": { "clRequirement": 60, ... }`.

At team MP 60, default sigma 22:

| Rare center | Common | Uncommon | Scare | **Rare** | Epic | Mythic | Legendary |
|-------------|-------:|---------:|------:|-------:|-----:|-------:|----------:|
| 105 (default) | 6.9 % | 42.7 % | 42.7 % | **6.9 %** | 0.4 % | 0.3 % | 0.3 % |
| 60 (override) | 4.7 % | 29.0 % | 29.0 % | **36.6 %** | 0.3 % | 0.2 % | 0.2 % |

Without the override, a team at MP 60 sits exactly between the uncommon (45) and scare (75) centers, so those two tiers share ~85 % of the mass and rare barely shows up at 6.9 %. Shifting rare's center to 60 pushes rare to 36.6 % — now the most likely single outcome — while uncommon and scare each drop to ~29 %.

Lowering `clRequirement` pulls the Gaussian peak left so the rare tier becomes the dominant outcome at lower team MP. Raising it beyond the default pushes the peak right, making rare harder to reach. You can shift individual tiers independently — the other tiers keep their default centers unless they also carry a `clRequirement`.

> **Tip for balancing:** define `clRequirement` values in steps of 30 (matching the default inter-tier spacing) so the distribution stays symmetric. Irregular spacing will compress some tiers and expand others.

### Fallback behaviour

- If a tier block is defined in `tiers` but its `rewards` array is empty (or the block is missing), the server falls back to the flat `success.rewards` / `failure.rewards` block on the `MissionDef`. Design the flat rewards as a sensible default.
- If `tiers` is absent or contains no non-empty reward blocks, the classic binary `success` / `failure` outcome is used instead — no quality roll takes place.

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

In this example:
- `sigma: 20` narrows the bell slightly versus the default 22.
- `failure` pays a small consolation currency reward.
- `common` and `legendary` use their default Gaussian centers (15 and 195).
- `rare` is shifted: its bell peaks at MP 120 instead of 105, making it a touch harder to reach.
- `uncommon`, `scare`, `epic`, and `mythic` are not defined, so they fall back to the flat `success.rewards` block.

### Cross-reference — crafting quality rolls

The mission `tiers` mechanic is identical to the crafting pipeline. See the **`jobType: "crafting"` preview response** in [Player Jobs — POST /api/jobs/preview](#player-jobs--post-apijobspreview) for `qualityProbabilities` — the server returns the live probability breakdown so the UI can display it before the player commits to starting a mission or craft.

The shared implementation lives in `packages/math/src/crafting-luck.ts`:
- `QUALITY_TIERS` — canonical tier keys, labels, and default center CL values.
- `qualityProbabilities(cl, centerOverrides, sigma)` — returns the full probability array for any CL input.
- `rollQualityFromCl(cl, rng, centerOverrides, sigma)` — performs the seeded roll and returns the winning tier.

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

## Player NFT Resync — `POST /api/admin/players/:id/nft/resync`

Force an immediate NFT ownership sync for a specific player. Behaves identically to the player-initiated sync from Settings, but can be triggered by an admin on behalf of any player.

**Auth:** Admin

**Response:**

```json
{ "claimed": 2, "unclaimed": 0, "transferred": 1 }
```

| Field | Description |
|-------|-------------|
| `claimed` | NFTs newly assigned to this player |
| `unclaimed` | NFTs removed from this player (no longer in their wallet) |
| `transferred` | NFTs transferred from another player to this player |

A real-time `playerDelta` is pushed to the player's SSE stream so their client updates immediately.

---

## Player List — `GET /api/admin/players`

Browse all players with optional free-text filtering and pagination.

**Auth:** Admin

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Optional filter — case-insensitive contains match on `username`, `email`, or `id` |
| `page` | integer | `1` | 1-based page number |
| `limit` | integer | `20` | Results per page (max 100) |

**Response:**

```json
{
  "items": [
    {
      "id": "uuid",
      "username": "playerName",
      "email": "player@example.com",
      "keeperLevel": 5,
      "primaryWallet": {
        "chain": "CARDANO",
        "address": "addr1q…"
      }
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20
}
```

`primaryWallet` is `null` when the player has no linked wallets. When present, it is the wallet marked `isPrimary`, or the earliest-created wallet if none is marked primary.

Players are ordered by `createdAt desc` (newest first).

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

---

## GiftDef — Standalone Gift Definitions

A `GiftDef` row is a reusable gift template stored in the database. Any `GiftSpec` that uses `{ "giftDefId": "..." }` resolves to one of these rows at issue time. Use a `GiftDef` when the same gift is issued from multiple sources (events, check-in tracks, admin tooling) so that presentation and rules stay in sync.

**DB table:** `gift_defs`

### Field table

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `id` | string | — | ✓ | Stable slug identifier, e.g. `gift_welcome_pack`. Must be unique. |
| `name` | string | — | ✓ | Admin-facing display name shown in the definition editor. |
| `version` | integer | `1` | — | Monotonically increasing author version. Snapshot at issue time for audit purposes. |
| `presentation` | `GiftPresentation` | `{}` | — | UI hints for the gift card and reveal screen. See [presentation sub-fields](#giftpresentation-sub-fields) below. |
| `claimRules` | `GiftClaimRules` | `{}` | — | Constraints applied when the gift is issued and when it is claimed. See [claimRules sub-fields](#giftclaimrules-sub-fields) below. |
| `rewardSpec` | `OutcomeEntry[]` | `{}` | — | Reward entries to grant on claim. Same shape as mission/lootbox outcome arrays. See [Outcome Entry Types](#outcome-entry-types). |
| `instant` | boolean | `true` | — | `true` — rewards are granted immediately on claim. `false` — a `GIFT_PACKAGE` item is added to the player's inventory to be opened later. |
| `enabled` | boolean | `true` | — | Disabled rows cannot be issued or referenced. |
| `modalDefId` | string | `null` | — | Optional `ModalDef.id` to display when the player opens this gift. |
| `createdAt` | ISO datetime | now | — | Record creation timestamp (read-only). |
| `updatedAt` | ISO datetime | — | — | Last-modified timestamp (read-only). |

### `GiftPresentation` sub-fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Heading shown on the gift card and notification. |
| `subtitle` | string | Optional secondary line below the title. |
| `iconKey` | string | Asset key for the gift icon/thumbnail. |
| `animationKey` | string | Asset key for a reveal animation (played on claim). |
| `accentColor` | string | Hex colour used as the card accent, e.g. `"#FFD700"`. |

### `GiftClaimRules` sub-fields

| Field | Type | Description |
|-------|------|-------------|
| `limitPerPlayer` | integer | Maximum number of times a single player may claim gifts backed by this definition. Applies only when the gift was issued using `{ "giftDefId": "..." }` — inline gifts have no limit enforcement. |
| `expiresInSeconds` | integer | Seconds from issue time until the gift expires. Expired gifts are marked `EXPIRED` and cannot be claimed. Omit for no expiry. |

### Admin endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/definitions/giftDef` | List all gift definitions. |
| `GET` | `/admin/definitions/giftDef/:id` | Fetch a single gift definition. |
| `POST` | `/admin/definitions/giftDef` | Create a new gift definition. |
| `PUT` | `/admin/definitions/giftDef/:id` | Replace a gift definition. |
| `PATCH` | `/admin/definitions/giftDef/:id` | Partially update a gift definition. |
| `DELETE` | `/admin/definitions/giftDef/:id` | Delete a gift definition (use `enabled: false` to soft-disable instead). |
| `POST` | `/admin/gifts/send` | Immediately issue a gift to a player by `giftDefId`. Body: `{ "userId", "giftDefId", "contextData?" }`. |

### Example — minimal gift definition

```json
{
  "id": "gift_welcome_pack",
  "name": "Welcome Pack",
  "presentation": {
    "title": "Welcome to Derp Universe!",
    "iconKey": "gift_welcome",
    "accentColor": "#4CAF50"
  },
  "claimRules": {
    "limitPerPlayer": 1,
    "expiresInSeconds": 604800
  },
  "rewardSpec": [
    { "type": "currency", "key": "soft_coins", "min": 500, "max": 500 },
    { "type": "item", "key": "mat_starter_ore", "min": 5, "max": 5 }
  ],
  "instant": true,
  "modalDefId": "modal_welcome_reveal"
}
```

---

## EventDefinition — System Event Definitions

An `EventDefinition` row describes a named server-side event that can be dispatched to trigger backend logic on behalf of a player. Events are dispatched by admin tooling, the tick processor, or other game systems. The `handlerKey` field selects which handler function is executed.

**DB table:** `event_definitions`

### Field table

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `id` | string | — | ✓ | Stable slug identifier, e.g. `event_mission_complete_bonus`. Must be unique. |
| `name` | string | — | ✓ | Admin-facing display name. |
| `version` | integer | `1` | — | Monotonically increasing author version for audit. |
| `kind` | string | `"system"` | — | Categorisation label for filtering in the admin panel. Informational only; has no effect on dispatch. |
| `handlerKey` | string | — | ✓ | Selects the server-side handler function to execute. See [handler keys](#handler-keys) below. |
| `security` | `EventSecurity` | `{}` | — | Access control restrictions. See [security sub-fields](#eventsecurity-sub-fields) below. |
| `inputSchema` | JSON object | `{}` | — | Optional JSON Schema (draft-07 or compatible) documenting the expected `payload` shape. Used for documentation and editor validation only — the server does not strictly validate against it at dispatch time. |
| `enabled` | boolean | `true` | — | Disabled events cannot be dispatched; the server returns `400`. |
| `createdAt` | ISO datetime | now | — | Record creation timestamp (read-only). |
| `updatedAt` | ISO datetime | — | — | Last-modified timestamp (read-only). |

### Handler keys

| `handlerKey` | What it does | Required payload fields |
|--------------|-------------|------------------------|
| `createGiftForPlayer` | Issues a gift to the target player. | `gift` — a `GiftSpec` (either `{ "giftDefId": "..." }` or a full `InlineGiftDef`). Optional: `contextData` (object) merged into the gift snapshot for template token resolution. |

> **Adding new handler keys:** the `handlerKey` enum is enforced in `EventService.dispatch()`. Any key not listed in the `switch` statement throws `400 — Unknown handler key`. A new handler requires a code change in addition to the definition row.

### `EventSecurity` sub-fields

| Field | Type | Description |
|-------|------|-------------|
| `allowedEmitters` | `string[]` | Whitelist of `sourceType` values permitted to dispatch this event. Common values: `"MissionJob"`, `"CraftingJob"`, `"BuildingJob"`, `"admin"`. If omitted, any source type is allowed. |

### Context enrichment

When `sourceType` is one of `MissionJob`, `CraftingJob`, or `BuildingJob`, the dispatcher automatically looks up the job record and injects it as `{ job: { id, type, defId, status, team, results, data, timer } }` into the gift's `contextData`. This lets `rewardSpec` and `modalDef` specs use tokens like `${job.team}` or `${job.results.tier}`.

Any additional keys provided in `payload.contextData` are merged on top of the auto-enriched context.

### Admin endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/definitions/eventDefinition` | List all event definitions. |
| `GET` | `/admin/definitions/eventDefinition/:id` | Fetch a single event definition. |
| `POST` | `/admin/definitions/eventDefinition` | Create a new event definition. |
| `PUT` | `/admin/definitions/eventDefinition/:id` | Replace an event definition. |
| `PATCH` | `/admin/definitions/eventDefinition/:id` | Partially update an event definition. |
| `DELETE` | `/admin/definitions/eventDefinition/:id` | Delete an event definition. |
| `POST` | `/admin/events/dispatch` | Manually dispatch an event to a player. Body: `{ "defId", "userId", "payload?" }`. |

### Example — event definition for a mission completion bonus

```json
{
  "id": "event_mission_legendary_reward",
  "name": "Mission Legendary Tier Reward",
  "kind": "mission",
  "handlerKey": "createGiftForPlayer",
  "security": {
    "allowedEmitters": ["MissionJob"]
  },
  "inputSchema": {
    "type": "object",
    "required": ["gift"],
    "properties": {
      "gift": { "$ref": "#/complexTypes/GiftSpec" }
    }
  },
  "enabled": true
}
```

**Payload sent at dispatch time (by the job processor):**

```json
{
  "gift": { "giftDefId": "gift_legendary_mission_crate" }
}
```

---

## ModalDef and DefaultModalDef

`ModalDef` and `DefaultModalDef` rows store server-rendered modal specifications. Any system that opens a modal by ID — missions, gifts, check-ins, manual admin triggers — references one of these rows. The server resolves template tokens in the spec using a context object before sending the rendered spec to the client.

**DB tables:** `modal_defs` (editable), `default_modal_defs` (read-only; cannot be created or deleted via admin API).

> **`DefaultModalDef` is read-only:** these rows are seeded by the game system (e.g. mission outcome templates) and may only be updated via `PATCH`. Creating or deleting via the admin API returns `405`.

### Field table

Both models share the same columns:

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `id` | string | — | ✓ | Stable slug identifier, e.g. `modal_mission_complete`. Must be unique within the table. |
| `name` | string | — | ✓ | Admin-facing display name. |
| `description` | string | `null` | — | Optional longer description for admin panel context. |
| `version` | integer | `1` | — | Monotonically increasing author version. |
| `spec` | `ModalSpecV1` | `{}` | — | The full modal specification. See [ModalSpecV1 structure](#modalspecv1-structure) below. |
| `enabled` | boolean | `true` | — | Disabled modals return `404` when fetched by the client. |
| `createdAt` | ISO datetime | now | — | Record creation timestamp (read-only). |
| `updatedAt` | ISO datetime | — | — | Last-modified timestamp (read-only). |

### Admin endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/definitions/modalDef` | List all modal definitions. |
| `GET` | `/admin/definitions/modalDef/:id` | Fetch a single modal definition. |
| `POST` | `/admin/definitions/modalDef` | Create a new modal definition. |
| `PUT` | `/admin/definitions/modalDef/:id` | Replace a modal definition. |
| `PATCH` | `/admin/definitions/modalDef/:id` | Partially update a modal definition. |
| `DELETE` | `/admin/definitions/modalDef/:id` | Delete a modal definition. |
| `GET` | `/admin/definitions/defaultModalDef` | List all default modal definitions. |
| `GET` | `/admin/definitions/defaultModalDef/:id` | Fetch a single default modal definition. |
| `PATCH` | `/admin/definitions/defaultModalDef/:id` | Partially update a default modal definition (only allowed operation). |

### `ModalSpecV1` structure

The `spec` field must conform to `ModalSpecV1`. All string values inside `spec` may contain `${path.to.value}` tokens that are resolved server-side using the context injected at render time (e.g. `${job.results.tier}`, `${mission.name}`).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `1` | ✓ | Always `1`. |
| `id` | string | ✓ | Stable identifier echoed in the rendered response for client-side cache keying. |
| `kind` | string | ✓ | Semantic category, e.g. `"gift_reveal"`, `"mission_outcome"`, `"narrative"`. Informational. |
| `dismiss` | `{ backdrop, x, escape }` | ✓ | Which interactions can close the modal. Each field is a boolean. |
| `header` | `ModalHeader` | ✓ | Top-bar content for the modal (see below). |
| `buttons` | `ModalButton[]` | ✓ | Default action buttons shared by all pages unless overridden. |
| `pages` | `ModalPageSpec[]` | ✓ | One entry per page. Single-page modals have exactly one entry. |
| `showPageIndicator` | boolean | — | Show dot-style page progress indicator for multi-page modals. Default: `false`. |
| `telemetry` | `ModalTelemetry` | — | Optional tracking metadata attached to open/close events. Fields: `sourceType`, `sourceId`, `notificationId`, `jobId`, `templateId`, `experiment`. |

#### `ModalHeader`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✓ | Main heading. Supports `${...}` tokens. |
| `subtitle` | string | — | Secondary heading below the title. |
| `icon` | `{ assetKey, alt? }` | — | Small icon shown beside the title. |
| `banner` | `{ assetKey, alt? }` | — | Full-width hero image at the top of the modal. |

#### `ModalPageSpec`

Each page inherits `header`, `buttons`, and `dismiss` from the root spec and can override them per-page:

| Field | Type | Description |
|-------|------|-------------|
| `body` | `ModalBlock[]` | Required. The blocks rendered in the page body (see block reference below). |
| `header` | `Partial<ModalHeader>` | Overrides the root header fields for this page only. |
| `buttons` | `ModalButton[]` | Replaces the root buttons entirely for this page. |
| `dismiss` | `{ backdrop?, x?, escape? }` | Overrides individual dismiss flags for this page. |

#### `ModalButton`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier within the modal. |
| `label` | string | ✓ | Button text. Supports `${...}` tokens. |
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger"` | ✓ | Visual style. |
| `disabled` | boolean | — | Renders the button as non-interactive when `true`. |
| `action` | `ModalAction` | ✓ | What happens when the button is tapped. See [action types](#modal-action-types) below. |
| `requiresConfirm` | `{ title, body?, confirmLabel?, cancelLabel? }` | — | Shows an inline confirmation dialog before executing the action. `body` is a `ModalBlock[]`. |
| `skipMeta` | `{ baseCosts, skipType }` | — | Skip/speed-up metadata. `baseCosts` is an array of `{ assetKey?, label, amount, currencyId? }`; `skipType` is `"absolute"` or `"scaling"`. |

#### Modal action types

| `type` | Additional fields | Description |
|--------|-------------------|-------------|
| `CLOSE_MODAL` | — | Dismisses the modal. |
| `NEXT_PAGE` | — | Advances to the next page (no-op on the last page). |
| `PREV_PAGE` | — | Returns to the previous page (no-op on the first page). |
| `NAVIGATE` | `route: string`, `params?` | Navigates to a client route. |
| `ACK_NOTIFICATION` | `notificationId: string` | Marks a notification as read. |
| `COMPLETE_JOB` | `jobId: string` | Finalises an in-progress job. |
| `CLAIM_GIFT` | `giftId: string` | Claims a gift instance. |
| `OPEN_INVENTORY` | — | Opens the inventory screen. |
| `OPEN_MISSIONS` | — | Opens the missions screen. |
| `OPEN_CRAFTING` | — | Opens the crafting screen. |
| `REPEAT_MISSION` | `defId: string`, `entityIds?` | Re-dispatches the same mission. |
| `CRAFT_AGAIN` | `recipeDefId: string` | Re-runs the same crafting recipe. |
| `API_CALL` | `apiKey: string`, `payload?` | Fires a registered API action key server-side. |
| `BUILD_BUILDING` | `locationId`, `buildingDefId` | Starts construction of a building. |
| `UPGRADE_BUILDING` | `locationId`, `buildingId` | Starts a building upgrade. |
| `SHOP_PURCHASE` | `shopItemDefId: string` | Purchases a shop item. |
| `DEPOSIT_LOCATION_XP` | `locationId`, `costOption`, `charges?`, `chargesBindingId?` | Deposits XP charges into a location. |
| `PRESTIGE` | — | Triggers player prestige. |
| `SKIP` | `targetType: string`, `targetId: string` | Skips a timed activity (uses `skipMeta` cost). |
| `EXECUTE_COMMAND` | `command: string`, `payload` | Executes an arbitrary game command server-side. |

### Block reference

Every `ModalPageSpec.body` is an array of `ModalBlock` objects. Each block has a `type` discriminant. String fields in blocks support `${...}` token interpolation unless noted.

> For the full block vocabulary with visual examples, see `render-blocks.md`.

| `type` | Key fields | Description |
|--------|-----------|-------------|
| `richText` | `doc: RichTextDoc`, `from?` | Structured rich text. `doc` is an array of `RichTextNode` (see below). |
| `divider` | — | A horizontal separator line. |
| `image` | `image: { assetKey, alt? }`, `caption?`, `display?`, `from?` | Displays an asset image. `display`: `{ align?, sizing?, width?, borderRadius? }`. |
| `metaRows` | `rows: { label, value, valueItems? }[]`, `from?` | Key-value table rows. `valueItems` is `{ assetKey, amount }[]` for icon+number display. |
| `timer` | `endsAt: string` (ISO), `label?`, `from?` | Live countdown to `endsAt`. |
| `progress` | `current`, `max`, `label?`, `startsAt?`, `endsAt?`, `from?` | Progress bar. Can be time-driven (with `startsAt`/`endsAt`) or value-driven (`current`/`max`). |
| `rewardsPreview` | `items: RewardItem[]`, `from?` | Compact icon grid of potential rewards. |
| `rewardsList` | `title?`, `items: RewardItem[]`, `from?` | Labelled list of granted rewards. |
| `inventoryDelta` | `items: { assetKey?, name, qtyDelta }[]`, `from?` | Shows item quantity changes (+/−). |
| `giftReveal` | `gift: { giftId, title, image? }`, `rewards?`, `from?` | Gift opening reveal with reward list. |
| `list` | `list: string` (dot-path), `children: ModalBlock[]`, `emptyText?` | Iterates a context array; renders `children` once per item with `item`/`index` in scope. |
| `clickReveal` | `cover?`, `coverImage?`, `tags?`, `soundMap?`, `fxMap?`, `children: ModalBlock[]` | Tap-to-reveal container. `soundMap`/`fxMap` are `"key=asset,*=fallback"` strings. |
| `error` | `message: string`, `from?` | Displays an error message in a styled error box. |
| `characterEvents` | `items: CharacterEvent[]`, `from?` | Shows level-up or injury events. Each item: `{ type: "level_up" \| "injured", entityName, newLevel? }`. |
| `entityRoster` | `editable: boolean`, `entities: Entity[]`, `from?` | Displays a team roster. Entity shape: `{ id, name, level, portraitKey?, powerContribution?, outcome? }`. |
| `quantityInput` | `id`, `min`, `max`, `defaultValue`, `resourceId`, `costAmount`, `xpPerCharge`, `from?` | Numeric stepper for XP charge deposit flows. |

#### `from` — context binding

Most block types accept an optional `from` field containing a dot-path string (e.g. `"job.results.rewards"`). When present, the resolver reads that path from the render context and maps the data onto the block's primary content fields, overriding any static values. This is how templates stay generic while content is injected at render time.

#### `RewardItem`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name of the reward. |
| `qty` | number | Quantity granted. |
| `assetKey` | string | Asset key for the reward icon. |
| `rarity` | string | Optional rarity label (`"common"`, `"rare"`, etc.). |
| `note` | string | Optional footnote shown below the item. |

#### `RichTextDoc` and `RichTextNode`

`RichTextDoc` is an array of `RichTextNode`. Each node is one of:

| `t` | Additional fields | Description |
|-----|-------------------|-------------|
| `"p"` | `c: RichTextNode[]` | Paragraph block. |
| `"h1"` | `c: RichTextNode[]` | Level-1 heading. |
| `"h2"` | `c: RichTextNode[]` | Level-2 heading. |
| `"ul"` | `c: RichTextNode[]` | Unordered list container. |
| `"li"` | `c: RichTextNode[]` | List item. |
| `"strong"` | `c: RichTextNode[]` | Bold inline text. |
| `"em"` | `c: RichTextNode[]` | Italic inline text. |
| `"code"` | `c: RichTextNode[]` | Inline code span. |
| `"link"` | `c: RichTextNode[]`, `href: string` | Hyperlink. |
| `"text"` | `v: string` | Literal text leaf. Supports `${...}` token interpolation. |
| `"br"` | — | Line break. |
| `"token"` | `key: string` | Context token; resolved to the value at `key` in the render context at display time. |

### Example — single-page gift reveal modal

```json
{
  "id": "modal_welcome_reveal",
  "name": "Welcome Pack Reveal",
  "spec": {
    "version": 1,
    "id": "modal_welcome_reveal",
    "kind": "gift_reveal",
    "dismiss": { "backdrop": false, "x": true, "escape": true },
    "header": {
      "title": "Welcome to Derp Universe!",
      "banner": { "assetKey": "banner_welcome" }
    },
    "buttons": [
      { "id": "close", "label": "Claim", "variant": "primary", "action": { "type": "CLOSE_MODAL" } }
    ],
    "pages": [
      {
        "body": [
          {
            "type": "richText",
            "doc": [
              { "t": "p", "c": [{ "t": "text", "v": "Here's what you've received:" }] }
            ]
          },
          { "type": "rewardsList", "from": "grants" }
        ]
      }
    ]
  }
}
```

### Example — multi-page narrative modal with token interpolation

```json
{
  "id": "modal_mission_briefing",
  "name": "Mission Briefing",
  "spec": {
    "version": 1,
    "id": "modal_mission_briefing",
    "kind": "narrative",
    "dismiss": { "backdrop": true, "x": true, "escape": true },
    "header": { "title": "${mission.name}" },
    "buttons": [],
    "showPageIndicator": true,
    "pages": [
      {
        "body": [
          { "type": "image", "image": { "assetKey": "${mission.bannerKey}" } },
          { "type": "richText", "from": "mission.briefingDoc" }
        ],
        "buttons": [
          { "id": "next", "label": "Next", "variant": "primary", "action": { "type": "NEXT_PAGE" } }
        ]
      },
      {
        "body": [
          { "type": "metaRows", "from": "mission.stats" }
        ],
        "buttons": [
          { "id": "prev", "label": "Back", "variant": "ghost", "action": { "type": "PREV_PAGE" } },
          { "id": "close", "label": "Got it", "variant": "primary", "action": { "type": "CLOSE_MODAL" } }
        ]
      }
    ]
  }
}
```

---

## Purchases — `/v1/purchases`

Unified purchase API supporting Stripe and crypto (USDC/ADA) payment rails.

### `POST /v1/purchases`

Create a new gem pack purchase.

**Auth:** Player JWT

**Body:**
```json
{
  "packId": "gems_100",
  "paymentMethod": "stripe | crypto_evm | crypto_cardano"
}
```

**Response (Stripe):**
```json
{
  "purchaseId": "<uuid>",
  "action": { "type": "redirect", "url": "https://checkout.stripe.com/..." }
}
```

**Response (crypto_evm / crypto_cardano):**
```json
{
  "purchaseId": "<uuid>",
  "action": {
    "type": "payment_address",
    "address": "0xABC...",
    "amountExpected": "990000",
    "amountDisplay": "0.990000 USDC",
    "chain": "ETH",
    "expiresAt": "2026-05-21T03:20:00.000Z"
  }
}
```

`amountExpected` is in the smallest token unit (USDC: 6 decimals, ADA: lovelaces).
Payment window is 30 minutes. On expiry the purchase row status becomes EXPIRED.

**Cardano ADA pricing:**

ADA amounts are computed from the live time-weighted average (TWA) rate at purchase creation time. The TWA uses samples collected by the ADA oracle poller over a configurable window (default 1 hour). The snapshot is stored in `Purchase.rateSnapshot`:

```json
{
  "ADA/USD": {
    "lovelacePerUsd": 2040816,
    "usdPrice": 0.99,
    "lovelaceAmount": 2020409,
    "twaWindowSeconds": 3600,
    "sampleCount": 12,
    "computedAt": "2026-05-29T10:00:00.000Z"
  }
}
```

EVM/USDC amounts remain fixed at pack-definition price.

---

### `GET /v1/purchases/:id`

Get purchase status. Players can only fetch their own purchases.

**Auth:** Player JWT

**Response:**
```json
{
  "id": "<uuid>",
  "packId": "gems_100",
  "gemAmount": 100,
  "paymentMethod": "CRYPTO_EVM",
  "status": "PENDING | CONFIRMED | FAILED | EXPIRED",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

---

## Store Hero Banners — `ShopHeroDef` (Admin Smart Table)

Hero banners are managed via the generic admin smart-editor at `GET /api/admin/shopHeroDef`.

Banners are rendered as a swipeable carousel at the very top of the player store, above the tab bar. When no active banners exist the carousel collapses and the tab bar sits at the top as normal.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (cuid) | auto | Auto-generated. Leave blank when creating. |
| `headline` | string | ✓ | Main banner text. Displayed in uppercase with Cinzel font. |
| `subText` | string | | Secondary line shown below the headline. |
| `imageUrl` | string | | Background image URL or asset key (displayed at 160 px height). |
| `backgroundColor` | string | | CSS background color used when no image is set, or as overlay base. Default `#1a1640`. |
| `ctaLabel` | string | | Call-to-action button label (e.g. `Shop Now`). Leave blank to hide the button. |
| `ctaTarget` | string | | CTA destination: a store tab ID (e.g. `featured`, `gems`, `bundle`) to switch tabs in-app, or a full `https://` URL to open externally. |
| `sortOrder` | number | | Position in the carousel. Lower = appears first. Default `0`. |
| `enabled` | boolean | | Disabled banners are hidden from all players. Default `true`. |
| `limitedUntil` | datetime | | ISO datetime — banner automatically hides after this time. The API pre-filters expired banners; the frontend also filters via `serverNow()` so banners drop out in real time without a re-fetch. |

### Carousel behaviour

- **0 active banners** — carousel is hidden; store opens directly at the tab bar.
- **1 active banner** — rendered as a static card (no dots, no swipe handling).
- **2–5 active banners** — swipeable carousel with dot indicators and 5-second auto-advance. Auto-advance pauses 10 seconds after any user interaction (swipe, dot click, CTA tap).

---

## Store Tabs — `ShopTabDef` (Admin Smart Table)

Store tabs are managed via the generic admin smart-editor at `GET /api/admin/shopTabDef`.

Five canonical tabs are seeded automatically on startup (`featured`, `gems`, `currency`, `bundle`, `items`). Custom tabs can be created by admins; they appear in the player store immediately.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique tab identifier (e.g. `featured`, `seasonal`). Used as the `tab` key on `ShopItemDef` rows. |
| `name` | string | ✓ | Label shown in the player-facing tab strip. Supports emoji (e.g. `💎 Gems`). |
| `tabType` | enum | | `items` (default) — renders `ShopItemDef` rows. `gems_packs` — renders the special gem packs + Derp Pass UI. |
| `layout` | enum | | Card layout within the tab. `featured` = full-width cards, `grid-3` = 3-column currency cards, `grid-2` = 2-column item/bundle cards (default). |
| `ungroupedPlacement` | enum | | Where items with no `sectionId` appear relative to sections. `before` (default) = above all sections, `after` = below all sections. |
| `sortOrder` | number | | Left-to-right tab order. Lower = further left. Default `0`. |
| `enabled` | boolean | | Disabled tabs are hidden from all players. Default `true`. |

---

## Store Sections — `ShopSectionDef` (Admin Smart Table)

Store sections are managed via the generic admin smart-editor at `GET /api/admin/shopSectionDef`.

Sections let admins insert named group headings between items within a tab. Items with no `sectionId` appear before any sections.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique section identifier (e.g. `section_limited_time`). |
| `tabId` | string (FK) | ✓ | The `ShopTabDef.id` this section belongs to. |
| `label` | string | ✓ | Section heading shown above the item group. |
| `subtitle` | string | | Optional subtitle line shown below the heading. |
| `sortOrder` | number | | Vertical ordering within the tab. Lower = higher on screen. Default `0`. |

---

## Player Shop Catalog — `GET /api/shop/items`

Returns the full store catalog for the authenticated player.

**Auth:** JWT (player)

**Response:**
```json
{
  "tabs": [
    {
      "id": "featured",
      "name": "Featured",
      "tabType": "items",
      "layout": "featured",
      "sortOrder": 0,
      "enabled": true
    }
  ],
  "sections": [
    {
      "id": "section_limited_time",
      "tabId": "featured",
      "label": "Limited Time",
      "subtitle": "These offers expire soon!",
      "sortOrder": 0
    }
  ],
  "items": [
    {
      "id": "cuid...",
      "name": "Adventurer's Bundle",
      "description": "...",
      "tab": "featured",
      "sectionId": null,
      "cost": [{ "type": "currency", "id": "soft_arcanium", "amount": 500 }],
      "contents": [{ "type": "currency", "id": "hard_essence", "amount": 50 }],
      "badge": "HOT DEAL",
      "badgeColor": "#ef4444",
      "displayOrder": 0,
      "enabled": true,
      "availableFrom": null,
      "limitedUntil": null
    }
  ]
}
```

Only enabled tabs and enabled items within their active date window are returned. An item with `availableFrom` in the future is suppressed until that time arrives; an item whose `limitedUntil` has passed is suppressed immediately. All sections (including those with no items) are returned — the frontend hides sections with no visible items.

### ShopItemDef fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `gems_100`). |
| `name` | string | ✓ | Display name shown on the card. |
| `description` | string | | Short description. Default `""`. |
| `tab` | string (FK) | | Store tab ID (references `ShopTabDef.id`). Default `featured`. |
| `sectionId` | string (FK) | | Optional section within the tab (references `ShopSectionDef.id`). |
| `cost` | CostEntry[] | | Array of `{type, id, amount}` cost entries (currency or item). |
| `originalCost` | CostEntry[] | | Original price for strikethrough display. Same format as `cost`. |
| `contents` | ContentEntry[] | | Array of `{type, id?, amount}` entries granted on purchase. See **ContentEntry types** below. |
| `badge` | string | | Badge label shown on the card (e.g. `HOT`, `NEW`, `SALE`). |
| `badgeColor` | string | | CSS color for the badge background. |
| `imageUrl` | string | | URL or asset key for the card image. |
| `displayOrder` | number | | Sort order within the tab/section. Lower = first. Default `0`. |
| `enabled` | boolean | | Hidden from all players when `false`. Default `true`. |
| `availableFrom` | datetime | | ISO datetime — item is suppressed from the catalog until this time. Leave `null` to make it available immediately. The admin list shows a **scheduled** badge on not-yet-active rows. |
| `limitedUntil` | datetime | | ISO datetime — item is automatically removed from the catalog after this time. When fewer than 24 h remain the player-facing card shows a live countdown. The admin list shows an **expiring** badge on rows within 24 h of this deadline. |

### ContentEntry types

Each entry in `contents` is an object with `{type, id?, amount}`. The `type` field determines what is granted and whether `id` is required.

| `type` | `id` | `amount` | Description |
|--------|------|----------|-------------|
| `currency` | ✓ currencyId | number | Credits the player's balance for the named currency. |
| `item` | ✓ itemDefinitionId | number | Adds `amount` copies of the item to the player's inventory. |
| `outpost_slots` | — (omit) | number | Permanently increments `bonusOutpostSlots` on the player's account, unlocking additional outpost territory claims. |

**Example — 1 outpost slot:**
```json
{ "type": "outpost_slots", "amount": 1 }
```

---

## Gem Pack Display — `/api/admin/gemPacks`

These endpoints let content editors update the visual presentation of gem packs (labels, colors, badges) without a code change or redeploy. The display metadata is stored in Stripe product metadata and read by the public `/v1/payments/packs` endpoint.

### `GET /api/admin/gemPacks`

List all gem packs with their current display settings.

**Auth:** Admin

**Response:** `GemPackDef[]`

```json
[
  {
    "id": "gems_100",
    "productId": "prod_gems_100",
    "name": "100 Gems",
    "gemAmount": 100,
    "unitAmount": 99,
    "currency": "usd",
    "displayOrder": 0,
    "displayName": "HANDFUL",
    "accentColor": "#f59e0b",
    "borderColor": "rgba(245,158,11,0.35)",
    "glowColor": "transparent",
    "badgeType": null,
    "badgeLabel": null,
    "iconSize": 32
  }
]
```

---

### `GET /api/admin/gemPacks/:packId`

Get a single gem pack by pack ID (e.g. `gems_100`).

**Auth:** Admin

---

### `PUT /api/admin/gemPacks/:packId`

Update the display metadata for a gem pack. Only the supplied fields are changed; others are preserved.

**Auth:** Admin

**Body:**
```json
{
  "displayName": "HANDFUL",
  "accentColor": "#f59e0b",
  "borderColor": "rgba(245,158,11,0.35)",
  "glowColor": "transparent",
  "badgeType": "best_value",
  "badgeLabel": "BEST VALUE",
  "iconSize": 32
}
```

| Field | Type | Description |
|---|---|---|
| `displayName` | `string` | Label shown on the pack card (e.g. HANDFUL, SATCHEL, CHEST) |
| `accentColor` | `string` | CSS color for the display name text |
| `borderColor` | `string` | CSS color/rgba for the card border |
| `glowColor` | `string` | CSS color for the card glow shadow (`"transparent"` for none) |
| `badgeType` | `"best_value" \| "extra" \| null` | Badge style: `null` = none, `"best_value"` = purple BEST VALUE ribbon, `"extra"` = green custom label |
| `badgeLabel` | `string \| null` | Text in the extra badge (e.g. `"10% EXTRA"`). Only shown when `badgeType === "extra"`. |
| `iconSize` | `number` | Gem icon size in pixels (32–50) |

**Notes:**
- Changes take effect immediately — the public `/v1/payments/packs` endpoint reads metadata on every request.
- For live Stripe products (non-demo), this updates the metadata in the Stripe connector DB. Re-syncing from Stripe will overwrite admin changes; apply matching updates in the Stripe dashboard for persistence beyond a sync.

---

## Crypto Payment Environment Variables

| Variable               | Required for        | Description                                      |
|------------------------|---------------------|--------------------------------------------------|
| `PAYMENT_ADDRESS_EVM`  | crypto_evm rail     | Treasury EVM address to receive USDC payments    |
| `PAYMENT_ADDRESS_CARDANO` | crypto_cardano rail | Treasury Cardano address to receive ADA       |
| `EVM_RPC_URL`          | Optional            | Custom EVM JSON-RPC endpoint (default: Cloudflare Ethereum) |
| `EVM_USDC_ADDRESS`     | Optional            | Custom USDC contract address (default: mainnet)  |
| `BLOCKFROST_API_KEY`   | crypto_cardano rail | Blockfrost API key for Cardano on-chain checks   |

The on-chain confirmation worker polls every 15 seconds. For EVM it checks USDC Transfer events via `eth_getLogs`; for Cardano it queries address transactions via Blockfrost. Confirmed transactions are deduplicated by `txHash` to prevent double-crediting.

After confirmation, gems are credited via the shared `fulfillPurchase()` path and an SSE `purchase.confirmed` event is pushed to the player's stream.

---

## Screen Compositions — `/api/screens`

### `GET /api/screens/:screenKey`
Resolve the active `screen_composition` definition for a given screen key.

**Auth:** None required (public endpoint)

**Response:**
```json
{
  "id": "gamedef_home_screen_v1",
  "type": "screen_composition",
  "key": "home_screen",
  "version": 1,
  "isActive": true,
  "data": { "...ScreenCompositionDefinition..." },
  "startsAt": null,
  "endsAt": null,
  "createdAt": "2026-05-21T00:00:00.000Z",
  "updatedAt": "2026-05-21T00:00:00.000Z"
}
```

Returns `404` when no active definition exists for the key (frontend should fall back to legacy renderer).

---

### `GET /api/screens/:screenKey/preview?version=N`
Preview any version of a definition regardless of `isActive` status.

**Auth:** Admin (`X-Admin-Secret` header)

**Query params:** `version` (integer, default `1`)

---

## Game Definitions — `/api/admin/game-definitions`

All admin game-definition endpoints require the `X-Admin-Secret` header.

### `GET /api/admin/game-definitions?key=<screenKey>`
List all `screen_composition` game definitions. Filter by `key` to list all versions of a single screen.

**Auth:** Admin

**Response:** `ResolvedScreenDefinition[]`

---

### `POST /api/admin/game-definitions/:key/:version/publish`
Atomically deactivate all current active versions for `(screen_composition, key)` and activate the specified version.

**Auth:** Admin

**Response:** The newly published `ResolvedScreenDefinition`.

---

### `POST /api/admin/game-definitions/:key/:version/rollback`
Roll back to a previous version — same semantics as publish (deactivates all, activates the target version).

**Auth:** Admin

**Response:** The rolled-back `ResolvedScreenDefinition`.

---

### CRUD via Generic Admin Table Endpoints

`GameDefinition` rows are also available through the standard admin table CRUD:

| Operation | Endpoint |
|---|---|
| List all | `GET /api/admin/gameDefinition` |
| Get by ID | `GET /api/admin/gameDefinition/:id` |
| Create | `POST /api/admin/gameDefinition` |
| Update | `PUT /api/admin/gameDefinition/:id` |
| Delete | `DELETE /api/admin/gameDefinition/:id` |

**Key fields for `GameDefinition`:**

| Field | Type | Description |
|---|---|---|
| `type` | `"screen_composition" \| "content_document"` | Definition type |
| `key` | `string` | Stable key, e.g. `home_screen` or `mission_planning_document` |
| `version` | `number` | Increment to create a new draft without overwriting the live version |
| `isActive` | `boolean` | Use the publish endpoint — direct mutation risks two active versions |
| `startsAt` / `endsAt` | `string?` | ISO datetime availability window |
| `data` | `ScreenCompositionDefinition \| ContentDocumentDefinition` | Payload JSON matching the type |

**Unique constraint:** `(type, key, version)` — duplicate version creates a DB error.

---

## Content Documents — `GET /api/content-documents/:id`

Fetch a single active content document by its stable key. Returns the ordered block list and default context. Used by surface renderers (screens, modals) to resolve what to display.

**Auth:** JWT (player token required)

**Response:**
```json
{
  "id": "mission_planning_document",
  "version": 1,
  "blocks": [
    { "type": "mission_hero" },
    { "type": "mission_stats" },
    { "type": "mission_requirements" },
    { "type": "divider" },
    { "type": "team_section" },
    { "type": "mission_synergy" },
    { "type": "divider" },
    { "type": "reward_list" }
  ],
  "context": {
    "missionMode": "planning",
    "teamMode": "editable",
    "rewardMode": "preview"
  }
}
```

### Seeded content documents

| Key | Description |
|---|---|
| `mission_planning_document` | Mission panel pre-launch — team selection, requirements, reward preview |

### `ContentDocumentContext` fields

| Field | Values | Description |
|---|---|---|
| `missionMode` | `planning \| in_progress \| outcome` | Active phase of the mission lifecycle |
| `teamMode` | `editable \| locked` | Whether entity slots can be swapped |
| `rewardMode` | `preview \| actual` | Whether rewards are estimated or collected |

### `SurfaceContextOverrideRule`

Declared in the surface (screen/modal) config — not in the document itself. Overrides a slice of the document context when a live SSE event fires.

```json
{
  "on": "job.completed",
  "jobId": "optional-job-id",
  "apply": { "missionMode": "outcome", "teamMode": "locked", "rewardMode": "actual" }
}
```

Supported triggers: `job.completed`, `job.failed`, `job.ready`

### Supported `ContentBlock` types

**Mission-pilot game blocks:**

| Type | Description |
|---|---|
| `mission_hero` | Mission banner / title card |
| `mission_stats` | Duration, difficulty, AP cost, etc. |
| `mission_requirements` | Entity / item requirements list |
| `mission_synergy` | Team synergy display |
| `team_section` | Entity slot grid (editable or locked) |
| `reward_list` | Expected / actual rewards |
| `entity_roster` | Read-only entity summary |
| `mission_timer` | Countdown to completion |
| `outcome_banner` | Success / failure hero banner |
| `narrative_text` | Optional flavour text |

**Generic blocks:**

| Type | Fields | Description |
|---|---|---|
| `rich_text` | `content?` | Freeform text content |
| `image` | `assetKey?`, `caption?` | Full-width image |
| `divider` | — | Horizontal rule |
| `key_value_row` | `label`, `value` | Single label/value pair |

---

## ADA Oracle Rate — `/api/admin/crypto/rates`

All endpoints require `X-Admin-Key` header.

### `GET /api/admin/crypto/rates/ada/current`

Returns the current time-weighted average ADA/USD rate and sample statistics.

**Auth:** `X-Admin-Key`

**Response:**
```json
{
  "lovelacePerUsd": 2040816,
  "usdPerAda": 0.49,
  "sampleCount": 12,
  "twaWindowSeconds": 3600,
  "oldestSampleAt": "2026-05-29T09:00:00.000Z",
  "newestSampleAt": "2026-05-29T10:00:00.000Z",
  "usingFallback": false
}
```

`usingFallback: true` when no samples exist yet (server just started or oracle is down) — the fallback rate from `CryptoRateConfig.fallbackLovelacePerUsd` is used.

**Admin Records Editor:** `CryptoRateConfig` table is available in the admin panel under the **Payments** group. Fields: `oracleUrl`, `pollIntervalSeconds`, `twaWindowSeconds`, `fallbackLovelacePerUsd`, `enabled`.

### `GET /api/admin/crypto/rates/ada/samples`

Returns recent ADA rate samples from the oracle (read-only, for inspection).

**Auth:** `X-Admin-Key`

**Query params:**
- `limit` — number of samples to return (default `50`, max `200`)

**Response:** array ordered newest-first:
```json
[
  {
    "id": "17",
    "usdPrice": 0.232627,
    "lovelacePerUsd": "4298727",
    "usdPerAda": 0.232627,
    "fetchedAt": "2026-05-29T19:57:46.094Z"
  }
]
```

Samples older than 24 h are automatically pruned by the oracle poller.

---

## Crypto Wallet — `/api/admin/crypto`

All endpoints require `X-Admin-Key` header.

### `GET /api/admin/crypto/config`
Get the current hot wallet system configuration.

> **Note:** Per-token fields (policyId, assetName, price, withdrawal rules) are now stored on
> the `Currency` row (type: `CRYPTO`) and managed via the standard Currency admin CRUD.

**Response:**
```json
{
  "id": "default",
  "hotWalletAddress": "addr1...",
  "blockfrostProjectId": "mainnetXXXXXXXXXX",
  "depositScanPage": 0,
  "hasStoredSigningKey": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### `PUT /api/admin/crypto/config`
Update hot wallet system configuration.

Per-token fields (policyId, assetName, price, withdrawal rules) are now on the Currency row —
update them via `PUT /api/admin/definitions/currencies/:id` using the fields documented below.

**Body (all fields optional):**
```json
{
  "hotWalletAddress": "addr1...",
  "blockfrostProjectId": "mainnetXXXXXXXXXX",
  "hotWalletSkeyHex": "hex-encoded-extended-skey",
  "adaWithdrawalFee": 5000000,
  "adaMinWithdrawalAmount": 2000000
}
```
`adaWithdrawalFee` — platform fee (lovelace) added on top of the net ADA send amount. Defaults to 5,000,000 (5 ADA).
`adaMinWithdrawalAmount` — minimum net ADA (lovelace) the player must receive per withdrawal. Defaults to 2,000,000 (2 ADA).

---

### Currency crypto fields (CRYPTO type only)

When editing a `Currency` row with `type: CRYPTO` via the standard Currency admin CRUD,
the following extra fields are available:

| Field | Type | Description |
|---|---|---|
| `cntEcosystem` | `string?` | Blockchain ecosystem, e.g. `"CARDANO"` |
| `cntWalletType` | `string?` | Wallet standard, e.g. `"CIP30"` |
| `cntPolicyId` | `string?` | On-chain policy ID hex |
| `cntAssetName` | `string?` | On-chain asset name hex |
| `cntPriceAda` | `float?` | Admin-set ADA price per 1 token unit (used for ADA_VALUE / USD_VALUE minimum checks) |
| `cntMinWithdrawalType` | `"QUANTITY"\|"ADA_VALUE"\|"USD_VALUE"\|null` | How the minimum withdrawal is evaluated |
| `cntMinWithdrawalAmount` | `float?` | Minimum amount interpreted per `cntMinWithdrawalType` |
| `cntWithdrawalFee` | `bigint?` | Flat fee (in token units) deducted at withdrawal creation |
| `cntAutoApprovalThreshold` | `bigint?` | Withdrawals ≤ this amount are auto-approved and processed immediately; `0` disables |

---

### `GET /api/admin/crypto/balance`
Fetch the hot wallet's current on-chain ADA and CNT balances from Blockfrost, minus outstanding liabilities (APPROVED/PROCESSING withdrawals).

**Response:**
```json
{
  "ada": { "gross": "12345678", "liability": "2000000", "net": "10345678" },
  "currencies": [
    {
      "currencyId": "crypto_derp",
      "gross": "1000000",
      "liability": "50000",
      "net": "950000",
      "approvedWithdrawals": "50000"
    }
  ]
}
```
All lovelace/token values are serialised as strings. `gross` = on-chain balance; `liability` = APPROVED + PROCESSING withdrawals; `net` = gross − liability.
Returns `null` if `BLOCKFROST_API_KEY` is not set or wallet address is unconfigured.

---

### `GET /api/admin/crypto/withdrawals`
List withdrawal requests.

**Query:** `status` (optional: `PENDING` | `APPROVED` | `PROCESSING` | `FAILED` | `REJECTED` | `SENT`), `limit` (default 50)

**Response:** `CryptoWithdrawal[]` with `user` nested object. Fields include `currencyId`, `adaServiceFee` (lovelace held as service fee for ADA withdrawals), `adaNetworkFee` (exact network fee recorded after submission).

---

### `PUT /api/admin/crypto/withdrawals/:id`
Update a withdrawal request (set status, attach tx hash, add admin note).

**Body:**
```json
{
  "status": "APPROVED",
  "txHash": "cardano-tx-hash-here",
  "adminNote": "Processed manually"
}
```

**Allowed state transitions:**

| From | To | Effect |
|---|---|---|
| `PENDING` | `APPROVED` or `REJECTED` | REJECTED refunds full `amount` to player balance |
| `APPROVED` | `REJECTED` | Refunds full `amount` |
| `PROCESSING` | `FAILED` | Force-fail only — no auto-refund (admin verifies blockchain) |
| `FAILED` | `APPROVED` | Re-debit player balance; resets `adaNetworkFee` to 0 for re-measurement |
| `REJECTED` | `APPROVED` | Re-debit player balance |
| `SENT` | — | Status immutable; `txHash`/`adminNote` edits only |

> **FAILED → REJECTED is blocked.** All FAILED withdrawals are pre-refunded automatically — either by `sendWithdrawalOnChain` (when the TX build/submit fails) or by the stale-PROCESSING reaper (moves PROCESSING → FAILED + issues refund). Allowing FAILED → REJECTED would cause a double-credit. To re-attempt a failed withdrawal, use FAILED → APPROVED (re-debits player, retries the on-chain send).

**Note on FAILED → APPROVED re-queue:** When a withdrawal is re-queued, the player's balance is re-debited immediately. If the player no longer has sufficient balance, the endpoint returns `400 Bad Request`.

---

### `GET /api/admin/crypto/unresolved-deposits`
List on-chain deposits that arrived at the hot wallet but could not be matched to any player (unlinked sender addresses).

**Query:** `includeResolved` (boolean, default `false`), `limit` (default 50)

**Response:**
```json
[
  {
    "id": "uuid",
    "txHash": "abc123...",
    "blockTime": 1700000000,
    "senderAddresses": ["addr1..."],
    "amounts": { "lovelace": "2000000", "crypto_derp": "5000" },
    "reason": "No linked Cardano wallet found for any input address",
    "resolvedAt": null,
    "resolvedByUserId": null,
    "resolvedBy": null,
    "creditedUserId": null,
    "creditedUser": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

Resolved example:
```json
[
  {
    "id": "uuid",
    "txHash": "abc123...",
    "blockTime": 1700000000,
    "senderAddresses": ["addr1..."],
    "amounts": { "lovelace": "2000000" },
    "reason": "No linked Cardano wallet found for any input address",
    "resolvedAt": "2026-06-01T12:00:00.000Z",
    "resolvedByUserId": "admin-uuid",
    "resolvedBy": { "id": "admin-uuid", "username": "adminname" },
    "creditedUserId": "player-uuid",
    "creditedUser": { "id": "player-uuid", "username": "playerName", "email": "player@example.com" },
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### `PUT /api/admin/crypto/unresolved-deposits/:id/resolve`
Resolve an unresolved deposit. Optionally credit a specific player.

**Body:**
```json
{ "creditUserId": "player-uuid-or-omit-to-just-mark-resolved" }
```

If `creditUserId` is provided, all token amounts (lovelace → `ada`, other keys → currencyId) are credited to that player and the deposit is marked resolved. If omitted, the deposit is marked resolved without credit (use for spam/invalid txs).

---

## Crypto Wallet (Player) — `/api/crypto`

All endpoints require `Authorization: Bearer <jwt>`.

### `GET /api/crypto/deposit-info`
Get the hot wallet deposit address, all configured CNT currencies, and ADA withdrawal config.

**Response:**
```json
{
  "hotWalletAddress": "addr1...",
  "currencyId": "crypto_derp",
  "cntAssetId": "d9d59e71...",
  "note": "Send DERP COIN to the deposit address...",
  "minWithdrawalType": "QUANTITY",
  "minWithdrawalAmount": 1,
  "withdrawalFee": "0",
  "autoApprovalThreshold": "0",
  "cntCurrencies": [
    { "id": "crypto_derp", "label": "DERP COIN", "policyId": "<hex>", "assetName": "<hex>", "ecosystem": "CARDANO", "walletType": "CIP30" }
  ],
  "ada": {
    "enabled": true,
    "minWithdrawalLovelace": "2000000",
    "withdrawalFeeLovelace": "500000"
  }
}
```
`cntCurrencies` lists all active CNT currencies. `ada.enabled` is `true` when a hot wallet address is configured.

---

### `POST /api/crypto/withdraw`
Request an on-chain withdrawal. Debits balance immediately; creates a withdrawal record. If auto-approved (CNT amount ≤ `autoApprovalThreshold`), the on-chain send is triggered in the background within seconds.

For **ADA withdrawals**, `amount` (in lovelace) is the **net** lovelace the player will receive. The platform service fee (`adaWithdrawalFee` from config) is added on top and debited together with the net, making the total balance debit `amount + adaWithdrawalFee`. The exact Cardano network fee is measured when the TX is built and debited as an additional step before broadcast; it is returned in `adaNetworkFee` on the withdrawal record.

For **CNT withdrawals**, an estimated ADA cost (`MIN_ADA_LOVELACE + ESTIMATED_FEE`) is debited from the player's ADA balance at request time (stored in `adaServiceFee`). At submission time, the estimate is reconciled with the exact on-chain cost and the player's ADA balance is adjusted (refund or additional debit).

On FAILED or REJECTED, both the primary currency and the ADA fees are fully refunded.

**Body:**
```json
{
  "amount": 500,
  "destinationAddress": "addr1...",
  "currencyId": "crypto_derp"
}
```
`destinationAddress` is optional — defaults to the user's primary linked Cardano wallet.
`currencyId` is optional — defaults to the primary CNT currency. Pass `"ada"` for a native ADA withdrawal.

**Response:** `CryptoWithdrawal` object (includes `id` field; frontend subscribes to `withdrawal_sent` / `withdrawal_failed` notifications matching `sourceId === id` for live status updates)

---

### `GET /api/crypto/withdrawals`
List the authenticated player's withdrawal history.

**Query:** `limit` (default 20)

---

### `GET /api/crypto/deposits`
List the authenticated player's on-chain deposit history (ledger entries with sourceType `CRYPTO_DEPOSIT`).

**Query:** `limit` (default 20)

---

### `POST /api/crypto/decode-address`
Decode a CIP-30 hex-encoded Cardano address (as returned by `wallet.getChangeAddress()`) into a bech32 string.

**Body:** `{ "hexAddress": "<cbor-hex>" }`

**Response:** `{ "bech32": "addr1..." }`

Used by the withdrawal tab to silently autofill the destination address from the injected browser wallet.

---

### `POST /api/crypto/build-deposit-tx`
Build an unsigned Cardano CNT deposit transaction using UTXOs from the player's CIP-30 wallet.

**Body:**
```json
{ "amount": 100, "utxosCborHex": ["<cbor-hex>", ...], "policyId": "<hex>", "assetName": "<hex>" }
```
- `amount` — CNT units to deposit (integer, same unit as DERP)
- `utxosCborHex` — array of UTXO CBOR hex strings from `wallet.getUtxos()`
- `policyId` / `assetName` — optional token override; when omitted the configured default CNT is used

**Response:** `{ "unsignedTxCborHex": "<hex>" }` — pass to `wallet.signTx()`

---

### `POST /api/crypto/submit-deposit-tx`
Submit a player-signed deposit transaction to Blockfrost.  Credit is applied only after the existing deposit poller detects on-chain confirmation.

**Body:** `{ "signedTxCborHex": "<hex>" }`

**Response:** `{ "txHash": "<hex>" }`

---

### `POST /api/crypto/build-purchase-tx`
Build an unsigned Cardano CNT payment transaction for an existing PENDING purchase.  Token identity and destination address come from the purchase record's `rateSnapshot.CNT` field.

**Body:**
```json
{ "purchaseId": "<uuid>", "utxosCborHex": ["<cbor-hex>", ...] }
```

**Response:** `{ "unsignedTxCborHex": "<hex>" }` — pass to `wallet.signTx(true)`

Errors if the purchase is not PENDING, does not belong to the authenticated user, or lacks CNT token metadata.

---

### `POST /api/crypto/submit-purchase-tx`
Submit a player-signed purchase transaction to Blockfrost.  Gems are only credited after `CryptoPollerService` detects the confirmed tx on-chain — this endpoint does NOT credit directly.

**Body:** `{ "purchaseId": "<uuid>", "signedTxCborHex": "<hex>" }`

**Response:** `{ "txHash": "<hex>" }`

---

## Currencies — Admin Smart Table

`Currency` rows are managed through the generic admin smart-editor at `GET /api/admin/records/currency`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `soft_arcanium`) |
| `name` | string | ✓ | Display name |
| `symbol` | string | | Short symbol or emoji shown next to the balance |
| `iconKey` | string | | Asset key for the currency icon |
| `type` | `CurrencyType` | ✓ | `SOFT` \| `HARD` \| `PREMIUM` \| `SEASONAL` \| `EVENT` \| `GUILD` \| `CRYPTO` |
| `seasonId` | string | | Season this currency belongs to (nullable) |
| `isTradeable` | boolean | | Default `false` |
| `isSpendable` | boolean | | Default `true`. When `false`, `spend` calls are rejected. |
| `decimals` | integer | | Decimal precision. Default `0`. |
| `cap` | bigint | | Maximum supply cap (nullable = uncapped) |
| `enabled` | boolean | | Default `true`. When `false`, the currency is fully disabled (balance reads still work, but the currency is excluded from all active game systems). |
| `showInTopBar` | boolean | | Default `false`. When `true`, this currency is displayed in the player top bar. Toggle off to hide a currency from the bar without disabling it entirely. |
| `sortOrder` | integer | | Default `0`. Lower numbers appear earlier in the top bar (left-to-right). Ties are broken alphabetically by `id`. |

### Top-bar display rules

- The top bar shows only currencies where `showInTopBar = true`.
- Within the bar, currencies are sorted by `sortOrder` ascending, then `id` alphabetically.
- The bar is capped at **6** currencies regardless of how many have `showInTopBar = true`.
- Changes take effect on the player's next page load (currency definitions are fetched at bootstrap).


---

## Content Draft & Review

Non-super-admin writes to `POST/PUT/DELETE /admin/:table` are intercepted and stored as `ContentDraft` records awaiting approval. Super-admins write directly (audit-logged with `bypassReview: true`).

### Draft response shape (non-super-admin writes)

```json
{
  "mode": "draft",
  "draftId": "uuid",
  "tableName": "entityDefinition",
  "recordId": "my_entity",
  "operation": "create | update | delete",
  "status": "pending",
  "authorUsername": "alice"
}
```

### `GET /admin/drafts`

List content drafts. Requires `read` or `approve` permission.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `pending\|approved\|rejected` | Filter by status (omit for all) |
| `tableName` | string | Filter by table |
| `recordId` | string | Filter by record ID |
| `authorId` | string | Filter by author admin ID |
| `limit` | integer | Max results (default 100) |
| `offset` | integer | Pagination offset (default 0) |

### `GET /admin/drafts/:id`

Get a single draft. Includes `liveRecord` field with current DB state for diffing.

### `POST /admin/drafts/:id/approve`

Approve a draft — applies the change to the live database. Requires `approve` permission.
Content-scope guards apply: reviewers may only approve drafts for tables within their assigned content scopes.

### `POST /admin/drafts/:id/reject`

Reject a draft. Requires `approve` permission.

**Body:**

```json
{ "reviewComment": "optional reason" }
```

---

## Game Health Metrics — `/api/admin/metrics`

All endpoints require `metrics_read` permission (or Super Admin role).
Current-value metrics are cached in-memory for 5 minutes.

---

### `GET /api/admin/metrics/game-health`

Returns the current snapshot of all 15 game health metrics, computed live from the database.

**Auth:** Admin (`metrics_read` permission or `super_admin`)

**Response:**
```json
{
  "computedAt": "2026-06-02T15:00:00.000Z",
  "metrics": [
    {
      "name": "dau",
      "value": 142,
      "unit": "players",
      "label": "Daily Active Users",
      "description": "Players active in the last 24 hours",
      "status": "green",
      "benchmark": "≥50 green, ≥10 yellow"
    }
  ]
}
```

**Metric names and sources:**

| Name | Label | Source | Unit |
|------|-------|--------|------|
| `dau` | Daily Active Users | `users.updatedAt` within 24h | players |
| `wau` | Weekly Active Users | `users.updatedAt` within 7d | players |
| `mau` | Monthly Active Users | `users.updatedAt` within 30d | players |
| `dau_mau_ratio` | DAU/MAU Ratio | Derived: DAU / MAU × 100 | % |
| `d1_retention` | D1 Retention | Cohort registered ~1d ago, returned within 1d | % |
| `d7_retention` | D7 Retention | Cohort registered ~7d ago, returned within 1d | % |
| `d30_retention` | D30 Retention | Cohort registered ~30d ago, returned within 1d | % |
| `sessions_per_day` | Sessions Per Day | Completed jobs in 24h ÷ DAU | jobs/player |
| `mission_participation_rate` | Mission Participation | Players with ≥1 mission in 24h ÷ DAU | % |
| `total_players` | Total Registered | `users` count | accounts |
| `completed_missions_24h` | Missions Completed (24h) | Mission jobs completed in 24h | missions |
| `arcanium_generated` | Arcanium Generated (7d) | `currency_ledger` positive deltas for `soft_arcanium` | arc |
| `arcanium_spent` | Arcanium Spent (7d) | `currency_ledger` negative deltas for `soft_arcanium` | arc |
| `essence_earned` | Essence Earned (7d) | `currency_ledger` positive deltas for `hard_essence` | ess |
| `essence_spent` | Essence Spent (7d) | `currency_ledger` negative deltas for `hard_essence` | ess |

**Status thresholds:**

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| DAU | ≥50 | ≥10 | <10 |
| WAU | ≥200 | ≥50 | <50 |
| MAU | ≥500 | ≥100 | <100 |
| DAU/MAU ratio | ≥20% | ≥10% | <10% |
| D1 Retention | ≥40% | ≥20% | <20% |
| D7 Retention | ≥20% | ≥10% | <10% |
| D30 Retention | ≥10% | ≥5% | <5% |
| Sessions/day | ≥5 | ≥2 | <2 |
| Mission participation | ≥50% | ≥20% | <20% |
| Missions completed 24h | ≥100 | ≥20 | <20 |
| Economy metrics | `neutral` — informational only | — | — |

---

### `GET /api/admin/metrics/history`

Returns time-series history for one or more metrics from the `MetricSnapshot` table (up to 90 days).

**Auth:** Admin (`metrics_read` permission or `super_admin`)

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `metrics` | required | Comma-separated metric names (e.g. `dau,wau,mau`) |
| `days` | `30` | Number of days to return (max 90) |

**Response:**
```json
{
  "dau": [
    { "date": "2026-06-01", "value": 142 },
    { "date": "2026-06-02", "value": 158 }
  ],
  "wau": [
    { "date": "2026-06-01", "value": 620 }
  ]
}
```

Time-series metrics available: `dau`, `wau`, `mau`, `d1_retention`, `d7_retention`, `d30_retention`, `arcanium_generated`, `arcanium_spent`, `essence_earned`, `essence_spent`.

---

### `POST /api/admin/metrics/record-snapshot`

Records today's metric snapshot into the `MetricSnapshot` table (upsert by metric name + UTC midnight date). Use this to seed historical data on demand or trigger from a daily cron job.

**Auth:** Admin (`metrics_read` permission or `super_admin`)

**Response:**
```json
{ "success": true }
```

---

### MetricSnapshot Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (UUID) | Primary key |
| `metricName` | String | Metric identifier (e.g. `dau`, `d7_retention`) |
| `date` | DateTime | UTC midnight of the snapshot day |
| `value` | Float | Metric value at time of recording |
| `metadata` | Json? | Reserved for future context |
| `createdAt` | DateTime | Row creation timestamp |
| `updatedAt` | DateTime | Row last-updated timestamp |

Unique constraint: `(metricName, date)` — upserts are safe.

---

### `metrics_read` Permission Flag

A new `metrics_read` boolean field added to `PermissionFlags` / `AdminRole.permissionFlags`. When true:
- The admin sees a **Metrics** section in the sidebar.
- The admin has access to `GET /admin/metrics/game-health` and `GET /admin/metrics/history`.
- Super Admins (`super_admin` role or bootstrap key) always have this access regardless of the flag.

Super Admins default-land on the Metrics section after login. Other admins with `metrics_read` also land on Metrics.

---

## Item Dusting — Commands

Item dusting lets players break down items into resources. Items must have `dustingData` configured on their `ItemDefinition`.

### `StartDusting`

**Auth:** Player JWT

**Payload:**
```json
{
  "type": "StartDusting",
  "payload": {
    "itemInstanceId": "<uuid>",
    "quantity": 1
  }
}
```

- Consumes `quantity` of the item from the player's inventory.
- If `dustingData.instant = true`, the job is created, resolved, and collected in the same transaction. The command response `meta.instantRewards` contains the granted rewards.
- If `dustingData.instant = false`, a `DustingJob` is created. The player must call `CollectDusting` once the job is ready.
- `timerScaling = "per_unit"` multiplies `dustingData.timer.duration` by `quantity`; `"flat"` keeps a fixed duration regardless of quantity.
- To skip a dusting job, use the generic `POST /jobs/:id/skip` endpoint. Skip eligibility and cost are configured via `dustingData.timer.skipable` and `dustingData.timer.skip_cost`.

**Response patches:** `job`, `item` balances, `currencyBalance`.

---

### `CollectDusting`

**Auth:** Player JWT

**Payload:**
```json
{
  "type": "CollectDusting",
  "payload": {
    "jobId": "<uuid>"
  }
}
```

- Resolves the `DustingJob` and grants rewards to the player.
- Returns `BadRequest` if the job is not yet ready (tick check).

**Response patches:** `job`, `player`, `item` balances, `currencyBalance`, optional `notification`.

---

### `dustingData` field on `ItemDefinition`

| Field | Type | Description |
|-------|------|-------------|
| `instant` | boolean | If true, the job resolves immediately with no timer |
| `timer` | Timer | Standard Timer object — `duration` (seconds), `boostable`, `skipable`, `skip_cost` (array of `{type,id,amount}`), `skip_type`. Ignored when instant=true. |
| `timerScaling` | `"flat"` \| `"per_unit"` | `flat`: fixed duration regardless of quantity. `per_unit`: `timer.duration * quantity`. |
| `difficulty` | number | Pass/fail threshold (0 = always pass, higher = harder) |
| `tiers` | OutcomeTiers | Reward tiers keyed by quality: `failure`, `common`, `uncommon`, `scare`, `rare`, `epic`, `mythic`, `legendary` |

Each tier block: `{ rewards: OutcomeEntry[], clRequirement?: number }`. Rewards follow the same outcome-entry schema as mission tiers.

Skip cost is configured in `dustingData.timer.skip_cost` (same format as crafting/mission timers). The generic `POST /jobs/:id/skip` endpoint handles all skip logic.

---

## World Instance Viewer — `GET /api/admin/instances/entities`

Browse all entity instances across all players with filtering and pagination.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search on `display.name`, `id`, or owner username |
| `page` | number | Page number (default: 1) |
| `limit` | number | Page size, max 100 (default: 50) |
| `userId` | string | Filter to a specific owner user ID |
| `definitionId` | string | Filter to a specific entity definition ID |
| `status` | string | Filter by status from `state.status` (idle, working, mission, injured, …) |
| `nftCollectionDefId` | string | Filter by NFT collection definition ID |

**Response:**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "display.name",
      "definitionId": "derp_bird",
      "definitionName": "Derp Bird",
      "level": 5,
      "status": "idle",
      "ownerUserId": "uuid | null",
      "ownerUsername": "string | null",
      "nftAssetId": "string | null",
      "nftCollectionDefId": "string | null",
      "stats": { "ATK": 10, "DEF": 8, … },
      "rarity": "common | null",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1234,
  "page": 1,
  "limit": 50
}
```

---

## World Instance Viewer — `GET /api/admin/instances/locations`

Browse all location instances across all players with filtering and pagination.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search on `state.nftName`, `id`, or owner username |
| `page` | number | Page number (default: 1) |
| `limit` | number | Page size, max 100 (default: 50) |
| `userId` | string | Filter to a specific owner user ID |
| `definitionId` | string | Filter to a specific location definition ID |
| `enabled` | boolean | Filter by enabled state (`true` / `false`) |
| `nftCollectionDefId` | string | Filter by NFT collection ID (joined through nft_assets) |

**Response:**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "state.nftName or definitionId",
      "definitionId": "derp_outpost",
      "definitionName": "outpost_fungible",
      "level": 3,
      "enabled": true,
      "ownerUserId": "uuid | null",
      "ownerUsername": "string | null",
      "nftAssetId": "string | null",
      "nftCollectionDefId": "string | null",
      "storage": { "stored": { … }, "capacity": { … } }
    }
  ],
  "total": 567,
  "page": 1,
  "limit": 50
}
```

---

## Seed Management

These endpoints let a **super_admin** manage the unified seed dataset and trigger re-seeding on demand.

Seed data is stored canonically in Object Storage at `seed/seed-data.json`. The committed file at `prisma/seed-data.json` serves as a cold-start fallback; run `pnpm export-seed` against a populated environment to regenerate it.

All successful admin writes (create / update / delete on any definition table) automatically queue a background sync of that table to Object Storage. Sync failures are logged as warnings and never fail the original request.

---

### `GET /api/admin/seed/tables`

Returns the ordered list of all 30 definition table keys that the unified seed runner covers.

**Auth:** `super_admin` only

**Response:**
```json
{
  "tables": [
    "currency", "regionDefinition", "displayDef", "entityDefinition",
    "locationDefinition", "buildingDef", "roomDef", "missionCategoryDef",
    "missionDef", "recipeDef", "itemDefinition", "giftDef", "shopItemDef",
    "eventDefinition", "lootboxDef", "bundleDef", "checkInDef", "questDef",
    "modalDef", "defaultModalDef", "homeBannerDef", "systemIconDef",
    "synergyRule", "powerDef", "soundDef", "tagDef", "visualEffectDef",
    "effectDef", "nftCollectionDef", "gameDefinition"
  ]
}
```

---

### `POST /api/admin/seed/run`

Downloads seed data from Object Storage and re-seeds the database. Optionally filter to specific tables.

**Auth:** `super_admin` only

**Body:**
```json
{
  "tables": ["currency", "effectDef"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `tables` | optional | Array of table keys (Prisma model names). Omit to seed all 30 tables. |

**Response:**
```json
{
  "tables": ["currency", "effectDef"],
  "results": {
    "currency": "ok (3)",
    "effectDef": "ok (28)"
  }
}
```

Each table result is `"ok (N)"` on success, `"skipped (no data)"` if the table has no rows in storage, or `"error: <message>"` if the upsert fails. The action is always recorded in the admin audit log.

---

### `POST /api/admin/seed/snapshot`

Exports the current DB state for all 30 tables to Object Storage and saves a versioned snapshot at `seed/snapshots/seed-data-vN.json`.

**Auth:** `super_admin` only

**Body:** none

**Response:**
```json
{
  "version": 5,
  "storageKey": "seed/snapshots/seed-data-v5.json"
}
```

The snapshot also overwrites the live `seed/seed-data.json` key, making it the new canonical source for subsequent `POST /api/admin/seed/run` calls.

---

## Effect Definitions — `EffectDef` Fields

`EffectDef` rows define the mechanical template for an effect. They are authored in the admin smart table (`effectDef`) and referenced by ID everywhere effects are applied — global powers, consumable items, equipment passive effects, achievements, and more.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique snake_case identifier (e.g. `xp_boost_flat`). |
| `name` | string | ✓ | Human-readable display name. |
| `description` | string | | Admin notes describing the effect's purpose. |
| `category` | `EffectCategory` | ✓ | What game system this effect modifies. See enum below. |
| `valueMode` | `EffectValueMode` | ✓ | How the `value` number is applied to the base. See enum below. |
| `durationModel` | `EffectDurationModel` | ✓ | How the effect's lifetime is tracked. See enum below. |
| `stackingRule` | `EffectStackingRule` | ✓ | What happens when the same effect is applied a second time. See enum below. |
| `targetType` | `EffectTargetType` | ✓ | Which game object the effect acts upon. See enum below. |
| `value` | number | | Primary scalar magnitude. Meaning depends on `valueMode` (e.g. `50` = +50% for `percent_add`). Required for most categories; omit for `stat_boost` (use `stats`) and `trait_grant` (use `trait`). |
| `stats` | `EffectStatMap` | | Per-stat distribution. Used by `stat_boost` category and for `RND` weighting in `trait_grant`. See [EffectStatMap](#effectstatmap--stat-distribution-object). |
| `trait` | string | | Trait archetype name to grant. Required for `trait_grant` category; ignored otherwise. |
| `durationSec` | number | | Duration in real seconds. Required when `durationModel` is `timed`. |
| `durationTicks` | number | | Duration in game ticks. Required when `durationModel` is `tick_based`. |
| `maxStacks` | number | | Maximum simultaneous stacks. Required for `stack_additive`, `stack_multiplicative`, `stack_capped` stacking rules. Default `1`. |
| `maxUses` | number | | Maximum trigger events before the effect expires. Required when `durationModel` is `count_based`. |
| `cap` | number | | Upper bound on the accumulated value when `stackingRule` is `stack_capped`. |
| `resourceId` | string | | Scopes the effect to a specific resource (currency or item ID). Used by `production_rate`, `currency_multiplier`, `storage_capacity`, and similar resource-targeted categories. |
| `sessionType` | string | | Session discriminator for `session` durationModel. The effect expires when the named session ends. |
| `meta` | Json | | Arbitrary extra data for UI or system hints. Not evaluated by the effect resolver. Default `{}`. |
| `iconKey` | string | | Asset key for the effect's icon (used in admin UI listings). |
| `enabled` | boolean | | When `false`, this def is excluded from all active game systems. Default `true`. |

---

## `EffectCategory` Enum

| Value | Description |
|-------|-------------|
| `stat_boost` | Modifies entity combat stats (ATK, DEF, SPD, FOC, LCK, VIT). Use `stats` field instead of `value`. |
| `mission_power` | Adds to a team's total mission power score. |
| `success_chance` | Adjusts the mission success-chance roll. |
| `reward_multiplier` | Multiplies the quantity of mission/crafting rewards. |
| `xp_multiplier` | Multiplies entity XP earned from any source. |
| `keeper_xp_multiplier` | Multiplies keeper (player account) XP earned. |
| `production_rate` | Modifies the production rate of a specific resource. `resourceId` required. |
| `storage_capacity` | Modifies the storage cap for a specific resource. `resourceId` required. |
| `timer_speed` | Global timer speed boost — applies to all timed activities simultaneously. |
| `mission_timer_speed` | Timer speed boost for missions only. |
| `crafting_timer_speed` | Timer speed boost for crafting only. |
| `building_build_timer_speed` | Timer speed for new building construction. |
| `building_upgrade_timer_speed` | Timer speed for building upgrades. |
| `injury_recovery_speed` | Timer speed for entity injury recovery. |
| `dusting_timer_speed` | Timer speed for item dusting jobs. |
| `mission_timer_speed_boost` | Dedicated mission timer speed boost (stacks separately from `mission_timer_speed`). |
| `crafting_timer_speed_boost` | Dedicated crafting timer speed boost. |
| `building_build_timer_speed_boost` | Dedicated building build speed boost. |
| `building_upgrade_timer_speed_boost` | Dedicated building upgrade speed boost. |
| `dusting_timer_speed_boost` | Dedicated dusting speed boost. |
| `mission_duration_reduction` | Reduces mission duration by a flat or percentage amount. |
| `crafting_duration_reduction` | Reduces crafting duration. |
| `building_build_duration_reduction` | Reduces new building construction time. |
| `building_upgrade_duration_reduction` | Reduces upgrade construction time. |
| `dusting_duration_reduction` | Reduces dusting job time. |
| `injury_recovery_reduction` | Reduces the time or cost of injury recovery. |
| `trait_grant` | Grants a trait to the target entity. `trait` field required. `stats` field used for RND weighting if desired. |
| `currency_multiplier` | Multiplies currency earned from a specific source. `resourceId` = currencyId. |
| `cost_discount` | Reduces the cost of a specific action. |
| `slot_unlock` | Unlocks additional slots (e.g. equipment slots) on the target. `value` = count to unlock. |
| `protection` | Provides a protection shield reducing damage or loss. |
| `reveal` | Reveals hidden information or entities. |
| `threat_reduction` | Reduces threat level at locations. |
| `craft_luck` | Adds to the entity's crafting luck (CL) for quality tier rolls. |
| `worker_efficiency` | Multiplies the output of worker assignments at locations. |
| `cooldown_reduction` | Reduces action cooldowns. |
| `level_up_bonus` | Awards bonus stats on level-up. |

---

## `EffectValueMode` Enum

Determines how the `value` number is applied to a baseline.

| Value | Applied as | Description |
|-------|-----------|-------------|
| `flat_add` | `base + value` | Adds `value` directly to the base. Use for additive bonuses (e.g. `+10 ATK`). |
| `percent_add` | `base × (1 + value/100)` | Adds `value` percent. `value = 50` → +50%. Negative values reduce the base. |
| `multiplier` | `base × value` | Multiplies the base by `value`. `value = 1.5` → +50%; `value = 2.0` → double. |
| `flat_set` | `value` (replaces base) | Replaces the base outright, ignoring any prior value. |
| `bps` | `base × (1 + value/10000)` | Basis points — `value = 100` means +1%. Use for fine-grained financial adjustments. |
| `flat_grant` | grant `value` units | Grants `value` units of something (trait tokens, currency, etc.) rather than modifying a stat. |
| `random_range` | `random(0, value)` | `value` is the upper bound of a uniform random range resolved at activation time. |

---

## `EffectDurationModel` Enum

| Value | Required extra fields | Description |
|-------|----------------------|-------------|
| `instant` | — | Fires once and immediately expires. No persistent `ActiveEffect` row is created. Used for one-time grants. |
| `timed` | `durationSec` | Expires after `durationSec` real seconds. Active until its `expiresAt` timestamp passes. |
| `tick_based` | `durationTicks` | Expires after `durationTicks` game ticks. Active until `expiresAtTick` is reached. |
| `count_based` | `maxUses` | Expires after being triggered `maxUses` times. `remainingUses` decrements on each qualifying event. |
| `session` | `sessionType` | Tied to a named session. Expires when the session identified by `sessionType + sessionId` ends. |
| `permanent` | — | Never expires. No `expiresAt` or `expiresAtTick`. Used for achievement rewards and one-time unlocks. |
| `until_removed` | — | Persists until explicitly removed via admin tool or a game event (e.g. equipment unequip, buff dispel). |

---

## `EffectStackingRule` Enum

| Value | Description |
|-------|-------------|
| `replace` | The new application replaces any existing active effect with the same `effectDefId`. Only one copy can be active at a time. |
| `refresh` | The new application resets the timer of the existing effect without changing its value. The effect's `expiresAt` is recalculated from now. |
| `stack_additive` | Each application adds a new stack up to `maxStacks`. Effective value accumulates: `value × currentStacks`. |
| `stack_multiplicative` | Each application adds a stack up to `maxStacks`. Effective value compounds multiplicatively across stacks. |
| `stack_capped` | Stacks accumulate but the total effective value is capped at `cap`. Use when you want stacking behaviour with an upper ceiling. |
| `no_stack` | Only one copy may be active. A second application attempt throws a `400 Bad Request` error (`"Effect … is already active and cannot stack"`). |

---

## `EffectTargetType` Enum

| Value | Description |
|-------|-------------|
| `entity` | The effect applies to a single entity instance. |
| `player` | The effect applies to the player account (keeper-level modifiers, currency multipliers, etc.). |
| `location` | The effect applies to a location instance (production rate, storage capacity, etc.). |
| `team` | The effect applies to a mission team as a whole. |
| `job` | The effect applies to a specific active job. |
| `global` | The effect applies globally — to all targets of the underlying scope at once. Used by `GlobalActivePower`. |

---

## `EffectStatMap` — Stat Distribution Object

Used by `stat_boost` effects on `EffectDef.stats` and on `PassiveEffectSpec.stats`. Each key specifies the value contributed to that stat when the effect is applied.

| Key | Type | Description |
|-----|------|-------------|
| `ATK` | number | Attack contribution |
| `DEF` | number | Defence contribution |
| `SPD` | number | Speed contribution |
| `FOC` | number | Focus contribution |
| `LCK` | number | Luck contribution |
| `VIT` | number | Vitality contribution |
| `RND` | number \| number[] | **Special — resolution directive.** Each entry independently picks a random visible stat (ATK/DEF/SPD/FOC/LCK/VIT) at award time and applies its full value to that stat. The same stat may be chosen more than once. Use a plain number for a single random draw; use an array for multiple independent draws. `RND` is never stored on an entity or shown in UI — it resolves to a concrete stat at the moment of application. |

**Example — +10 ATK, +5 DEF, one random stat draw of +3:**

```json
{ "ATK": 10, "DEF": 5, "RND": 3 }
```

---

## `EffectDefOverrides` — Safe Override Subset

When a consumable or global power applies an `EffectDef`, it may supply overrides that shadow the def's values at activation time. Only the fields below can be overridden — structural identity fields (`category`, `valueMode`, `durationModel`, `stackingRule`, `targetType`) are intentionally excluded to preserve mechanical intent.

| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Override the def's `value`. |
| `stats` | `EffectStatMap` | Override the def's `stats` distribution. |
| `durationSec` | number | Override `durationSec` (meaningful for `timed` durationModel only). |
| `durationTicks` | number | Override `durationTicks` (meaningful for `tick_based` durationModel only). |
| `maxStacks` | number | Override the `maxStacks` cap. |
| `maxUses` | number | Override `maxUses` (meaningful for `count_based` durationModel only). |
| `cap` | number | Override the stacking value cap. |
| `resourceId` | string | Override the resource scope. |

**Where overrides appear:**
- `ConsumableEffectSpec.effectOverrides` — on `ItemDefinition.consumableData.effects[]` entries.
- `GlobalActivePower.effectOverrides` — in `POST /admin/global-powers` body.

---

## Power Definitions — `PowerDef` Fields

`PowerDef` rows define reusable power templates. When a global power is triggered via the UI or an event handler, it may reference a `PowerDef` by `powerDefId` instead of supplying all parameters inline. Fields from the def are used as defaults; the trigger payload may override individual fields.

Managed via `GET/POST/PUT/DELETE /api/admin/power-defs` and the generic admin smart table (`powerDef`).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique snake_case identifier (e.g. `xp_boost_30min`). |
| `name` | string | ✓ | Human-readable display name shown in the admin UI. |
| `description` | string | | Optional admin notes. |
| `powerType` | `PowerType` | ✓ | Mechanical category of the power. See values below. |
| `effectDefId` | string \| null | | Reference to an `EffectDef` row. Required when `powerType = "effect_backed"`; `null` for all other types. |
| `defaultValue` | number | | Default effect magnitude. Schema default `0`. |
| `defaultValueMode` | string | | Default `EffectValueMode`. Schema default `"percent_add"`. |
| `defaultDurationMinutes` | number | | Default activation duration in minutes. Schema default `30`. |
| `defaultDailyLimit` | number | | Default maximum times per day this power can fire. Schema default `1`. |
| `defaultScope` | string | | Default target scope (e.g. `"global"`, `"self"`). Schema default `"global"`. |
| `selection` | Json | | Default `EffectSelection` object (`{ scope, agg, filter? }`) applied when the trigger does not supply its own. |
| `enabled` | boolean | | When `false`, the power cannot be triggered. Default `true`. |

### `powerType` values

| Value | `effectDefId` | Description |
|-------|--------------|-------------|
| `tick_speed_boost` | `null` (required) | Speeds up the global game tick rate via the `BoostEvent` pipeline — no `EffectDef` used. |
| `effect_backed` | required | Delegates fully to an `EffectDef` for all mechanical resolution. |
| `keeper_xp_boost` | `null` | Multiplies keeper (player account) XP earned. Shorthand type — no `EffectDef` required. |
| `entity_xp_boost` | `null` | Multiplies entity XP earned. Shorthand type. |
| `mission_power_boost` | `null` | Adds to team mission power. Shorthand type. |
| `mission_duration_reduction` | `null` | Reduces mission duration. Shorthand type. |
| `crafting_duration_reduction` | `null` | Reduces crafting duration. Shorthand type. |
| `building_build_duration_reduction` | `null` | Reduces new-build construction time. Shorthand type. |
| `building_upgrade_duration_reduction` | `null` | Reduces upgrade construction time. Shorthand type. |
| `injury_recovery_boost` | `null` | Speeds up entity injury recovery. Shorthand type. |

> **Tip:** Use `effect_backed` + an `EffectDef` when you need fine-grained control over stacking, targeting, or duration. Use shorthand types for simple one-off boosts where the system defaults are sufficient.

---

## EntityDefinition — `progression` Schema

The `progression` JSON blob on an `EntityDefinition` controls how entities gain XP and stats at each level-up. Omitting the entire field (or any sub-key) applies the documented defaults, which reproduce the original hardcoded behaviour.

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxLevel` | number | `100` | The level cap for entities of this definition. |
| `xpCurve` | `XpCurveConfig` | `{ "kind": "geometric", "base": 100, "ratio": 1.15 }` | Controls how much XP is required to advance each level. |
| `statGain` | `StatGainConfig` | See sub-sections below | Controls which stats grow and by how much at each level. |

### `xpCurve` — `XpCurveConfig`

#### `kind: "geometric"` (default)

XP required for level _n_: `floor(base × ratio^(n−1))`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base` | number | `100` | XP needed to reach level 2 (the first level-up threshold). |
| `ratio` | number | `1.15` | Exponential growth factor. `1.15` means each level costs ~15% more XP than the previous. |

**Example:**
```json
{ "kind": "geometric", "base": 100, "ratio": 1.15 }
```

#### `kind: "table"`

Explicit per-level XP table for non-exponential or hand-tuned progressions.

| Field | Type | Description |
|-------|------|-------------|
| `perLevel` | number[] | XP thresholds indexed from 0. Index 0 = XP to reach level 2, index 1 = level 3, etc. When the entity's level exceeds the array length, it is capped at the last defined level. |

**Example:**
```json
{ "kind": "table", "perLevel": [100, 120, 150, 200, 280] }
```

### `statGain` — `StatGainConfig`

#### `guaranteed`

Fixed stat points awarded every level-up, regardless of rarity or weights. Partial objects accepted — only named stats receive a guaranteed grant.

**Default:** `+1` to every stat (`ATK`, `DEF`, `SPD`, `FOC`, `LCK`, `VIT`).

```json
{ "guaranteed": { "ATK": 1, "DEF": 1, "SPD": 1, "FOC": 1, "LCK": 1, "VIT": 1 } }
```

#### `bonusPool`

Additional stat points distributed on top of the guaranteed grant. Two variants:

**`rarityScaled`** (default) — pool size scales with the entity's rarity and current level:

Pool = `floor(base × compositRarity^(level × exponent))`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `kind` | `"rarityScaled"` | required | Selects this variant. |
| `base` | number | `14` | Pool at level 1 for a common entity (`compositRarity = 1.0`). |
| `exponent` | number | `0.16` | Controls how steeply rarity compounds with level. Higher = rarer entities pull further ahead at high levels. |
| `rarityField` | string | `"compositRarity"` | Key on `entity.stats` that holds the rarity scalar. Change only if you store it under a different key. |

**`flat`** — fixed pool per level-up regardless of rarity:

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"flat"` | Selects this variant. |
| `amount` | number | Fixed bonus pool per level-up for every entity. |

#### `distribution`

Controls how the bonus pool is split between uniform draws and rarity-weighted draws.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `uniformShare` | number 0–1 | `0.5` | Fraction of the bonus pool distributed with equal probability across all stats. |
| `weightedShare` | number 0–1 | `0.5` | Fraction distributed according to the entity's trait scaling weights. `uniformShare + weightedShare` should equal `1`. |
| `weightsField` | string | `"scaling"` | Key on `entity.stats` holding the per-stat weight map (produced by `computeScaling()` at entity generation time). If the `RND` key is present in the weights map, when selected it picks a random visible stat instead of a fixed one. |

### Full defaults example

```json
{
  "maxLevel": 100,
  "xpCurve": { "kind": "geometric", "base": 100, "ratio": 1.15 },
  "statGain": {
    "guaranteed": { "ATK": 1, "DEF": 1, "SPD": 1, "FOC": 1, "LCK": 1, "VIT": 1 },
    "bonusPool": { "kind": "rarityScaled", "base": 14, "exponent": 0.16, "rarityField": "compositRarity" },
    "distribution": { "uniformShare": 0.5, "weightedShare": 0.5, "weightsField": "scaling" }
  }
}
```

---

## CheckInDef — Track Configuration Fields

`CheckInDef` rows define daily/weekly check-in tracks. Each row is an independent track; a player participates in all enabled tracks simultaneously, receiving a reward from each on claim.

Managed via the generic admin smart table (`checkInDef`).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `daily_login_track`). |
| `name` | string | ✓ | Admin-facing display name. |
| `description` | string | | Optional admin notes. |
| `enabled` | boolean | | Default `true`. Disabled tracks are ignored for all players. |
| `frequency` | Json | | Cadence object controlling how often the track window resets. See below. Default `{ "type": "daily" }`. |
| `cycleLength` | number | | Number of reward slots in one cycle. After `cycleLength` claims the streak wraps back to day 0. Default `7`. |
| `requireStreak` | boolean | | When `true`, missing a claim window resets the player's streak to day 0. When `false`, gaps are forgiven and the player continues from where they left off. Default `false`. |
| `allowReclaim` | boolean | | When `true`, a streak reset (due to `requireStreak`) still allows the player to claim day 0 immediately in the new cycle. Default `false`. |
| `rewards` | Json | | Ordered array of `RewardSlot` entries (see below). One slot fires per claim based on the player's current streak position. |

### `frequency` object

A `FrequencyShape` JSON blob stored on the def.

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Cadence type. Default `"daily"`. See values below. |
| `interval` | number | Number of days per window. Required only when `type` is `"every_x_days"`. |

**Supported `type` values:**

| Value | Reset behaviour |
|-------|----------------|
| `"daily"` | Window resets each UTC midnight. |
| `"weekly"` | Window resets each UTC Monday at 00:00 UTC (ISO week). |
| `"monthly"` | Window resets on the 1st of each month at 00:00 UTC. |
| `"every_x_days"` | Epoch-aligned window of `interval` days (e.g. `interval: 3` = every 72 h aligned to Unix epoch). `interval` is required. |
| `"oneoff"` | Window never resets. The player can claim once and never again. Useful for one-time welcome tracks. |

### `rewards[]` — `RewardSlot` shape

Each element in the `rewards` array represents one slot in the cycle.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `day` | number | ✓ | Zero-based slot index. The resolver selects the slot where `day === playerStreak % cycleLength`. |
| `gift` | `GiftSpec` | ✓ | The reward to grant. Either `{ "giftDefId": "..." }` (reference) or an `InlineGiftDef`. See [GiftSpec — Inline Gift Definitions](#giftspec--inline-gift-definitions). |

**Example — 7-day daily cycle with streak enforcement:**

```json
{
  "frequency": { "type": "daily" },
  "cycleLength": 7,
  "requireStreak": true,
  "allowReclaim": false,
  "rewards": [
    { "day": 0, "gift": { "giftDefId": "gift_day1_coins" } },
    { "day": 1, "gift": { "giftDefId": "gift_day2_coins" } },
    { "day": 2, "gift": { "giftDefId": "gift_day3_mat" } },
    { "day": 3, "gift": { "giftDefId": "gift_day4_coins" } },
    { "day": 4, "gift": { "giftDefId": "gift_day5_mat" } },
    { "day": 5, "gift": { "giftDefId": "gift_day6_coins" } },
    { "day": 6, "gift": {
        "name": "Weekly Bonus",
        "rewardSpec": [{ "type": "currency", "key": "hard_essence", "min": 10, "max": 10 }],
        "instant": true
      }
    }
  ]
}
```

---

## QuestDef — Complete Field Reference

`QuestDef` rows define both quests and achievements. The `category` field distinguishes them — `"achievement"` rows appear in the Achievements panel and never reset; `"quest"` rows appear in the Quests panel and may reset on a cadence.

Managed via the generic admin smart table (`questDef`).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier (e.g. `quest_boss_hunter`). |
| `name` | string | ✓ | Player-facing display name. |
| `description` | string | | Player-facing description of what needs to be done. |
| `category` | `"quest"` \| `"achievement"` | | `"quest"` (default) — shown in the Quests panel. `"achievement"` — shown in the Achievements panel; lifetime one-shot, never resets. |
| `tier` | number | | Achievement prestige tier: `1` = Bronze, `2` = Silver, `3` = Gold. Used for visual theming on `achievement`-category defs. Default `1`. |
| `cadence` | string | | Controls the auto-reset schedule. Default `"oneoff"`. Valid values: `"oneoff"` (never auto-resets), `"daily"` (resets each UTC midnight), `"weekly"` (resets each UTC Monday midnight). The shared cadence utility also recognises `"monthly"` and `"every_x_days"` as accepted strings, but the server's automatic reset job currently only processes `daily` and `weekly` quests. Always `"oneoff"` for `category: "achievement"`. |
| `enabled` | boolean | | Default `true`. Disabled quests are excluded from listing and event processing. |
| `sortOrder` | number | | Display ordering within the quests/achievements list. Lower = shown first. Default `0`. |
| `repeatable` | boolean | | When `true` (and `cadence` is `"oneoff"`), the quest resets to `active` after being claimed so the player can complete it again. Cadence quests (`daily`/`weekly`) are implicitly repeatable regardless of this flag. Default `false`. |
| `version` | number | | Internal schema version for the quest def record. Incremented by the system. Default `1`. |
| `requirements` | Json | | `RichSelection` tree evaluated at list time — gates whether the quest is visible to the player. |
| `objectives` | Json | ✓ | Array of `Objective` entries defining what the player must do. See below. |
| `rewardSpec` | Json | | Outcome entries array (same format as mission rewards) granted when the player claims the quest. |
| `permanentEffectSpec` | Json | | **Achievement-category only.** Applied once on first claim. Grants a permanent `ActiveEffect` with no expiry. See below. |

### `objectives[]` — Objective shape

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventType` | string | | Fast-path filter — objective only increments when a telemetry event of this type fires. Omit to match any event (rely on `selector` for filtering). |
| `selector` | `RichSelection` | | Full condition tree evaluated against the combined `SelectionContext` (player, entities, inventory, locations, and the live `event` scope). |
| `target` | number | ✓ | Number of qualifying increments required to complete this objective. |
| `description` | string | | Optional label shown in the player UI (e.g. `"Complete 3 boss missions"`). |

### `permanentEffectSpec` — Achievement Permanent Effect

Used on `category: "achievement"` defs to grant a lifetime bonus when the achievement is first claimed. Creates a `permanent` `ActiveEffect` (no expiry) on the player.

| Field | Type | Description |
|-------|------|-------------|
| `effectDefId` | string | ID of the `EffectDef` to activate. |
| `targetType` | `EffectTargetType` | Target of the effect. Falls back to the def's own `targetType` if omitted. |
| `targetId` | string | Explicit target ID. Falls back to the claiming player's `userId` if omitted. |
| `value` | number | Override the def's `value`. Falls back to the def's value if omitted. |
| `stats` | `EffectStatMap` | Override the def's `stats`. Falls back to the def's stats if omitted. |

**Example:**

```json
{
  "permanentEffectSpec": {
    "effectDefId": "stat_boost_atk_permanent",
    "targetType": "player",
    "value": 25
  }
}
```

---

## ItemDefinition — Data Blob Sub-Schemas

`ItemDefinition` rows carry several optional JSON blob fields that activate different game systems. All blobs are `null` by default; populate only the one that matches the item's type and purpose.

### `consumableData` — Consumable Items

Present when the item can be **used** directly from inventory (`type: CONSUMABLE`). Contains a `ConsumableData` object.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `effects` | `ConsumableEffectSpec[]` | ✓ | Array of effects applied when the item is consumed. |

**`effects[]` entry — `ConsumableEffectSpec`:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `effectDefId` | string | ✓ | ID of the `EffectDef` to activate on use. |
| `targetType` | `EffectTargetType` | ✓ | Which target the effect is applied to (`player`, `entity`, etc.). Each effect carries its own target — there is no top-level `targetType`. |
| `effectOverrides` | `EffectDefOverrides` | | Optional field overrides that shadow the def's values at activation time. See [EffectDefOverrides](#effectdefoverrides--safe-override-subset). |

**Example:**

```json
{
  "consumableData": {
    "effects": [
      {
        "effectDefId": "xp_boost_30min",
        "targetType": "player",
        "effectOverrides": { "value": 50, "durationSec": 1800 }
      }
    ]
  }
}
```

---

### `passiveEffects` — Equipment Passive Bonuses

Present on **equipment** items (`type: EQUIPMENT`). Defines passive effects applied while the item is equipped to an entity. Each entry is a `PassiveEffectSpec` — a lightweight inline effect that does not require a separate `EffectDef` row and does not create `ActiveEffect` records; it is resolved at query time from the equipped item.

**`PassiveEffectSpec` fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | `EffectCategory` | ✓ | What game system the passive modifies. |
| `valueMode` | `EffectValueMode` | ✓ | How the value is applied. |
| `value` | number | | Primary scalar. Required for most categories; omit for `stat_boost` (use `stats` instead). |
| `stats` | `EffectStatMap` | | Per-stat distribution. Use for `stat_boost` category. |
| `trait` | string | | Trait archetype name to grant. Use for `trait_grant` category. |

**Example:**

```json
{
  "passiveEffects": [
    { "category": "stat_boost", "valueMode": "flat_add", "stats": { "ATK": 10, "DEF": 5 } },
    { "category": "xp_multiplier", "valueMode": "percent_add", "value": 15 }
  ]
}
```

---

### `equipData` — Equipment Slot Configuration

Present on **equipment** items (`type: EQUIPMENT`). Specifies which equipment slot the item occupies and its flat stat bonuses applied while equipped.

| Field | Type | Description |
|-------|------|-------------|
| `slot` | string | Equipment slot identifier (e.g. `"weapon"`, `"armour"`, `"accessory"`). Must match a slot defined on the entity definition's equipment configuration. |
| `stats` | `Record<StatKey, number>` | Map of stat name → flat bonus value added to the entity while this item is equipped (e.g. `{ "ATK": 15, "SPD": 3 }`). Resolved via the effect resolver at query time — does not mutate `Entity.stats` directly. |

**Example:**

```json
{
  "equipData": {
    "slot": "weapon",
    "stats": { "ATK": 15, "SPD": 3 }
  }
}
```

> **Note:** `equipData.stats` produces a synthetic `stat_boost` / `flat_add` effect row when the effect resolver loads equipped items. `passiveEffects` entries are evaluated alongside it and stack normally with other active effects.

---

### `dustingData` — Item Breakdown

Present when the item can be broken down via the dusting system. See the full field reference in [Item Dusting — Commands](#item-dusting--commands).

---

### `lootboxDefId` — Lootbox / Gacha Items

Present on **lootbox** items (`type: LOOTBOX`). A plain string field (not a nested blob) referencing the `LootboxDef` row that determines the outcome pool when the player opens this item.

| Field | Type | Description |
|-------|------|-------------|
| `lootboxDefId` | string | ID of the `LootboxDef` whose outcome pool is rolled on open. Managed via the `lootboxDef` admin smart table. |

**Example (top-level field on the ItemDefinition):**

```json
{
  "id": "lootbox_standard",
  "name": "Standard Lootbox",
  "type": "LOOTBOX",
  "lootboxDefId": "lootbox_standard_pool"
}
```
