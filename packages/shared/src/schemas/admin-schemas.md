# Derp Universe — Admin Schema Reference

Human-readable documentation for definition tables managed via the admin panel at `/admin/def`.

> **Task #367 update:** the former `BodySchema`, `EquipmentSchema`, `ProgressionProfile`, and `TraitDefinition` tables (and the `attributeMap` blob on `NftCollectionDef.data`) have been collapsed into a single self-contained `EntityDefinition` row. Body slots, equipment slot capacities, per-archetype trait metadata, NFT raw-attribute remapping, and progression flags/caps now all live inline on `EntityDefinition`.

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
| attributeMap | json | Optional NFT raw-attribute → slot remap (e.g. `{ "meta_body": "body" }`). Empty for non-NFT or 1:1 attribute species. |
| leveling | boolean | Can entities of this type level up? (default true) |
| ascension | boolean | Can entities of this type ascend? (default true) |
| mastery | boolean | Can entities of this type gain mastery? (default true) |
| prestigeEligible | boolean | Eligible for prestige? (default true) |
| maxLevel | number | Maximum level cap (default 50) |
| ascensionCap | number | Maximum ascension tier (default 5) |
| rules | json | Entity-type-specific rule overrides |
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

### `attributeMap` format

Used only when an NFT collection's raw on-chain attribute keys differ from the body-slot names. Keys are matched case-insensitively. Multiple raw keys may point to the same slot. Leave empty (`{}`) when raw attributes already match slot names.

**Example (Cardano Perps, embedded on the `perp` EntityDefinition):**

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
| Purple | body | FOC+1, LCK+1 | scarce |
| Neon | body | LCK+2 | rare |
| Blue | body | SPD+1, ATK+1 | advanced |
| Sparkles | special | LCK+1 | uncommon |
| Leaves | special | VIT+1 | uncommon |
| Bubble Show | special | FOC+1 | scarce |
| Water | special | DEF+1 | scarce |
| Earthen | special | VIT+2 | advanced |
| Ice Storm | special | SPD+1, DEF+1 | rare |
| Electric Aura | special | ATK+2 | ultra_rare |
| Low Life | special | LCK+2 | rare |
| Crystal Storm | special | FOC+2 | ultra_rare |
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
| `POST /admin/backfill/entity-stats` | Recompute `stats.scaling` and `stats.compositRarity` for all entities from stored traits |
| `POST /admin/backfill/nft-metadata` | Fetch and cache NFT metadata for outpost `LocationInstance` records missing `state.nftRawMeta` |
| `POST /admin/backfill/nft-entity-traits?collectionId=<id>` | Rebuild `traits`, `stats`, `definitionId`, and `speciesId` for existing NFT entities from `state.nftAttributes`. `collectionId` is optional — omit to process all entity collections. No on-chain requests are made. |
| `POST /admin/backfill/production-rates` | Recompute production rates for all location instances |
