# Derp Universe — Admin Schema Reference

Human-readable documentation for definition tables managed via the admin panel at `/admin/def`.

---

## BodySchema

Defines the body slots for an entity type and which archetypes are allowed in each slot.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| slots | json | Map of slot name → array of allowed archetype values |
| data | json | Extra configuration |

### Known body schemas

| ID | Slots | Used by |
|----|-------|---------|
| `avian_7` | back, beak, body, ears, eyes, head, tail | Derp Birds, Derplings, Derp Apes, Preds |
| `perp_schema` | body, special, faction, leader | Perps |

### perp_schema slot values

| Slot | Allowed values |
|------|---------------|
| body | None, Yellow, Cyan, Grey, Purple, Neon, Blue |
| special | None, Sparkles, Leaves, Bubble Show, Water, Earthen, Ice Storm, Electric Aura, Low Life, Crystal Storm, Press Speech, Dark Energy, The Incubator |
| faction | None, Genovault, Astro Schism, Kraashers |
| leader | None, Leader, Multiverse Leader |

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
| data | json | Extra config — see attributeMap below |

### data.attributeMap

Optional object that remaps raw NFT metadata attribute keys to body schema slot names before trait lookup. Required for collections whose metadata uses prefixed keys (e.g. Perps use `meta_Body` instead of `body`).

Keys are matched case-insensitively. Multiple raw keys may point to the same slot.

**Example (nft_cardano_perps):**
```json
{
  "attributeMap": {
    "meta_body": "body",
    "meta_special": "special",
    "meta_faction": "faction",
    "meta_leader": "leader",
    "meta_multiverse leader": "leader"
  }
}
```

---

## TraitDefinition

Defines stat bonuses and scaling multipliers for a named trait archetype. Each archetype value that can appear in a body slot must have a corresponding TraitDefinition.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| archetype | string | Display name matched against NFT attribute values (case-insensitive) |
| slotStats | json | Map of slot name → stat bonuses applied when the archetype appears in that slot |
| tags | string[] | Classification tags |
| data.rarity | string | Rarity tier (common, uncommon, scarce, advanced, rare, ultra_rare, epic, mythic, legendary) |
| data.scaling | json | Per-stat scaling multipliers applied to the global scaling formula |
| data.rarityMultiplier | number | Bonus multiplier applied to the compositRarity score |

### Perp trait definitions

| ID | Archetype | Slot | Stats | Rarity |
|----|-----------|------|-------|--------|
| perp_none | None | any | — | common |
| perp_body_yellow | Yellow | body | ATK+1 | common |
| perp_body_cyan | Cyan | body | DEF+1, SPD+1 | uncommon |
| perp_body_grey | Grey | body | VIT+1, DEF+1 | uncommon |
| perp_body_purple | Purple | body | FOC+1, LCK+1 | scarce |
| perp_body_neon | Neon | body | LCK+2 | rare |
| perp_body_blue | Blue | body | SPD+1, ATK+1 | advanced |
| perp_special_sparkles | Sparkles | special | LCK+1 | uncommon |
| perp_special_leaves | Leaves | special | VIT+1 | uncommon |
| perp_special_bubble_show | Bubble Show | special | FOC+1 | scarce |
| perp_special_water | Water | special | DEF+1 | scarce |
| perp_special_earthen | Earthen | special | VIT+2 | advanced |
| perp_special_ice_storm | Ice Storm | special | SPD+1, DEF+1 | rare |
| perp_special_electric_aura | Electric Aura | special | ATK+2 | ultra_rare |
| perp_special_low_life | Low Life | special | LCK+2 | rare |
| perp_special_crystal_storm | Crystal Storm | special | FOC+2 | ultra_rare |
| perp_special_press_speech | Press Speech | special | ATK+1, LCK+1 | epic |
| perp_special_dark_energy | Dark Energy | special | ATK+2, DEF+1 | epic |
| perp_special_the_incubator | The Incubator | special | all+1 | legendary |
| perp_faction_genovault | Genovault | faction | DEF+1 | uncommon |
| perp_faction_astro_schism | Astro Schism | faction | FOC+1 | uncommon |
| perp_faction_kraashers | Kraashers | faction | ATK+1 | uncommon |
| perp_leader_leader | Leader | leader | all+1 | rare |
| perp_leader_multiverse | Multiverse Leader | leader | ATK+2, DEF+2, FOC+2, SPD+1, LCK+1, VIT+2 | legendary |

---

## EntityDefinition

Links a species to a body schema, equipment schema, and progression profile.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier, also used as the `kind` for frontend rendering |
| speciesId | string | Species reference |
| bodySchemaId | string | FK to BodySchema |
| equipmentSchemaId | string | FK to EquipmentSchema |
| progressionProfileId | string | FK to ProgressionProfile |
| rules | json | Entity-type-specific rule overrides |
| data | json | Extra configuration |

### Known entity definitions

| ID | BodySchema | Notes |
|----|-----------|-------|
| derp_bird | avian_7 | 7-slot avian, teal card theme |
| derpling | avian_7 | |
| derp_ape | avian_7 | |
| pred | avian_7 | |
| perp | perp_schema | 4-slot perp layout, faction/leader card themes |
| derp_outpost | avian_7 | |

---

## Admin Backfill Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /admin/backfill/entity-stats` | Recompute `stats.scaling` and `stats.compositRarity` for all entities from stored traits |
| `POST /admin/backfill/nft-metadata` | Fetch and cache NFT metadata for outpost `LocationInstance` records missing `state.nftRawMeta` |
| `POST /admin/backfill/nft-entity-traits?collectionId=<id>` | Rebuild `traits`, `stats`, `definitionId`, and `speciesId` for existing NFT entities from `state.nftAttributes`. `collectionId` is optional — omit to process all entity collections. No on-chain requests are made. |
| `POST /admin/backfill/production-rates` | Recompute production rates for all location instances |
