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
Dry-run a draft `SynergyRule` against supplied entity descriptors and activity context. Nothing is persisted. Used by the admin "Test Rule" button.

**Auth:** Admin (`X-Admin-Secret`)

**Body:**
```json
{
  "rule": {
    "id": "draft",
    "name": "Draft Rule",
    "sourceSelector": { "traitsAny": ["ninja"] },
    "targetSelector": { "traitsAny": ["magic"] },
    "context": { "activityTypes": ["mission"] },
    "effects": [{ "type": "synergy_score_modifier", "operation": "flat_add", "value": 3 }],
    "stackMode": "additive",
    "maxApplications": 3
  },
  "activityContext": {
    "activityType": "mission",
    "missionTags": ["stealth"],
    "teamSize": 4
  },
  "sourceDescriptors": [
    { "entityId": "ent_1", "traits": { "head": "Ninja", "body": "Ninja" } }
  ],
  "targetDescriptors": [
    { "entityId": "ent_2", "traits": { "head": "magic", "body": "Dave" } }
  ]
}
```

**Response:**
```json
{
  "matchedRules": [
    {
      "ruleId": "draft",
      "name": "Draft Rule",
      "applications": 1,
      "effects": [{ "type": "synergy_score_modifier", "operation": "flat_add", "value": 3 }]
    }
  ],
  "totals": {
    "synergyScore": 3,
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
