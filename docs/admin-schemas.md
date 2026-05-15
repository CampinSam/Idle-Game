# Admin Panel Schema Documentation

This document describes each definition table editable through the Admin Panel, the unified Job system for runtime activities, instance tables, and all shared JSON structure formats.

---

## Table of Contents

### Definition Tables
1. [Currency](#currency)
2. [ItemDef (Items)](#itemdef)
3. [EntityDefinition](#entitydefinition)
4. [RegionDefinition](#regiondefinition)
5. [LocationDefinition](#locationdefinition)
6. [BuildingDef (Buildings)](#buildingdef)
7. [RoomDef (Rooms)](#roomdef)
8. [DisplayDef](#displaydef)
9. [MissionCategoryDef](#missioncategorydef)
10. [MissionDef (Missions / Quests)](#missiondef)
11. [RecipeDef (Crafting Recipes)](#recipedef)
12. [BundleDef (Reusable Outcome Bundles)](#bundledef)
13. [EventDefinition](#eventdefinition)
14. [GiftDef](#giftdef)
15. [ModalDef](#modaldef)
16. [LootboxDef](#lootboxdef)
17. [CheckInDef](#checkindef)
18. [QuestDef](#questdef)
19. [ShopItemDef](#shopitemdef)
20. [NftCollectionDef](#nftcollectiondef)
21. [EffectDef](#effectdef)

### Audio System Tables
22. [SoundDef](#sounddef)
23. [SoundMapping](#soundmapping)

### Runtime Tables
24. [Job (Unified Job System)](#job)
25. [Notification](#notification)
26. [TickRateInterval](#tickrateinterval)
27. [BoostEvent](#boostevent)
28. [ActiveEffect](#activeeffect)

### Instance Tables
29. [Entity (Instance)](#entity-instance)
30. [EntityEquipment](#entityequipment)
31. [LocationInstance](#locationinstance)
32. [LocationBuildingInstance](#locationbuildinginstance)
33. [LocationRoomInstance](#locationroominstance)
34. [LocationWorkerAssignment](#locationworkerassignment)
35. [ItemInstance](#iteminstance)
36. [GiftInstance](#giftinstance)
37. [GiftClaimTx](#giftclaimtx)

### Shared JSON Formats
39. [Unified Level-Based Rules System](#unified-level-based-rules-system)
39a. [Settlement Storage JSON](#settlement-storage-json)
40. [Timer](#timer)
41. [Cost Objects](#cost-objects)
42. [Outcome Blocks](#outcome-blocks)
43. [Rewards](#rewards)
44. [Requirements](#requirements)
45. [Visibility Requirements](#visibility-requirements)
46. [Effects (Flag)](#effects)
47. [Effect System Enums](#effect-system-enums)
48. [Extra Data](#extra-data)
49. [Gift Reward Spec](#gift-reward-spec)
50. [Event → Gift Flow](#event--gift-flow)
51. [Example Flow 1: Welcome Gems](#example-flow-1-welcome-gems-registration--currency-gift)
52. [Example Flow 2: New Guest Arrived](#example-flow-2-new-guest-arrived-missioncrafting--entity-gift)

---

## Currency

Defines a currency type in the game economy.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `soft_arcanium`, `premium_gems`) |
| `name` | string | Yes | — | Display name |
| `symbol` | string | No | — | Short symbol for compact display (e.g. `💎`, `💠`) |
| `iconKey` | string | No | — | Key used to resolve the display icon |
| `type` | enum | Yes | — | One of: `SOFT`, `HARD`, `PREMIUM`, `SEASONAL`, `EVENT`, `GUILD` |
| `seasonId` | string | No | — | Links to a season (for `SEASONAL` type currencies) |
| `isTradeable` | boolean | No | false | Whether players can trade this currency |
| `isSpendable` | boolean | No | true | Whether this currency can be spent |
| `decimals` | number | No | 0 | Decimal precision (0 = whole numbers only) |
| `cap` | bigint | No | — | Maximum amount a player can hold (blank = unlimited) |

---

## ItemDef

Defines an item that can exist in player inventories. Supports materials, consumables, gear, lootboxes, and quest items with full rarity tiers, equipment data, passive effects, and seasonal tagging.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `mat_iron_ore`, `gear_iron_sword`) |
| `type` | ItemType enum | Yes | — | One of: `MATERIAL`, `CONSUMABLE`, `GEAR`, `QUEST`, `LOOTBOX`, `GIFT_PACKAGE` |
| `rarity` | ItemRarity enum | No | `COMMON` | Rarity tier (see [ItemRarity Enum](#itemrarity-enum)) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `iconKey` | string | No | — | Icon path or bare key. A leading `/` (e.g. `/images/icons/foo.png`) is treated as a literal path under the public bucket; a bare key (e.g. `lucky_charm`) resolves to `/media/images/icons/<key>.png`; absolute `http(s)://`, `data:`, and `blob:` URLs pass through unchanged. |
| `uiColor` | string | No | — | CSS color for UI accent (e.g. border glow) |
| `category` | ItemCategory enum | No | `MISC` | One of: `MISC`, `CRAFTING`, `COMBAT`, `EXPLORATION`, `QUEST_ITEMS`, `ENHANCEMENT` |
| `groups` | string[] | No | `[]` | Tags for filtering/searching (e.g. `["ore", "basic"]`, `["weapon", "melee"]`) |
| `tags` | string[] | No | `[]` | Additional classification tags |
| `lootboxDefId` | string | No | — | ID of the [LootboxDef](#lootboxdef) that defines the outcome pool. Required when `type` is `LOOTBOX`. |
| `stackable` | boolean | No | false | Whether multiple units stack in one inventory slot |
| `maxStack` | number | No | — | Maximum stack size (blank = unlimited when stackable) |
| `uniqueInstance` | boolean | No | false | If true, each item gets its own ItemInstance (no stacking) |
| `equipData` | JSON | No | — | Equipment slot and stat bonuses (see [EquipData](#equipdata)) |
| `passiveEffects` | JSON | No | — | Passive effects applied while the item is in inventory or equipped |
| `consumableData` | JSON | No | — | Consumable behavior (see [ConsumableData](#consumabledata)) |
| `data` | JSON | No | — | Freeform extra data for custom item behavior |
| `seasonId` | string | No | — | Links to a season for seasonal items |

### ItemRarity Enum

Ordered from most common to rarest:

| Value | Description |
|---|---|
| `COMMON` | Most basic items |
| `UNCOMMON` | Slightly harder to find |
| `SCARCE` | Noticeable rarity |
| `ADVANCED` | Requires some effort to obtain |
| `RARE` | Significantly rare |
| `ULTRA_RARE` | Very difficult to obtain |
| `EPIC` | Exceptional items |
| `MYTHIC` | Near-legendary rarity |
| `LEGENDARY` | Rarest tier |

### EquipData

Used in the `equipData` field on gear-type items:

```json
{
  "slot": "weapon",
  "stats": { "ATK": 5 }
}
```

| Property | Type | Description |
|---|---|---|
| `slot` | string | Equipment slot (e.g. `weapon`, `armor`, `accessory`) |
| `stats` | object | Stat bonuses when equipped. Keys are stat IDs (`ATK`, `DEF`, `SPD`, `FOC`, `LCK`, `VIT`), values are numbers. |

### ConsumableData

Used in the `consumableData` field on consumable items. Consumables apply one or more effects from the [EffectDef](#effectdef) table when used via the `UseConsumable` command.

```json
{
  "effects": [
    { "effectDefId": "eff_xp_boost_30m", "targetType": "player" },
    { "effectDefId": "eff_stat_boost_atk", "targetType": "entity" }
  ],
  "targetType": "player"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `effects` | array | Yes | Array of `ConsumableEffectSpec` entries (see below) |
| `targetType` | EffectTargetType enum | Yes | Default target type for resolution |

#### ConsumableEffectSpec

Each entry in the `effects` array:

| Property | Type | Required | Description |
|---|---|---|---|
| `effectDefId` | string | Yes | References an [EffectDef](#effectdef) `id` |
| `targetType` | EffectTargetType enum | Yes | One of: `entity`, `player`, `location`, `team`, `job`, `global` |

When the consumable is used, each effect spec is resolved: the referenced `EffectDef` is looked up and applied via the effect system. Instant effects (`durationModel: "instant"`) fire immediately with no persistent record. All other duration models (`timed`, `tick_based`, `count_based`, `session`, `permanent`, `until_removed`) create an `ActiveEffect` record. If the effect's `stackingRule` is `replace`, the previous active effect from the same definition is removed and a delete patch is emitted.

### PassiveEffectSpec

Used in the `passiveEffects` JSON array field on items. Passive effects are resolved at query time from equipped items — they do not create `ActiveEffect` records.

```json
[
  { "category": "stat_boost", "valueMode": "flat_add", "stats": { "ATK": 5, "DEF": 3 } },
  { "category": "mission_power", "valueMode": "percent_add", "value": 10 },
  { "category": "trait_grant", "valueMode": "flat_grant", "trait": "ninja" }
]
```

| Property | Type | Required | Description |
|---|---|---|---|
| `category` | EffectCategory enum | Yes | Effect category (see [Effect System Enums](#effect-system-enums)) |
| `valueMode` | EffectValueMode enum | Yes | How the value is applied (see [Effect System Enums](#effect-system-enums)) |
| `value` | number | No | Scalar value (used by most value modes) |
| `stats` | EffectStatMap | No | Per-stat values `{ ATK?, DEF?, SPD?, FOC?, LCK?, VIT? }` (for `stat_boost` category) |
| `trait` | string | No | Trait archetype name (for `trait_grant` category) |

---

## EntityDefinition

Self-contained blueprint for a species/type of game entity (character). Task #367 collapsed `BodySchema`, `EquipmentSchema`, `ProgressionProfile`, and `TraitDefinition` (and the `attributeMap` blob on `NftCollectionDef.data`) into this single record. Task #371 then replaced the legacy boolean/int progression columns (`leveling`, `ascension`, `mastery`, `prestigeEligible`, `maxLevel`, `ascensionCap`, `attributeMap`) with four structured JSON sub-objects: `progression`, `ascension`, `mastery`, and `init`. The `attributeMap` previously at the top level now lives under `init.nft.attributeMap`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `derp_bird`) |
| `name` | string | Yes | — | Human-readable display name |
| `speciesId` | string | Yes | — | Species identifier for grouping |
| `slots` | JSON | No | `{}` | Body slot layout: `{ slotName: [allowedArchetype, ...] }` |
| `equipmentSlots` | JSON | No | `{}` | Equipment slot capacities: `{ slotName: maxCount }` |
| `traits` | JSON | No | `{}` | Per-archetype trait map keyed by archetype name (see below) |
| `progression` | JSON | No | `{}` | Progression rules (see [`progression` format](#progression-format)). Required keys: `maxLevel`, `xpCurve`. |
| `ascension` | JSON | No | `{ "enabled": false }` | Ascension rules (see [`ascension` format](#ascension-format)). Currently `{ "enabled": false }` for all entities. |
| `mastery` | JSON | No | `{ "enabled": false }` | Mastery rules (see [`mastery` format](#mastery-format)). Currently `{ "enabled": false }` for all entities. |
| `init` | JSON | No | `{}` | Initialization rules used when minting an entity (see [`init` format](#init-format)). Holds both `init.scratch` (fresh mints) and `init.nft` (NFT-backed builds, including the renamed `attributeMap`). |
| `rules` | JSON | No | `{}` | Level-based rules (see [Unified Level-Based Rules System](#unified-level-based-rules-system)) |
| `data` | JSON | No | `{}` | Freeform extra data |

#### `progression` format

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

`xpCurve` is one of `{ "kind": "geometric", "base": int, "ratio": float }` (XP for level L → L+1 = `floor(base × ratio^(L-1))`) or `{ "kind": "table", "perLevel": int[] }` (`perLevel[L-1]` is the XP needed to leave level L). `bonusPool` is either `{ "kind": "rarityScaled", base, exponent, rarityField? }` or `{ "kind": "flat", "amount": int }`. The defaults reproduce the legacy 14-pool / 50-50 split exactly when `statGain` is omitted.

#### `ascension` format

```json
{ "enabled": false, "cap": 5 }
```

Reserved for future gameplay. Setting `enabled: true` will eventually unlock per-step ascension costs (`costPerStep`) and effect grants (`effects`). All seeded entities ship with `{ "enabled": false }`.

#### `mastery` format

```json
{ "enabled": false }
```

Reserved for future gameplay (`branches: object[]` will declare per-branch unlocks). All seeded entities ship with `{ "enabled": false }`.

#### `init` format

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

`init.scratch` controls non-NFT mints: `slotFill.kind` is `singleRandomArchetype` (default), `multiRandomArchetype` (with `count: int` to combine N archetype contributions per slot), or `fixed` (with `fixed: { slot: archetype }`). `startingLevel > 1` is supported — the generator runs the canonical weighted level-up loop using `progression.statGain` so stats and `levelHistory` match an entity that earned its way to that level.

`init.nft` controls NFT-backed claims: `attributeMap` translates raw on-chain attribute keys (case-insensitive) to body-slot names, `missingSlotPolicy` is one of `skip` (drop the slot — preserves the legacy NFT-builder behavior), `default` (use the slot's entry in `defaults`), or `error` (throw on the missing slot).

**`slots` format** — keys are slot names, values are arrays of allowed archetype strings. Example for the 7-slot avian layout used by Derp Birds:

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

The Perps definition uses a 4-slot layout: `body`, `special`, `faction`, `leader`.

**`equipmentSlots` format** — equipment slot → max count:

```json
{
  "weapon": 1,
  "armor": 1,
  "accessory": 2
}
```

**`traits` format** — keyed by archetype name; each entry carries per-slot stat bonuses, classification tags, presentation hints, and optional scaling/rarity metadata:

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

Entity stats are computed by summing the per-slot bonuses from each archetype assigned to each slot. Trait metadata is now sourced from this embedded map — there is no longer a standalone trait table to look up.

**`init.nft.attributeMap` format** — used only when an NFT collection's raw on-chain attribute keys differ from the body-slot names. For example the Perps Cardano collection ships with these keys (now nested under `init.nft.attributeMap` after Task #371):

```json
{
  "meta_body": "body",
  "meta_special": "special",
  "meta_faction": "faction",
  "meta_leader": "leader",
  "meta_multiverse leader": "leader"
}
```

Leave empty (`{}`) when raw attributes already match slot names.

**Stat IDs:** `ATK` (Attack), `DEF` (Defense), `SPD` (Speed), `FOC` (Focus), `LCK` (Luck), `VIT` (Vitality)

---

## RegionDefinition

Defines a world region that locations can belong to. Regions provide thematic grouping and optional modifier bonuses.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier, snake_case (e.g. `derpshire_valley`, `frostpeak_range`) |
| `displayName` | string | Yes | — | Human-readable region name |
| `biome` | string | No | — | Biome type (e.g. `plains`, `forest`, `mountain`, `swamp`) |
| `modifiers` | JSON | No | `{}` | Region-wide modifier bonuses (e.g. `{ "gatherBonus": 0.05 }`) |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## LocationDefinition

Defines a type of player-owned location (outpost). Locations contain buildings, rooms, workers, and production profiles. Uses the unified level-based rules system.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `outpost_default`, `derp_outpost`) |
| `kind` | string | No | `outpost_fungible` | Location type. `outpost_fungible` = standard outpost |
| `regionId` | string | No | — | References a [RegionDefinition](#regiondefinition) |
| `isUnique` | boolean | No | false | Whether only one instance of this location can exist per player |
| `rules` | JSON | No | `{}` | Level-based rules (see [Unified Level-Based Rules System](#unified-level-based-rules-system)) |
| `productionProfile` | JSON | No | `{}` | Additional production configuration |
| `requirements` | JSON | No | `[]` | Conditions to acquire this location (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for this location to appear (see [Visibility Requirements](#visibility-requirements)) |
| `levelUpModalDefId` | string | No | — | Optional `ModalDef.id`. When set, its spec is merged into the auto-generated outpost level-up modal (header/body overrides + replaced buttons) so designers can theme each outpost's celebration. |
| `data` | JSON | No | `{}` | Freeform extra data |

**Outpost XP & level-up.** Players grow an outpost by spending resources via the `DepositLocationXp` command. Cost options are configured under `rules.xpDepositCosts` (see [LevelRules](#levelrules-structure)) and default to `[{ "type": "currency", "id": "hard_essence", "amount": 1, "xpPerCharge": 1 }]` when omitted. XP thresholds use the same `rules.maxLevel` / `rules.xpCurve` / `rules.baseXP` / `rules.xpRate` / `rules.level[].xpThreshold` knobs as every other levelable definition. On level-up the server: recalculates location meta, records a `location_level_up` telemetry event, and emits a `LOCATION_LEVEL_UP` notification (groupKey `location_level_up:${locationId}`, deepLink `/locations/:id`) so the frontend can auto-open the celebration modal.

**Example rules (unified format):**

```json
{
  "maxLevel": 50,
  "xpCurve": "exp",
  "baseXP": 100,
  "xpRate": 1.5,
  "level": {
    "1": {
      "workers": { "slots": 2 },
      "buildings": {
        "slots": 3,
        "allowed": [
          { "buildingDefId": "gen_arcanium_mine", "maxCount": 1 },
          { "buildingDefId": "stor_warehouse", "maxCount": 1 }
        ]
      },
      "rooms": {
        "allowed": [
          { "roomDefId": "room_storage_vault" },
          { "roomDefId": "room_workshop" }
        ]
      },
      "storage": [
        { "type": "currency", "id": "soft_arcanium", "baseCapacity": 1000, "growthRate": "linear", "growthScalar": 200 }
      ],
      "production": [
        { "type": "currency", "id": "soft_arcanium", "ratePerHour": 3600, "growthRate": "linear", "growthScalar": 360 }
      ]
    },
    "5": {
      "workers": { "slots": 3 },
      "buildings": { "slots": 5 }
    }
  }
}
```

---

## BuildingDef

Defines a building that can be constructed inside outposts. Buildings are classified by tags and use level-based rules for production, storage, construction costs, and effects.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `gen_arcanium_mine`, `stor_warehouse`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `tags` | JSON | No | `[]` | Classification tags (e.g. `["generator", "arcanium"]`, `["storage"]`, `["defense"]`) |
| `rules` | JSON | No | `{}` | Level-based rules (see [Unified Level-Based Rules System](#unified-level-based-rules-system)) |
| `requirements` | JSON | No | `[]` | Conditions to construct (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for the building to appear in available buildings list (see [Visibility Requirements](#visibility-requirements)) |
| `activeModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display while the building job is running |
| `readyModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the building is ready to claim (falls back to `activeModalDefId`) |
| `completedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the building succeeded |
| `failedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the building failed (falls back to `completedModalDefId`) |
| `data` | JSON | No | `{}` | Freeform extra data |

**Notes:**
- Building category is derived from `tags` (e.g. a building with `["generator"]` tag is a generator).
- Output type and resource ID are determined from the `production` entries in the level-based rules.
- Construction costs, production rates, and storage capacity are all defined within the `rules` JSON.

**Example rules:**

```json
{
  "level": {
    "1": {
      "timer": { "duration": 300 },
      "production": [
        { "type": "currency", "id": "soft_arcanium", "ratePerHour": 60 }
      ],
      "constructionCost": [
        { "type": "currency", "id": "soft_arcanium", "amount": 50 }
      ]
    },
    "5": {
      "production": [
        { "type": "currency", "id": "soft_arcanium", "ratePerHour": 120 }
      ]
    }
  }
}
```

**Example rules (mixed currency + item costs with growth):**

```json
{
  "level": {
    "1": {
      "production": [
        { "type": "item", "id": "mat_iron_ore", "ratePerHour": 30 }
      ],
      "constructionCost": [
        { "type": "currency", "id": "soft_arcanium", "amount": 100 },
        { "type": "item", "id": "mat_iron_ore", "amount": 30 }
      ]
    }
  }
}
```

**Example rules (building with consumption — generator that consumes Arcanium to produce iron ore):**

```json
{
  "level": {
    "1": {
      "production": [
        { "type": "item", "id": "mat_iron_ore", "ratePerHour": 30 }
      ],
      "consumption": [
        { "type": "currency", "id": "soft_arcanium", "ratePerHour": 20 }
      ],
      "onStarve": "starved",
      "constructionCost": [
        { "type": "currency", "id": "soft_arcanium", "amount": 200 }
      ]
    }
  }
}
```

When this building's Arcanium supply runs out (from both the location's local storage and net flow from other buildings), it stops producing iron ore. With `onStarve: "starved"`, it automatically restarts during the same settlement if other buildings produce enough Arcanium. Use `"paused"` for expensive buildings that should stay stopped until manually re-enabled.

---

## RoomDef

Defines a room that can be built inside an outpost or building. Rooms modify or enhance the parent with additional storage, production multipliers, or effects.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `room_storage_vault`, `room_workshop`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `tags` | JSON | No | `[]` | Classification tags (e.g. `["storage"]`, `["production"]`) |
| `rules` | JSON | No | `{}` | Level-based rules (see [Unified Level-Based Rules System](#unified-level-based-rules-system)) |
| `requirements` | JSON | No | `[]` | Conditions to construct (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for the room to appear |
| `data` | JSON | No | `{}` | Freeform extra data |

**Example rules (storage room):**

```json
{
  "level": {
    "1": {
      "storage": [
        { "type": "currency", "id": "soft_arcanium", "baseCapacity": 200 },
        { "type": "item", "id": "mat_iron_ore", "baseCapacity": 100 }
      ]
    }
  }
}
```

**Example rules (production multiplier room):**

```json
{
  "level": {
    "1": {
      "effects": [{ "type": "production_multiplier_bps", "amount": 11000 }]
    }
  }
}
```

The `production_multiplier_bps` effect uses basis points (10000 = 1.0x, 11000 = 1.1x = +10% production bonus).

---

## DisplayDef

Defines visual display properties for mission categories and individual missions. Referenced by MissionCategoryDef and MissionDef for card rendering.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `display_quick_mission`) |
| `name` | string | Yes | — | Display name |
| `borderColor` | string | No | — | CSS border color for mission cards (e.g. `#4dcb6a`) |
| `backgroundImage` | string | No | — | URL/path to card background image |
| `cardBackground` | string | No | — | CSS background for the card body |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## MissionCategoryDef

Defines a hierarchical mission category for grouping and filtering missions in the UI.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `cat_quick`, `cat_standard`) |
| `name` | string | Yes | — | Display name |
| `parentId` | string | No | — | Parent category ID for hierarchical nesting |
| `displayDefId` | string | No | — | References a [DisplayDef](#displaydef) for visual styling |
| `tags` | JSON | No | `[]` | Classification tags (e.g. `["quick"]`, `["seasonal"]`) |
| `requirements` | JSON | No | `[]` | Conditions to access this category (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for this category to appear (see [Visibility Requirements](#visibility-requirements)) |
| `enabled` | boolean | No | true | Whether this category is currently active |
| `sortOrder` | number | No | 0 | Display order (lower = first) |
| `inlineOnly` | boolean | No | false | If true, this category is treated as a leaf — players cannot click into it. Its missions can only be launched through the inline pill buttons on the parent category card. |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## MissionDef

Defines a mission or quest that players can send their entities (birds) on.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `mission_quick_gather`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text or instructions |
| `difficulty` | number | No | 0 | Difficulty rating affecting success calculations |
| `minSuccessChance` | int | No | 0 | Floor for success chance (0–100) |
| `maxSuccessChance` | int | No | 100 | Ceiling for success chance (0–100) |
| `injuryRate` | float | No | 0 | Injury probability modifier on mission failure (0.0–1.0). Per-entity chance = `D / (TMP + D) * IR` where D = difficulty, TMP = total team MP, IR = injuryRate. 0 or absent = no injuries. |
| `injuryRecoveryTicks` | int | No | 0 | Base recovery duration in ticks. Actual ticks per entity = `round(base * (1 - VIT / (VIT + 100)))`. Must be > 0 for injuries to occur even when injuryRate > 0. |
| `timer` | JSON | No | (see [Timer](#timer)) | Duration, boost, and skip settings (see [Timer](#timer)) |
| `success` | JSON | No | `{"rewards":[],"effects":[],"text":[]}` | Outcome block for mission success (see [Outcome Blocks](#outcome-blocks)) |
| `failure` | JSON | No | `{"rewards":[],"effects":[],"text":[]}` | Outcome block for mission failure (see [Outcome Blocks](#outcome-blocks)) |
| `requirements` | JSON | No | `[]` | All conditions including team size, keeper level, flags, etc. (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for the mission to appear in the UI (see [Visibility Requirements](#visibility-requirements)) |
| `tags` | JSON | No | `[]` | Classification tags for filtering (e.g. `["beginner"]`, `["seasonal"]`) |
| `rewardPreview` | JSON | No | `[]` | Preview of possible rewards shown to the player before starting |
| `cost` | JSON | No | `[]` | Array of cost entries deducted when the mission starts. Each entry uses `{type, id, amount}` format (see [Cost Objects](#cost-objects)) |
| `enabled` | boolean | No | true | Whether this mission is currently active |
| `sortOrder` | number | No | 0 | Display order within its category (ascending) |
| `inline` | boolean | No | false | If true, shows as a quick-launch pill button on the parent category card instead of a full mission card |
| `inlineLabel` | string | No | — | Custom label for the inline pill. Defaults to the mission duration if omitted |
| `displayDefId` | string | No | — | References a [DisplayDef](#displaydef) for card visual styling |
| `missionCategoryDefId` | string | No | — | References a [MissionCategoryDef](#missioncategorydef) for grouping |
| `activeModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display while the mission job is running |
| `readyModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the mission is ready to claim (falls back to `activeModalDefId`) |
| `completedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the mission succeeded |
| `failedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the mission failed (falls back to `completedModalDefId`) |
| `data` | JSON | No | `{}` | Freeform extra data for custom logic |

---

## RecipeDef

Defines a crafting recipe that players can execute.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `recipe_iron_sword`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `category` | string | No | — | Grouping category (e.g. `weapons`, `potions`) |
| `group` | string | No | — | Sub-group within a category |
| `cost` | JSON | No | `[]` | Array of cost entries to start crafting, each using `{type, id, amount}` format (see [Cost Objects](#cost-objects)) |
| `timer` | JSON | No | (see [Timer](#timer)) | Duration, boost, and skip settings (see [Timer](#timer)) |
| `requiredKeeperLevel` | number | No | 1 | Minimum keeper level to unlock this recipe |
| `rewards` | JSON | No | `{}` | What the player receives on completion (see [Rewards](#rewards)). All effects (flag mutations, events, text) are included as entries in the rewards array, same as MissionDef outcome blocks. |
| `requirements` | JSON | No | `[]` | Conditions to start crafting (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for the recipe to appear (see [Visibility Requirements](#visibility-requirements)) |
| `activeModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display while the crafting job is running |
| `readyModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the craft is ready to claim (falls back to `activeModalDefId`) |
| `completedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the craft succeeded |
| `failedModalDefId` | string | No | — | References a [ModalDef](#modaldef) to display when the craft failed (falls back to `completedModalDefId`) |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## BundleDef

Defines a **named, reusable outcome bundle** that can be referenced from any reward caller (MissionDef success/failure, LootboxDef outcomes, RecipeDef rewards, GiftDef reward specs, server-side effects) via a `bundle_ref` entry. Editing the BundleDef updates every place that references it — no need to touch each consumer separately.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `bundle.starter_pack`). |
| `name` | string | Yes | — | Display name shown in the admin editor. |
| `description` | string | No | — | Internal notes for designers. |
| `enabled` | boolean | No | `true` | When `false`, every `bundle_ref` to this id resolves to an empty bundle (granting nothing). Useful for sunsetting content without deleting refs. |
| `bundle` | JSON | Yes | `[]` | Array of outcome entries — same shape as the `rewards`/`bundle` arrays elsewhere. May contain currency/item rewards, flags, text, events, inline bundles, and even nested `bundle_ref` entries (cycles are detected and collapsed). |
| `odds` | number | No | — | Default odds for the whole bundle when used by reference. Overridden by an inline `odds` on the `bundle_ref` entry. |
| `pickMin` | number | No | — | Default minimum number of entries to randomly select when used by reference (omit for "grant all"). Overridden by inline `pickMin`. Picks are weighted-random **with replacement**, so values larger than the number of bundle entries produce duplicate rolls of the same entry — that is how you express "roll this whole bundle N times". |
| `pickMax` | number | No | — | Default maximum number of entries to randomly select. Must be `>= pickMin` if both are set. Overridden by inline `pickMax`. Same with-replacement semantics as `pickMin` — setting `pickMax` above the number of entries simply iterates the pool to that count. |
| `version` | number | No | `1` | Schema version, incremented when the bundle's shape changes. |

### Referencing a BundleDef from any reward caller

Any outcome list that accepts entries (mission `success.rewards`, mission `failure.rewards`, lootbox `outcomes`, recipe `rewards.rewards`, gift `rewardSpec.entries`, top-level effects) can include a `bundle_ref` entry:

```json
{
  "type": "bundle_ref",
  "bundleDefId": "bundle.starter_pack",
  "odds": 50,
  "pickMin": 1,
  "pickMax": 2,
  "requirements": [{ "type": "keeper_level", "value": 5, "operator": "gte" }]
}
```

At resolve time the server inlines the BundleDef's `bundle` array into the outcome tree, applying the inline overrides for `odds`/`pickMin`/`pickMax`/`requirements` (each defaults to the BundleDef's own value when omitted). Missing or disabled bundle ids resolve to an empty bundle (logged once per id). Cycles between bundles are detected and collapsed to an empty bundle.

> **Gift claim note.** When a `bundle_ref` is used inside a [GiftDef](#giftdef) `rewardSpec`, requirements are evaluated against the **claiming player's real context** (their `user` fields and `userFlags` are loaded at claim time), so per-entry `requirements` clauses gate normally — same behaviour as missions, lootboxes, recipes, and effects.

**Worked example.** Define a "starter cache" bundle that grants 1-2 of three things, weighted:

```json
{
  "id": "bundle.starter_pack",
  "name": "Starter Pack",
  "enabled": true,
  "pickMin": 1,
  "pickMax": 2,
  "bundle": [
    { "type": "currency", "key": "soft_arcanium", "min": 50, "max": 100, "odds": 100 },
    { "type": "item", "key": "consumable_xp_potion_small", "min": 1, "max": 2, "odds": 60 },
    { "type": "item", "key": "mat_iron_ore", "min": 2, "max": 5, "odds": 40 }
  ]
}
```

Then reference it from a MissionDef success outcome with one inline override (10× the bundle's draws on success):

```json
{
  "rewards": [
    { "type": "currency", "key": "soft_arcanium", "min": 100, "max": 100 },
    { "type": "bundle_ref", "bundleDefId": "bundle.starter_pack", "pickMax": 5 }
  ]
}
```

The mission grants the flat 100 currency, then inlines the starter pack with `pickMax` raised from `2` to `5` while keeping the bundle's other defaults (`pickMin: 1`, plus the per-entry odds). Because picks are weighted-random with replacement, the mission resolves between 1 and 5 entries from a pool of 3 — duplicates are allowed, so the same entry can fire more than once. To express "always roll the whole bundle N times" rather than "pick N entries from a pool", wrap the recipe in a single inner bundle inside the BundleDef and let the consumer's `pickMax` multiply that single wrapped entry.

Updating `bundle.starter_pack` later changes the mission, the lootbox, the recipe, and the gift that all reference it — in one place.

---

## EventDefinition

Defines a named event that can be dispatched by outcome processing (via `emitEvent` entries) or other server-side triggers. Each event routes to a handler function identified by `handlerKey`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `evt_mission_gift_drop`) |
| `name` | string | Yes | — | Human-readable name |
| `version` | number | No | 1 | Schema version for forward compatibility |
| `kind` | string | No | `system` | Event kind (e.g. `system`, `seasonal`, `promotional`) |
| `handlerKey` | string | Yes | — | Identifies the server-side handler to invoke (see Handler Keys below) |
| `security` | JSON | No | `{}` | Access control rules (see Security below) |
| `inputSchema` | JSON | No | `{}` | JSON Schema for validating event payloads |
| `enabled` | boolean | No | true | Whether this event is active. Disabled events throw an error if dispatched. |

> **Note:** Payload validation is handled directly in each handler. For example, the `createGiftForPlayer` handler validates that `giftDefId` is present in the payload.

### Handler Keys

| Key | Description | Expected Payload |
|---|---|---|
| `createGiftForPlayer` | Creates a GiftInstance for the triggering player | `{ "giftDefId": "<GiftDef ID>", "contextData?": { ... } }` |

### Context Enrichment

When `createGiftForPlayer` is called, the gift system automatically enriches the `contextData` that is snapshotted alongside the reward spec. This context is available for `${path}` token resolution at claim time (see [Token Resolution in rewardSpec](#token-resolution-in-rewardspec)).

**Automatic job context** — When `sourceType` is a known job type (`MissionJob`, `CraftingJob`, `BuildingJob`), `EventService` looks up the job by `sourceId` and attaches:

```json
{
  "job": {
    "id": "<job UUID>",
    "type": "MissionJob",
    "defId": "<definition ID>",
    "status": "COMPLETED",
    "team": ["<entity ID>", "..."],
    "results": { "difficulty": "hard", "rewards": [...] },
    "data": { "skipCost": [...] },
    "timer": { "startedAt": "...", "endsAt": "..." }
  }
}
```

**Manual contextData** — The `payload.contextData` field can supply additional context for non-job sources. If both auto-built and manual context exist, they are merged (manual fields override auto-built on conflict).

**Check-in context** — The daily check-in system automatically passes:

```json
{
  "checkin": {
    "streak": 3,
    "trackId": "daily_login",
    "day": 2
  }
}
```

### Security

The `security` JSON controls which source types are allowed to dispatch this event.

```json
{
  "allowedEmitters": ["MissionJob", "CraftingJob"]
}
```

| Property | Type | Description |
|---|---|---|
| `allowedEmitters` | string[] | List of allowed `sourceType` values. If present, only these source types can dispatch this event. If omitted/empty, all source types are allowed. |

**Example:**

```json
{
  "id": "evt_mission_gift_drop",
  "name": "Mission Gift Drop",
  "kind": "system",
  "handlerKey": "createGiftForPlayer",
  "security": { "allowedEmitters": ["MissionJob"] },
  "enabled": true
}
```

---

## GiftDef

Defines a gift template that can be instantiated for players. Contains presentation data (how the gift looks) and a reward specification (what the player receives on claim).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `gift_welcome_pack`, `gift_rare_loot`) |
| `name` | string | Yes | — | Display name |
| `version` | number | No | 1 | Schema version |
| `presentation` | JSON | No | `{}` | Visual properties for the gift UI (see [Presentation](#gift-presentation)) |
| `claimRules` | JSON | No | `{}` | Rules governing how/when the gift can be claimed (see [Claim Rules](#gift-claim-rules)) |
| `rewardSpec` | JSON | No | `{}` | What the player receives on claim (see [Gift Reward Spec](#gift-reward-spec)). String values support `${path}` token resolution and `${random("a","b")}` scripting against snapshotted `contextData` at claim time. |
| `instant` | boolean | No | true | If true, gift is claimed immediately on creation (no inbox step) |
| `enabled` | boolean | No | true | Whether new instances of this gift can be created |

### Gift Presentation

Controls how the gift appears in the player's gift inbox.

```json
{
  "title": "Rare Loot Box",
  "body": "A mysterious package appeared in your inventory!",
  "iconKey": "gift_rare",
  "rarity": "RARE"
}
```

| Property | Type | Description |
|---|---|---|
| `title` | string | Display title for the gift. Also used as the notification title. |
| `body` | string | Flavor text shown to the player. Also used as the notification body. |
| `iconKey` | string | Key used to resolve the display icon |
| `rarity` | string | Visual rarity tier for styling (e.g. `COMMON`, `RARE`, `EPIC`) |

### Gift Claim Rules

Controls claiming behavior such as expiration and per-player limits.

```json
{
  "expiresInSeconds": 604800,
  "limitPerPlayer": 1
}
```

| Property | Type | Description |
|---|---|---|
| `expiresInSeconds` | number | Seconds after creation before the gift expires. Omit for no expiry. |
| `limitPerPlayer` | number | Maximum number of instances of this gift a single player can receive. Omit for unlimited. |

**Example:**

```json
{
  "id": "gift_welcome_pack",
  "name": "Welcome Pack",
  "presentation": {
    "title": "Welcome to Derp Universe!",
    "body": "A starter pack with some useful resources.",
    "iconKey": "gift_welcome",
    "rarity": "UNCOMMON"
  },
  "claimRules": { "expiresInSeconds": 604800 },
  "rewardSpec": {
    "type": "bundle",
    "entries": [
      { "type": "currency", "currencyId": "soft_arcanium", "amount": 500 },
      { "type": "item", "itemDefId": "mat_iron_ore", "qty": 10 }
    ]
  },
  "enabled": true
}
```

---

## ModalDef

Defines a server-driven modal template. Modals are constructed by the backend and delivered to the client via the `UiIntent` system. The `spec` field provides overrides applied on top of any default modal structure. All string values in the spec support `${path.to.value}` token resolution against the server context.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `modal_mission_complete`) |
| `name` | string | Yes | — | Admin-facing display name |
| `description` | string | No | — | Notes on what this modal is for |
| `version` | number | No | 1 | Schema version |
| `spec` | JSON | No | `{}` | ModalSpecV1 overrides: `{ header?, body?, buttons?, replaceBody? }` |
| `enabled` | boolean | No | true | Whether this modal is active |

### ModalSpecV1 Structure

The `spec` field is a `ModalSpecV1` object — the server-authoritative modal specification. The backend constructs a base modal from code, then optionally merges a ModalDef spec on top, giving admins the ability to customize modals without code changes.

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `version` | number | Yes | `1` | Always `1` |
| `id` | string | Yes | — | Stable modal ID used for deduplication in the modal stack |
| `kind` | string | Yes | — | Semantic kind for telemetry and styling (e.g. `mission_complete`, `gift_reveal`, `generic_info`) |
| `dismiss` | object | Yes | — | Controls which gestures can dismiss the modal (see below) |
| `header` | ModalHeader | Yes | — | Header with title, optional subtitle, icon, and banner image |
| `body` | ModalBlock[] | No | `[]` | Ordered list of content blocks rendered between header and buttons |
| `buttons` | ModalButton[] | No | `[]` | Action buttons at the bottom (typically 1–2) |
| `replaceBody` | boolean | No | `false` | When `true` in a spec overlay, replaces the server-generated body entirely. When `false` (default), the spec body is **prepended** before the server body. |
| `telemetry` | object | No | — | Analytics metadata: `sourceType`, `sourceId`, `notificationId`, `jobId`, `templateId`, `experiment` |

**Dismiss options:**

| Property | Type | Default | Description |
|---|---|---|---|
| `backdrop` | boolean | `true` | Tap outside to close |
| `x` | boolean | `true` | Show close (×) button |
| `escape` | boolean | `true` | Keyboard Escape to close |

**ModalHeader:**

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Modal title text |
| `subtitle` | string | No | Subtitle below the title |
| `icon` | AssetRef | No | Small icon shown beside the title |
| `banner` | AssetRef | No | Full-width banner image above the title |

### ModalDef Merge Behavior

When a ModalDef is associated with a game event (e.g. mission completion, gift reveal, building confirmation), the server first generates a base modal from code, then merges the ModalDef's `spec` on top:

1. **Header**: Shallow-merged per-key — spec fields override the server-generated header fields individually.
2. **Body**: If `replaceBody: true`, the spec body replaces the server body entirely. Otherwise, the spec body blocks are **prepended** before the server-generated body blocks.
3. **Buttons**: If the spec has any buttons, they **replace** the server-generated buttons entirely.
4. **Token resolution** runs before the merge — so `${path}` tokens in the spec are resolved against the server context first.

### Block Types

Modal body blocks are discriminated by the `type` field. All block types support an optional `from` field (see [The `from` Field](#the-from-field)).

#### richText

Formatted rich text content using the `RichTextDoc` structure. Tokens inside RichTextDoc use `{ t: "token", key: "path" }` nodes instead of `${path}` string syntax.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"richText"` | Yes | Block type |
| `doc` | RichTextDoc | Yes | Rich text document (array of paragraph/heading/link nodes) |

**`from` behavior:** String → wraps as single paragraph. RichTextDoc array → used directly as `doc`.

#### divider

Horizontal rule separator. No additional fields.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"divider"` | Yes | Block type |

#### image

A full-width image with optional caption.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"image"` | Yes | Block type |
| `image` | AssetRef | Yes | Image reference (`{ assetKey, alt? }`) |
| `caption` | string | No | Caption text below the image |

**`from` behavior:** Object → extracts `{ assetKey, alt?, caption? }`. String → used as `assetKey`.

#### metaRows

A table of label/value pairs (e.g. mission stats, item properties).

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"metaRows"` | Yes | Block type |
| `rows` | array | Yes | Array of `{ label: string, value: string }` pairs |

**`from` behavior:** Array → used as rows directly. Object → entries converted to `{ label: key, value: String(val) }`.

#### timer

Countdown timer block that ticks in real time.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"timer"` | Yes | Block type |
| `endsAt` | string | Yes | ISO 8601 timestamp when the timer expires |
| `label` | string | No | Label text beside the timer |

**`from` behavior:** String → used as `endsAt`. Object → extracts `{ endsAt, label? }`.

#### progress

A labeled progress bar.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"progress"` | Yes | Block type |
| `current` | number | Yes | Current value |
| `max` | number | Yes | Maximum value |
| `label` | string | No | Label text |

**`from` behavior:** Object → extracts `{ current, max, label? }`.

#### rewardsPreview

Read-only preview of potential rewards (shown before an action).

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"rewardsPreview"` | Yes | Block type |
| `items` | RewardItem[] | Yes | Array of reward items (`{ name, qty?, assetKey?, rarity?, note? }`) |

**`from` behavior:** Array → each entry mapped via `mapRewardItem` (extracts `name`, `qty`, `assetKey`, `rarity`, `note`).

#### rewardsList

Claimed rewards list (shown after a completed action).

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"rewardsList"` | Yes | Block type |
| `title` | string | No | Section title |
| `items` | RewardItem[] | Yes | Array of reward items |

**`from` behavior:** Array → each entry mapped via `mapRewardItem`.

#### inventoryDelta

Shows inventory changes (items added or removed with signed quantities).

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"inventoryDelta"` | Yes | Block type |
| `items` | array | Yes | Array of `{ name: string, qtyDelta: number, assetKey?: string }` |

**`from` behavior:** Array → each entry extracts `{ name, qtyDelta, assetKey? }`.

#### giftReveal

Animated gift reveal block showing a gift and its contents.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"giftReveal"` | Yes | Block type |
| `gift` | object | Yes | `{ giftId: string, title: string, image?: AssetRef }` |
| `rewards` | RewardItem[] | No | Rewards to display inside the reveal |

**`from` behavior:** Object with `gift` key → merges into `gift` field and maps `rewards`. Object with `giftId`/`title` at root → merges directly.

#### error

Inline error message block.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"error"` | Yes | Block type |
| `message` | string | Yes | Error message text |

**`from` behavior:** String → used as `message`. Object → extracts `message` field.

### The `from` Field

Every block type supports an optional `from` string property. This is the primary mechanism for connecting dynamic server data to modal blocks without hardcoding values in the spec.

- **Value:** A dot-path into the resolved server context (e.g. `"results.rewards"`, `"def.name"`, `"costs"`)
- **Evaluation order:** `from` is resolved first, populating the block's data fields from the context path. Then `${path}` token resolution runs on all resulting string values.
- **Stripping:** The `from` field is always deleted before the block is sent to the client — the client never sees it.

**Example spec body using `from`:**

```json
{
  "body": [
    { "type": "richText", "doc": [{ "t": "p", "c": [{ "t": "text", "v": "Mission: ${def.name}" }] }] },
    { "type": "rewardsList", "title": "Rewards", "from": "results.rewards" },
    { "type": "metaRows", "from": "results.stats" }
  ]
}
```

In this example, the `rewardsList` block's `items` are populated from `ctx.results.rewards`, and the `metaRows` block's `rows` are populated from `ctx.results.stats`. The richText block uses inline `${def.name}` token resolution.

### Token Resolution in Modals

All string fields in a ModalSpecV1 (header, body blocks, buttons) support `${path.to.value}` token syntax, resolved against the server context before the modal is sent to the client.

**Rules:**
- Works recursively in header fields, block properties, and button labels.
- Unresolved tokens (no matching path in context) are left as-is — they are **not** collapsed to empty string.
- Numeric coercion is not applied — all substitutions produce strings.
- **RichTextDoc exception:** Inside `richText` blocks, use the `{ t: "token", key: "path.to.value" }` node type instead of `${path}` string syntax. Text nodes within RichTextDoc still support `${path}` in the `v` field.

### Server Context Shapes

The context object passed to the resolver depends on what triggered the modal. ModalDef specs can reference any of these paths via `from` or `${path}`.

#### JobContext

Used for mission, crafting, and building job completion modals.

```json
{
  "job": { "id": "<UUID>", "type": "MissionJob", "defId": "<def ID>", "status": "COMPLETED" },
  "results": {
    "success": true,
    "rewards": [],
    "entityResults": [
      { "id": "<UUID>", "name": "Dave", "oldLevel": 3, "newLevel": 4, "xpGained": 25, "leveledUp": true, "injured": false }
    ]
  },
  "data": {},
  "def": {},
  "timer": {},
  "team": [
    { "id": "<UUID>", "name": "Dave", "level": 4, "xp": 10, "stats": { "ATK": 5 }, "traits": { "head": "Ninja" } }
  ]
}
```

| Path | Description |
|---|---|
| `job.id` | Job UUID |
| `job.type` | `MissionJob`, `CraftingJob`, or `BuildingJob` |
| `job.defId` | The definition ID (MissionDef, RecipeDef, etc.) |
| `job.status` | Job status (e.g. `COMPLETED`, `FAILED`) |
| `results.*` | Full job results JSON (rewards, difficulty, rolls, etc.) |
| `results.entityResults` | Array of per-entity outcomes from mission completion (MissionJob only) |
| `results.entityResults.N.id` | Entity UUID |
| `results.entityResults.N.name` | Entity display name |
| `results.entityResults.N.oldLevel` | Level before XP was applied |
| `results.entityResults.N.newLevel` | Level after XP was applied |
| `results.entityResults.N.xpGained` | Amount of XP gained |
| `results.entityResults.N.leveledUp` | `true` if `newLevel > oldLevel` |
| `results.entityResults.N.injured` | Reserved for future injury system (always `false`) |
| `data.*` | Full job data JSON (skip cost, assigned entities, etc.) |
| `def.*` | The full definition record (name, description, rules, etc.) |
| `timer.*` | Timer JSON (startedAt, endsAt, duration, etc.) |
| `team` | Array of entity snapshots (current state at modal-build time). Empty for CraftingJob/BuildingJob |
| `team.N.id` | Entity UUID |
| `team.N.name` | Entity display name |
| `team.N.level` | Current entity level |
| `team.N.xp` | Current XP within level |
| `team.N.stats` | Entity stats object (`ATK`, `DEF`, `SPD`, `FOC`, `LCK`, `VIT`) |
| `team.N.traits` | Entity traits object (slot → archetype map) |

**Examples:**
- `${team.0.name}` → first entity's name (e.g. `"Dave"`)
- `${results.entityResults.0.leveledUp}` → whether the first entity leveled up (e.g. `"true"`)
- `${results.entityResults.0.newLevel}` → first entity's new level (e.g. `"4"`)

#### GiftContext

Used for gift reveal modals.

```json
{
  "gift": { "id": "<UUID>", "status": "UNCLAIMED" },
  "snapshot": {},
  "presentation": {}
}
```

| Path | Description |
|---|---|
| `gift.id` | GiftInstance UUID |
| `gift.status` | Current gift status |
| `snapshot.*` | Full snapshotted gift data (rewardSpec, presentation, contextData) |
| `presentation.*` | Shortcut for `snapshot.presentation` |

#### BuildingContext

Used for build-confirm and upgrade-confirm modals.

```json
{
  "building": { "id": "<def ID>", "name": "Workshop", "description": "..." },
  "def": {},
  "costs": [{ "id": "soft_arcanium", "amount": 500, "baseAmount": 500 }],
  "currentLevel": 0,
  "nextLevel": 1,
  "timerDuration": 3600
}
```

| Path | Description |
|---|---|
| `building.id` | Definition ID |
| `building.name` | Definition display name |
| `building.description` | Definition description |
| `def.*` | Full building/room definition |
| `costs` | Array of resource costs for the action |
| `currentLevel` | Current building level |
| `nextLevel` | Target level after upgrade |
| `timerDuration` | Construction/upgrade duration in seconds |

### ModalButton

Buttons rendered at the bottom of the modal.

| Property | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Stable button ID for deduplication and telemetry |
| `label` | string | Yes | Button label text (supports `${path}` tokens) |
| `variant` | ButtonVariant | Yes | Visual style (`primary`, `secondary`, `danger`, etc.) |
| `disabled` | boolean | No | Whether the button is disabled |
| `action` | ModalAction | Yes | Action to execute on press (see below) |
| `requiresConfirm` | object | No | If set, shows an inline confirmation prompt before executing: `{ title, body (RichTextDoc), confirmLabel?, cancelLabel? }` |

**ModalAction types:**

| Action Type | Description | Key Fields |
|---|---|---|
| `CLOSE_MODAL` | Dismiss the modal | — |
| `NAVIGATE` | Push a client-side route | `route`, `params?` |
| `ACK_NOTIFICATION` | Mark a notification as read | `notificationId` |
| `COMPLETE_JOB` | Complete a job and collect rewards | `jobId` |
| `CLAIM_GIFT` | Claim a gift for the player | `giftId` |
| `OPEN_INVENTORY` | Navigate to inventory screen | — |
| `OPEN_MISSIONS` | Navigate to missions screen | — |
| `OPEN_CRAFTING` | Navigate to crafting screen | — |
| `REPEAT_MISSION` | Re-launch a mission | `defId`, `entityIds?` |
| `CRAFT_AGAIN` | Re-submit a crafting job | `recipeDefId` |
| `API_CALL` | Arbitrary API call by key | `apiKey`, `payload?` |

---

## LootboxDef

Defines a lootbox with a weighted outcome pool. Items of type `LOOTBOX` reference a `LootboxDef` via `data.lootboxDefId`. When a player opens a lootbox item, the server performs `rollCount` independent rolls against the `outcomes` pool using deterministic seeded RNG.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Optional flavor description |
| `version` | number | No | 1 | Schema version |
| `iconKey` | string | No | — | Asset key for the lootbox icon |
| `outcomes` | JSON array | No | `[]` | Weighted outcome pool — same `RewardEntry` format as MissionDef rewards |
| `rollCount` | number | No | 1 | Number of independent rolls per open |
| `enabled` | boolean | No | true | Whether this lootbox can be opened |

### Lootbox Outcomes Format

The `outcomes` array uses the same weighted `RewardEntry` format as MissionDef reward entries. Each entry has a `type`, optional `key`, min/max range, and an `odds` field (percentage chance per roll):

```json
[
  { "type": "currency", "key": "soft_arcanium", "min": 100, "max": 500, "odds": 70 },
  { "type": "currency", "key": "premium_gems", "min": 10, "max": 25, "odds": 20 },
  { "type": "item", "key": "mat_rare_gem", "min": 1, "max": 1, "odds": 5 },
  { "type": "item", "key": "mat_legendary_shard", "min": 1, "max": 1, "odds": 1 }
]
```

Each roll independently evaluates all entries. With `rollCount: 3`, the player gets three separate draws from the pool.

---

## CheckInDef

Defines a daily check-in track. Multiple tracks can run independently per player. Each track has a configurable cycle of rewards, frequency rules, and streak behavior.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Optional description |
| `rewards` | JSON array | No | `[]` | Per-day reward entries (see [CheckInDayReward](#checkindayreward)) |
| `cycleLength` | number | No | 7 | Streak wraps after this many days |
| `requireStreak` | boolean | No | false | If true, missing a window resets the streak to 0 |
| `allowReclaim` | boolean | No | false | If `requireStreak: true` and streak resets, allow re-claiming the day-0 gift |
| `frequency` | JSON | No | `{ "type": "daily" }` | How often a check-in window opens (see [CheckInFrequency](#checkinfrequency)) |
| `enabled` | boolean | No | true | Whether this check-in track is active |

### CheckInDayReward

Each entry in `rewards` maps a cycle day to a gift:

```json
[
  { "day": 0, "giftDefId": "gift_checkin_day1" },
  { "day": 1, "giftDefId": "gift_checkin_day2" },
  { "day": 2, "giftDefId": "gift_checkin_day3" },
  { "day": 6, "giftDefId": "gift_checkin_day7_bonus" }
]
```

| Property | Type | Description |
|---|---|---|
| `day` | number | Zero-indexed day within the cycle (0 = first day) |
| `giftDefId` | string | References a [GiftDef](#giftdef) to award on this day |

### CheckInFrequency

Controls how often the check-in window opens:

```json
{ "type": "daily" }
```

```json
{ "type": "every_x_days", "interval": 3 }
```

```json
{ "type": "weekly" }
```

```json
{ "type": "monthly" }
```

| Property | Type | Description |
|---|---|---|
| `type` | string | One of: `daily`, `every_x_days`, `weekly`, `monthly` (see below) |
| `interval` | number | Only used when `type: "every_x_days"` — number of days between windows |

| Type Value | Reset Behavior |
|---|---|
| `daily` | Resets at 00:00 UTC every day |
| `every_x_days` | Uses `interval` (integer) to calculate fixed windows from epoch |
| `weekly` | Resets every Monday at 00:00 UTC |
| `monthly` | Resets on the 1st of every month at 00:00 UTC |

---

## QuestDef

Defines a quest with one or more objectives tracked against player telemetry events. All objectives must complete before the player can claim the reward. Quests can be one-time or repeatable.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `category` | string | No | — | Optional grouping category for the UI |
| `objectives` | JSON array | No | `[]` | List of objectives; all must complete to finish the quest (see [QuestObjective](#questobjective)) |
| `rewardSpec` | JSON | No | `{}` | Reward granted on claim (uses [Gift Reward Spec](#gift-reward-spec) format) |
| `requirements` | JSON array | No | `[]` | Conditions to unlock the quest (uses [Requirements](#requirements) format) |
| `repeatable` | boolean | No | false | If true, quest resets after claim and can be completed again |
| `enabled` | boolean | No | true | Whether the quest is active |
| `sortOrder` | number | No | 0 | Display sort order (lower = first) |

### QuestObjective

Each entry in `objectives` describes one trackable goal. Objectives are tracked by array index (no `id` field) and matched against player telemetry events:

```json
[
  {
    "eventType": "mission_complete",
    "key": "exploration",
    "target": 5,
    "description": "Complete 5 exploration missions",
    "dataFilter": { "missionType": "exploration" }
  },
  {
    "eventType": "crafting_complete",
    "target": 3,
    "description": "Craft 3 items"
  }
]
```

| Property | Type | Required | Description |
|---|---|---|---|
| `eventType` | string | Yes | Telemetry event type to track (e.g. `mission_complete`, `lootbox_opened`, `checkin_complete`) |
| `target` | number | No | How many matching events are required to complete this objective (defaults to `1` if omitted) |
| `description` | string | No | Human-readable description shown in the UI |
| `key` | string | No | Optional key that must match `PlayerEvent.key` for the event to count |
| `dataFilter` | object | No | Optional shallow key-value pairs that the telemetry event data must match for the event to count |

---

## ShopItemDef

Defines a purchasable item in the game store. Supports mixed currency/item costs, sale pricing with strikethrough, limited-time availability with countdown, and badge labels.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `gems_100`, `bundle_starter`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | `""` | Short description shown on the card |
| `tab` | string | No | `"featured"` | Store tab: `featured`, `currencies`, `bundles`, or `items` |
| `cost` | JSON array | No | `[]` | What the player pays (see [ShopCostEntry](#shopcostentry)) |
| `originalCost` | JSON array | No | — | Original price for strikethrough sale display (same format as `cost`) |
| `contents` | JSON array | No | `[]` | What the player receives (same format as `cost`) |
| `badge` | string | No | — | Optional badge label (e.g. `HOT`, `NEW`, `SALE`, `BEST VALUE`) |
| `badgeColor` | string | No | — | CSS color for the badge background (e.g. `#ef4444`) |
| `imageUrl` | string | No | — | URL or asset key for the card image |
| `displayOrder` | number | No | 0 | Sort order within the tab (lower = first) |
| `enabled` | boolean | No | true | Whether the item appears in the store |
| `limitedUntil` | string | No | — | ISO 8601 datetime; item shows a countdown and hides after this time |

### ShopCostEntry

The `cost`, `originalCost`, and `contents` arrays all use the same `ShopCostEntry` format. You can freely mix currency and item entries in the same array:

```json
[
  { "type": "currency", "id": "premium_gems", "amount": 500 },
  { "type": "item", "id": "mat_rare_gem", "amount": 3 }
]
```

| Property | Type | Description |
|---|---|---|
| `type` | string | `"currency"` or `"item"` |
| `id` | string | Currency ID (for `currency`) or ItemDef ID (for `item`) |
| `amount` | number | Quantity |

### ShopItemDef Example

```json
{
  "id": "bundle_starter_pack",
  "name": "Starter Pack",
  "description": "Everything a new adventurer needs to get started!",
  "tab": "bundles",
  "cost": [{ "type": "currency", "id": "premium_gems", "amount": 299 }],
  "originalCost": [{ "type": "currency", "id": "premium_gems", "amount": 499 }],
  "contents": [
    { "type": "currency", "id": "soft_arcanium", "amount": 5000 },
    { "type": "item", "id": "mat_iron_ore", "amount": 50 },
    { "type": "item", "id": "consumable_boost_small", "amount": 5 }
  ],
  "badge": "SALE",
  "badgeColor": "#ef4444",
  "imageUrl": "bundles/starter_pack.png",
  "displayOrder": 1,
  "enabled": true,
  "limitedUntil": "2026-04-01T00:00:00Z"
}
```

---

## NftCollectionDef

Links an on-chain NFT collection to either an [EntityDefinition](#entitydefinition) or a [LocationDefinition](#locationdefinition), enabling NFT-gated claims. When a player syncs their connected wallet, the server checks their NFT holdings against all active collections and creates or transfers the corresponding instance to them.

**Two collection modes:**
- **Entity mode** (`entityDefinitionId` set): Used for character NFTs (e.g. Derp Birds, Derplings). Entity rows must be pre-imported into the database before wallet sync can claim them. Set `entityDefinitionId` to the target entity definition.
- **Location mode** (`locationDefinitionId` set): Used for outpost/location NFTs (e.g. Derp Outposts). `LocationInstance` rows are created on-demand during wallet sync — no pre-import step is required. Set `locationDefinitionId` to the target location definition.

Exactly one of `entityDefinitionId` or `locationDefinitionId` should be set on a given collection.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier |
| `name` | string | Yes | — | Admin-facing display name |
| `chain` | string | Yes | — | Blockchain: `CARDANO`, `ETH`, `BASE`, or `MATIC` |
| `collectionId` | string | Yes | — | On-chain collection or policy ID used to look up tokens |
| `entityDefinitionId` | string | No | — | References an [EntityDefinition](#entitydefinition) — the entity type created when a token is claimed. Mutually exclusive with `locationDefinitionId`. |
| `locationDefinitionId` | string | No | — | References a [LocationDefinition](#locationdefinition) — the location type created when a token is claimed. Mutually exclusive with `entityDefinitionId`. |
| `mintMode` | string | No | `one_per_token` | How many instances one token can claim (only `one_per_token` supported) |
| `active` | boolean | No | true | Whether this collection is active for wallet syncing and claiming |
| `data` | JSON | No | `{}` | Freeform extra configuration data |

> **Unique constraint:** `[chain, collectionId]` — each on-chain collection can only be registered once per chain.

**Supported chains:**
- `CARDANO` — uses Blockfrost to verify CIP-30 wallet assets against the policy ID
- `ETH`, `BASE`, `MATIC` — uses Alchemy to verify EVM wallet token ownership

**Claim tracking:** Once a token is claimed, the resulting `Entity` record stores `nftAssetId` (format: `{chain}:{collectionId}:{assetId}`) and `nftCollectionDefId`, preventing duplicate claims for the same token.

**Example:**

```json
{
  "id": "nft_cardano_dp",
  "name": "Derp Birds (Cardano)",
  "chain": "CARDANO",
  "collectionId": "e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0",
  "entityDefinitionId": "derp_bird",
  "mintMode": "one_per_token",
  "active": true,
  "data": {}
}
```

### Registered Collections

All collections below are seeded at startup via `BootstrapService.seedNftCollections()` and are idempotent (upsert on `id`).

| Collection ID | Name | Chain | Policy ID | Entity/Location Def | Kind |
|---|---|---|---|---|---|
| `nft_cardano_dp` | Derp Birds (Cardano) | CARDANO | `e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0` | `derp_bird` | character |
| `nft_cardano_derplings` | Derplings (Cardano) | CARDANO | `b2d25f829ebb7f4c97b5e847923a1115b23ebf78000722c229c9c9f7` | `derpling` | character |
| `nft_cardano_derp_apes` | Derp Apes (Cardano) | CARDANO | `f4873b426a498350c579690bd1f4a369d5d7b521c778acf322f77334` | `derp_ape` | character |
| `nft_cardano_preds` | Preds (Cardano) | CARDANO | `73056bffdf28f82da5db1f5ac7c06d030c8a551f43889f7f85746a4a` | `pred` | character |
| `nft_cardano_perps` | Perps (Cardano) | CARDANO | `e6ba9c0ff27be029442c32533c6efd956a60d15ecb976acbb64c4de0` | `perp` | character |
| `nft_cardano_outposts` | Derp Outposts (Cardano) | CARDANO | `a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5` | `derp_outpost` | location |

> **Note on Outposts:** `derp_outpost` has both a `LocationDefinition` (for player-owned outpost instances) and a placeholder `EntityDefinition` (id: `derp_outpost`) seeded alongside it. The placeholder EntityDefinition allows the existing admin import pipeline (`POST /nft/collections/nft_cardano_outposts/import`) to function without errors — imported Outpost NFTs will create Entity rows rather than LocationInstance rows. A dedicated location-instance sync path is tracked as a follow-up (task #282).

---

## EffectDef

Defines a reusable effect blueprint in the Generic Effects System. Effects are universal modifiers that can boost stats, multiply rewards, speed up timers, grant traits, and more. EffectDefs are referenced by consumable items (via `consumableData.effects[].effectDefId`), and can be applied from missions, quests, check-ins, shops, buildings, or admin actions.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `eff_xp_boost_30m`, `eff_stat_atk_flat`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text describing the effect |
| `iconKey` | string | No | — | Key used to resolve the display icon |
| `category` | EffectCategory enum | Yes | — | What the effect modifies (see [Effect System Enums](#effect-system-enums)) |
| `valueMode` | EffectValueMode enum | Yes | — | How the value is applied (see [Effect System Enums](#effect-system-enums)) |
| `durationModel` | EffectDurationModel enum | Yes | — | How the effect expires (see [Effect System Enums](#effect-system-enums)) |
| `stackingRule` | EffectStackingRule enum | No | `no_stack` | Behavior when the same effect is applied again (see [Effect System Enums](#effect-system-enums)) |
| `targetType` | EffectTargetType enum | Yes | — | What the effect targets (see [Effect System Enums](#effect-system-enums)) |
| `value` | float | No | — | Scalar value for the effect (interpretation depends on `valueMode`) |
| `stats` | JSON | No | — | Per-stat values `{ ATK?, DEF?, SPD?, FOC?, LCK?, VIT? }` (for `stat_boost` category) |
| `trait` | string | No | — | Trait archetype name (for `trait_grant` category) |
| `durationSec` | integer | No | — | Duration in seconds (for `timed` duration model) |
| `durationTicks` | integer | No | — | Duration in game ticks (for `tick_based` duration model) |
| `maxStacks` | integer | No | — | Maximum stack count (for `stack_capped` stacking rule) |
| `maxUses` | integer | No | — | Number of uses before the effect expires (for `count_based` duration model) |
| `cap` | float | No | — | Maximum total value when stacking |
| `resourceId` | string | No | — | Associated resource ID (for `production_rate`, `storage_capacity`, `currency_multiplier`, `cost_discount`) |
| `sessionType` | string | No | — | Session scope key (for `session` duration model, e.g. `"mission"`) |
| `meta` | JSON | No | `{}` | Freeform metadata for custom logic |
| `enabled` | boolean | No | true | Whether this effect definition is active |

**Example — XP boost for 30 minutes:**

```json
{
  "id": "eff_xp_boost_30m",
  "name": "XP Scroll (30m)",
  "description": "Boosts all XP earned by 50% for 30 minutes",
  "iconKey": "scroll_xp",
  "category": "xp_multiplier",
  "valueMode": "percent_add",
  "durationModel": "timed",
  "stackingRule": "replace",
  "targetType": "player",
  "value": 50,
  "durationSec": 1800,
  "enabled": true
}
```

**Example — flat ATK stat boost (permanent until removed):**

```json
{
  "id": "eff_stat_atk_flat_10",
  "name": "ATK +10",
  "category": "stat_boost",
  "valueMode": "flat_add",
  "durationModel": "until_removed",
  "stackingRule": "stack_additive",
  "targetType": "entity",
  "stats": { "ATK": 10 },
  "enabled": true
}
```

---

## SoundDef

Defines a single audio asset (music track, SFX clip, UI beep, or ambient loop) that the frontend AudioEngine can play. SoundDefs are uploaded and managed via the Admin Audio Manager at `/admin/audio`. Each SoundDef has a dot-namespaced `key` that the AudioEngine uses internally and a `bus` that maps it to one of the four volume sliders (music, sfx, ui, ambient).

When `fileKey` is null the sound definition acts as a placeholder — the AudioEngine will silently no-op when asked to play it, so the game remains functional while real audio files are being produced.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Yes (auto) | — | UUID primary key |
| `key` | string | Yes | — | Unique dot-namespaced action key (e.g. `sfx.mission.success`, `music.main_menu`). Must be globally unique. |
| `name` | string | Yes | — | Human-readable display name shown in the Admin Audio Manager |
| `bus` | AudioBus enum | Yes | — | Audio bus: `music`, `sfx`, `ui`, or `ambient` |
| `fileKey` | string | No | null | Object storage key for the uploaded file (e.g. `audio/sfx_mission_success.mp3`). null = no file uploaded yet |
| `description` | string | No | null | Optional notes describing where this sound is used |
| `enabled` | boolean | No | true | When false, the AudioEngine skips this SoundDef even if a SoundMapping references it |
| `createdAt` | datetime | Auto | — | Record creation timestamp |
| `updatedAt` | datetime | Auto | — | Record last-update timestamp |

### AudioBus Enum

| Value | Description |
|---|---|
| `music` | Background music tracks; long-form, looped. Controlled by the Music volume slider. |
| `sfx` | Game action sound effects; short clips. Controlled by the SFX volume slider. |
| `ui` | Interface sounds (button clicks, modals, notifications). Controlled by the UI volume slider. |
| `ambient` | Environmental background loops. Controlled by the Ambient volume slider. |

**Example — mission success SFX placeholder:**

```json
{
  "key": "sfx.mission.success",
  "name": "Mission Success SFX",
  "bus": "sfx",
  "fileKey": null,
  "description": "Mission completes with success outcome",
  "enabled": true
}
```

**Example — uploaded main menu music:**

```json
{
  "key": "music.main_menu",
  "name": "Main Menu Music",
  "bus": "music",
  "fileKey": "audio/music_main_menu.mp3",
  "description": "Plays on app load before navigating to a game location",
  "enabled": true
}
```

---

## SoundMapping

Maps a game action key to a SoundDef for runtime playback. Multiple SoundMapping rows with the same `actionKey` enable weighted-random sound selection — the AudioEngine picks one using weighted probability each time `audioEngine.play(actionKey)` is called.

The full set of active mappings is fetched at AudioEngine initialization via `GET /audio/config` and cached in memory. No further network requests are made during gameplay.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Yes (auto) | — | UUID primary key |
| `actionKey` | string | Yes | — | Game action key (e.g. `sfx.mission.success`). Multiple rows may share the same actionKey for weighted-random selection. |
| `soundDefId` | string | Yes | — | FK to SoundDef.id — the sound asset to play |
| `weight` | integer | No | 1 | Relative probability weight. All mappings for the same actionKey are combined: weight 2 is twice as likely as weight 1. |
| `enabled` | boolean | No | true | When false, excluded from the audio config response |
| `createdAt` | datetime | Auto | — | Record creation timestamp |
| `updatedAt` | datetime | Auto | — | Record last-update timestamp |

**Example — three variants for mission success with different probabilities:**

```json
[
  { "actionKey": "sfx.mission.success", "soundDefId": "<id-of-fanfare-1>", "weight": 3 },
  { "actionKey": "sfx.mission.success", "soundDefId": "<id-of-fanfare-2>", "weight": 2 },
  { "actionKey": "sfx.mission.success", "soundDefId": "<id-of-fanfare-3>", "weight": 1 }
]
```

Fanfare 1 plays 50% of the time, fanfare 2 plays 33%, and fanfare 3 plays 17%.

### Standard Action Keys

The following action keys are seeded as placeholder SoundDefs and are wired to audio triggers in the frontend:

| Key | Bus | When it fires |
|---|---|---|
| `music.main_menu` | music | App load, home page when no active season |
| `music.default` | music | Any page without a specific location music track |
| `music.mission_active` | music | Missions page |
| `music.location.<id>` | music | Location page for the given location ID |
| `music.season.<id>` | music | Home page when `activeSeason.id` is set — overrides `music.main_menu` |
| `sfx.mission.start` | sfx | Mission job submitted (`StartMission` command) |
| `sfx.mission.success` | sfx | Mission completes — played on `CompleteMission` |
| `sfx.mission.fail` | sfx | Mission completes with failure outcome (future: result-aware wiring) |
| `sfx.craft.start` | sfx | Crafting job submitted (`StartCrafting` command) |
| `sfx.craft.complete` | sfx | Crafting job collected (`CollectCrafting` command) |
| `sfx.lootbox.open` | sfx | Lootbox or gift package opened from inventory |
| `sfx.lootbox.rare` | sfx | Rare/legendary item revealed in lootbox (future: result-aware) |
| `sfx.reward.checkin` | sfx | Daily check-in day claimed |
| `sfx.reward.gift` | sfx | Pending gift claimed from Rewards page |
| `sfx.reward.quest_complete` | sfx | Quest reward claimed (`ClaimQuestReward`) |
| `sfx.economy.currency_earn` | sfx | Significant currency gain (future: patch-based detection) |
| `sfx.economy.purchase` | sfx | Store item purchased (`ShopPurchase` command) |
| `sfx.player.level_up` | sfx | Keeper level increases (detected via Redux `keeperLevel` changes) |
| `sfx.player.prestige` | sfx | Prestige action (future: prestige command wiring) |
| `sfx.entity.level_up` | sfx | Entity level increases (future: entity progression wiring) |
| `sfx.entity.tier_upgrade` | sfx | Entity tier advances (future: tier upgrade wiring) |
| `sfx.building.complete` | sfx | Building construction finished (`CompleteBuilding`) |
| `sfx.building.upgrade` | sfx | Building upgrade completes (future: upgrade command wiring) |
| `sfx.building.toggle` | sfx | Building enabled or disabled via toggle |
| `sfx.location.claim` | sfx | Resources claimed from location (`ClaimLocation`) |
| `sfx.season.start` | sfx | New season detected via Redux `activeSeason.id` change |
| `ui.modal_open` | ui | Any game modal opens |
| `ui.modal_close` | ui | Any game modal closes |
| `ui.notification` | ui | New unread notification arrives |
| `ui.tab_switch` | ui | Navigation between pages |
| `ui.button_click` | ui | Generic button click (available via `useAudioTrigger` hook) |
| `ui.error` | ui | Error feedback fires (wired to failed commands) |
| `ambient.default` | ambient | Fallback ambient loop for pages without a specific ambient track |
| `ambient.location.<id>` | ambient | Location-specific ambient loop played on location pages |

---

## HomeBannerDef

Generic data-driven banner shown at the top of the homescreen. Drives announcements, sales, season info, and event call-outs through a single pipeline. Replaces the legacy hardcoded season banner — when `config.deriveFromActiveSeason` is true the active Season's `displayName`/`endsAt`/`tagline` are substituted into the banner at fetch time.

The active set (status=`active`, current time within `startsAt`/`endsAt` window, sorted by `priority` descending) is shipped in the bootstrap snapshot under `homeBanners` and broadcast in real-time via SSE (`home_banners.updated`) when admin records change. Zero banners hides the slot; one banner renders a static card; two or more render a swipeable carousel with page dots and auto-advance.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `banner_summer_sale`) |
| `name` | string | Yes | — | Admin-facing label |
| `title` | string | Yes | — | Big headline shown on the card (rendered uppercase) |
| `subtitle` | string | No | null | Small line above the body. When `endsAt` is set, the subtitle becomes the prefix for the live countdown (`<subtitle>: <Xd Yh>`) |
| `description` | string | No | null | Body copy beneath the title |
| `backgroundImage` | string | No | null | Asset key or URL for the card background image |
| `ctaLabel` | string | No | null | CTA button label (omit/blank to hide the button) |
| `ctaRoute` | string | No | null | Route to navigate to on tap or CTA click (e.g. `/missions`) |
| `priority` | integer | No | 0 | Higher priority appears earlier in the carousel order |
| `startsAt` | datetime | No | null | Banner is hidden before this datetime |
| `endsAt` | datetime | No | null | Banner is hidden after this datetime; powers the live countdown subtitle |
| `status` | enum | No | `active` | One of `active`, `draft`, `archived` |
| `seasonId` | string | No | null | Optional FK to Season — used by `deriveFromActiveSeason` |
| `config` | json | No | `{}` | See **Config Format** below |

### Config Format

```ts
{
  autoAdvance?: boolean;        // false disables auto-advance for the whole rotation
  autoAdvanceMs?: number;       // ms between cards (default 7000); the longest value among active cards wins
  tagline?: string;             // overrides `description` as the body copy line
  deriveFromActiveSeason?: boolean; // when true and a Season is active, substitutes the season's displayName/endsAt/tagline
}
```

### Real-time Updates

Admin create/update/delete on `homeBannerDef` recomputes the active set and broadcasts `home_banners.updated` over SSE. The web `SyncEngine` dispatches `setHomeBanners` so all connected clients refresh without re-bootstrap. Expiry is also enforced live on the client (`useHomeBanners(nowMs)`) so banners drop out the moment their `endsAt` passes.

---

## Job

The unified Job table stores all timer-based player activities: missions, crafting, and building construction. Unlike the definition tables above (which are game design data), Jobs are runtime records created when a player starts an activity.

Each job references a definition table via `defId` and stores only the computed timing values -- duration and boost properties are always read from the parent definition at creation time.

### JobType Enum

| Value | Definition Table | Description |
|---|---|---|
| `MissionJob` | `MissionDef` | An entity team sent on a mission |
| `CraftingJob` | `RecipeDef` | A crafting recipe in progress |
| `BuildingJob` | `BuildingDef` | A building under construction |

### Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier, auto-generated |
| `userId` | string | Yes | — | The player who owns this job |
| `type` | JobType enum | Yes | — | One of: `MissionJob`, `CraftingJob`, `BuildingJob` |
| `defId` | string | Yes | — | ID of the definition record (MissionDef, RecipeDef, or BuildingDef) |
| `status` | string | No | `"active"` | Current state: `active`, `ready_notified`, `completed`, or `failed` |
| `timer` | JSON | No | `{}` | Computed timing values (see [Job Timer](#job-timer)) |
| `team` | JSON | No | `[]` | Array of entity IDs assigned to this job (see [Job Team](#job-team)) |
| `results` | JSON | No | `null` | Outcome data recorded on completion (see [Job Results](#job-results)) |
| `data` | JSON | No | `{}` | Domain-specific fields (see [Job Data](#job-data)) |
| `createdAt` | datetime | Auto | now | When the job was created |
| `updatedAt` | datetime | Auto | now | When the job was last modified |

### Job Timer

Stores the computed tick values for when the job starts and how long it lasts. These are calculated at job creation time using the definition's `timer.duration` and the current tick rate.

```json
{
  "startTick": 48230,
  "durationTicks": 1800
}
```

| Property | Type | Description |
|---|---|---|
| `startTick` | number | The global tick at which the job started |
| `durationTicks` | number | How many ticks until the job completes |

The job is complete when `currentTick >= startTick + durationTicks`.

Properties like `boostable`, `skipable`, `skip_cost`, and `skip_type` are **not** stored on the Job -- they live on the definition's [Timer](#timer) and are referenced from there when needed.

### Job Team

An array of entity IDs assigned to the job. Used primarily by MissionJobs; CraftingJobs store a single entity ID, and BuildingJobs typically have an empty team.

**MissionJob example** (multiple entities):
```json
["entity_uuid_1", "entity_uuid_2", "entity_uuid_3"]
```

**CraftingJob example** (single entity):
```json
["entity_uuid_1"]
```

**BuildingJob example** (no entities):
```json
[]
```

### Job Results

Populated when a job completes. Stores the outcome for auditing and display. Structure varies by job type.

**MissionJob result:**
```json
{
  "success": true,
  "rewards": [
    { "type": "entity_xp", "amount": 65 },
    { "type": "currency", "key": "soft_arcanium", "amount": 35 }
  ],
  "effects": [
    { "type": "flag", "operation": "increment", "key": "missions_completed", "value": 1 }
  ],
  "text": "Flawless victory!",
  "seed": 827364
}
```

**CraftingJob result:**
```json
{
  "rewards": [
    { "type": "item", "key": "mat_iron_sword", "amount": 1 }
  ]
}
```

**BuildingJob result:** Typically `null` -- building completion is tracked via the building instance state.

### Job Data

A catch-all JSON object for domain-specific fields that don't fit in the shared columns. Structure varies by job type.

**MissionJob data:**
```json
{
  "seed": 827364,
  "difficulty": 3
}
```

| Property | Type | Description |
|---|---|---|
| `seed` | number | Random seed used for deterministic outcome calculation |
| `difficulty` | number | Difficulty level from the MissionDef |

**CraftingJob data:**
```json
{}
```

CraftingJobs currently store no extra data beyond the shared fields.

**BuildingJob data:**
```json
{
  "outpostId": "outpost_uuid",
  "buildingId": "building_uuid"
}
```

| Property | Type | Description |
|---|---|---|
| `outpostId` | string | The outpost where the building is being constructed |
| `buildingId` | string | The building instance record being constructed |

### Job Notification Lifecycle

All job types share one notification lifecycle:
1. Frontend `useJobReadinessTimers` hook sets a timeout based on tick math.
2. When a timer elapses, `POST /jobs/notify` transitions the job to `ready_notified` status and creates a high-priority `job_ready` notification with idempotent `sourceType`/`sourceId`.
3. Completion endpoints (`completeMission`, `collectCrafting`, `completeBuilding`) use `updateBySource` to mutate the same notification with results and mark it as read.

---

## Notification

Server-authoritative notification records stored in Postgres. Supports idempotent creation, grouping, and cursor-based pagination.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `userId` | string | Yes | — | The player who receives this notification |
| `type` | string | Yes | — | Notification type (e.g. `job_ready`, `reward`, `system`) |
| `category` | string | Yes | — | Category for filtering (e.g. `mission`, `crafting`, `building`) |
| `priority` | string | Yes | — | Priority level (e.g. `low`, `normal`, `high`, `critical`) |
| `title` | string | Yes | — | Notification title |
| `body` | string | Yes | — | Notification body text |
| `deepLink` | JSON | No | `{}` | Navigation target when notification is tapped |
| `meta` | JSON | No | `{}` | Extra metadata (e.g. grouping counts) |
| `groupKey` | string | No | — | Key for grouping related notifications (90-second window) |
| `sourceType` | string | No | — | Source type for idempotent upsert (e.g. `job`) |
| `sourceId` | string | No | — | Source ID for idempotent upsert (e.g. job UUID) |
| `createdAt` | datetime | Auto | now | When created |
| `readAt` | datetime | No | — | When marked as read |
| `dismissedAt` | datetime | No | — | When dismissed by the player |
| `archivedAt` | datetime | No | — | When archived |

**Unique constraint:** `(userId, sourceType, sourceId, type)` ensures idempotent notification creation per source.

---

## TickRateInterval

Defines a tick rate interval for the global game clock. Tick rates can change over time (e.g. during boost events).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `ticksPerSecond` | float | No | 1.0 | Number of game ticks per real-time second |
| `effectiveFromTime` | datetime | Yes | — | Wall-clock time when this rate takes effect |
| `effectiveFromTick` | float | Yes | — | Tick count when this rate takes effect |
| `boostEventId` | string | No | — | References a [BoostEvent](#boostevent) if this interval is part of a boost |

---

## BoostEvent

Defines a time-limited boost event that temporarily increases the global tick rate.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `name` | string | Yes | — | Event name |
| `description` | string | No | — | Event description |
| `multiplier` | float | Yes | — | Tick rate multiplier (e.g. `2.0` = double speed) |
| `startTime` | datetime | Yes | — | When the boost begins |
| `endTime` | datetime | Yes | — | When the boost ends |
| `status` | string | No | `scheduled` | One of: `scheduled`, `active`, `ended` |

---

## ActiveEffect

A runtime record representing an effect currently applied to a target. Created when a non-instant effect is applied via the effect system (e.g. from a consumable, mission reward, or admin action). Active effects are queried by `EffectResolver` to compute `ResolvedModifier` aggregates. Expired effects are cleaned up by a 60-second periodic task.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `effectDefId` | string | Yes | — | References an [EffectDef](#effectdef) `id` |
| `userId` | string (UUID) | Yes | — | The player who owns this active effect |
| `targetType` | EffectTargetType enum | Yes | — | What this effect targets (e.g. `player`, `entity`, `location`) |
| `targetId` | string | Yes | — | ID of the target (player ID, entity ID, etc.) |
| `sourceType` | EffectSourceType enum | Yes | — | Where this effect came from (see [Effect System Enums](#effect-system-enums)) |
| `sourceId` | string | Yes | — | ID of the source (item instance ID, mission def ID, etc.) |
| `category` | EffectCategory enum | Yes | — | Copied from the EffectDef at apply time |
| `valueMode` | EffectValueMode enum | Yes | — | Copied from the EffectDef at apply time |
| `value` | float | No | 0 | Current effect value |
| `stats` | JSON | No | — | Per-stat values (copied from EffectDef) |
| `trait` | string | No | — | Trait name (copied from EffectDef) |
| `currentStacks` | integer | No | 1 | Current stack count |
| `remainingUses` | integer | No | — | Remaining uses (for `count_based` duration model) |
| `sessionType` | string | No | — | Session scope key (for `session` duration model) |
| `sessionId` | string | No | — | Current session ID (cleared on session end) |
| `expiresAt` | datetime | No | — | Wall-clock expiry (for `timed` duration model) |
| `expiresAtTick` | float | No | — | Tick-based expiry (for `tick_based` duration model) |
| `createdAt` | datetime | Auto | now | When this active effect was created |

> **Indexes:** `[userId, targetType, targetId]`, `[userId, category]`, `[targetType, targetId]`

> **Cascade:** Deleting an `EffectDef` or `User` cascades to delete related `ActiveEffect` records.

> **Expiry filtering:** All queries for active effects must include the three-way OR filter: `expiresAt IS NULL AND expiresAtTick IS NULL` (permanent), `expiresAt > now()` (wall-clock), or `expiresAtTick > currentTick` (tick-based).

---

## Entity (Instance)

A player-owned entity instance (e.g. a bird character). Created from an EntityDefinition with randomized traits and computed stats.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `ownerUserId` | string | No | — | Player who owns this entity (null = unclaimed NFT-imported entity) |
| `nftAssetId` | string | No | — | Optional NFT asset link (unique, format: `{chain}:{collectionId}:{assetId}`) |
| `nftCollectionDefId` | string | No | — | References an [NftCollectionDef](#nftcollectiondef) if this entity was claimed from an NFT |
| `definitionId` | string | Yes | — | References an [EntityDefinition](#entitydefinition) |
| `speciesId` | string | Yes | — | Species ID (denormalized for querying) |
| `role` | string | No | `player_unit` | Entity role |
| `display` | JSON | No | `{}` | Display properties (e.g. `{ "name": "Starter Bird" }`) |
| `progression` | JSON | No | `{}` | Level and XP state (e.g. `{ "level": 1, "xp": 0 }`) |
| `stats` | JSON | No | `{}` | Computed stats (e.g. `{ "ATK": 3, "DEF": 2, "SPD": 4, "FOC": 2, "LCK": 1, "VIT": 2 }`) |
| `traits` | JSON | No | `{}` | Map of slot → assigned archetype name (e.g. `{ "head": "Ninja", "beak": "Dave", ... }`) |
| `archetypeVector` | JSON | No | `{}` | Archetype distribution summary |
| `affinities` | JSON | No | `{}` | Element/type affinities |
| `state` | JSON | No | `{}` | Dynamic runtime state |
| `version` | number | No | 1 | Schema version for migrations |

**Stats computation:** An entity's `stats` are the sum of per-slot bonuses from assigned traits. For each slot in `traits`, the system looks up the corresponding [TraitDefinition](#traitdefinition) and adds the `slotStats[slot]` bonuses to the totals. The `stats` object also includes two derived fields set at generation time and read during level-up:

- `stats.scaling` — per-stat weight record (geometric mean of trait `scaling` values × composite rarity scalar). Used by `applyWeightedLevelUp` to bias the weighted bonus-point distribution.
- `stats.compositRarity` — geometric mean of all assigned trait `rarityMultiplier` values. A fully-common entity (all multipliers = 1.0) has `compositRarity = 1.0`; a fully-legendary entity approaches the maximum configured multiplier.

**Level-up stat distribution:** Every level-up grants:

1. **+1 guaranteed to every stat** (6 points, unchanged).
2. **Rarity-scaled bonus pool** = `floor(14 × compositRarity^(currentLevel × 0.16))` where `currentLevel` is the entity's level **before** the level-up.
   - A common entity (`compositRarity = 1.0`) always receives exactly 14 bonus points.
   - A legendary entity (`compositRarity ≈ 1.15`) scales from 14 when at level 1 to ~24 when at level 25 and ~41 when at level 49.
3. **50/50 split on bonus points**: `floor(pool × 0.5)` points are distributed with equal probability (1/6 each) across all 6 stats; the remaining points follow the trait-derived `scaling` weights. This preserves trait identity while adding meaningful variance at high rarity.

---

## EntityEquipment

Links an equipped item instance to an entity, tracking which body slots the equipment claims.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `entityId` | string | Yes | — | References an [Entity](#entity-instance) |
| `itemInstanceId` | string | Yes | — | References an ItemInstance |
| `slotClaims` | JSON | No | `[]` | Array of body slots this equipment occupies |
| `equippedAt` | datetime | Auto | now | When equipped |

**Mutations:** Equip and unequip actions go through `POST /v1/commands` with the `EquipItem` and `UnequipItem` command types. Both commands validate player ownership, slot compatibility against `EquipmentSchema`, and reject stat-changing equip/unequip on non-idle entities. Equipped item stats are layered on top of base entity stats at read time through the effect resolver (`EffectService.getPassiveEffectsFromEquipment`) — `Entity.stats` (the trait-derived base) is never mutated on equip/unequip.

---

## LocationInstance

A player-owned instance of a location definition (outpost). Tracks level, XP, production state, and enabled status.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `ownerUserId` | string | Yes | — | Player who owns this location |
| `nftAssetId` | string | No | — | Optional NFT asset link (unique) |
| `definitionId` | string | Yes | — | References a [LocationDefinition](#locationdefinition) |
| `regionId` | string | No | — | Region this location is in |
| `kind` | string | No | `outpost_fungible` | Location type |
| `isUnique` | boolean | No | false | Whether this is a unique location |
| `level` | number | No | 1 | Current level |
| `xp` | bigint | No | 0 | Current XP |
| `threatLevel` | number | No | 0 | Current threat level |
| `corruptionLevel` | number | No | 0 | Current corruption level |
| `lastCollectionTick` | bigint | No | 0 | Last tick when resources were collected |
| `storage` | JSON | No | `{}` | Current resource storage state (see [Settlement Storage JSON](#settlement-storage-json)) |
| `state` | JSON | No | `{}` | Dynamic runtime state. May contain `onStarve` override (`"starved"` or `"paused"`) that takes precedence over the definition default. |
| `enabled` | boolean | No | true | Whether this location participates in resource generation |
| `version` | number | No | 1 | Schema version |

**Toggle endpoint:** `POST /locations/:id/toggle`

---

## LocationBuildingInstance

An instance of a building constructed within a location.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `locationId` | string | Yes | — | References a [LocationInstance](#locationinstance) |
| `buildingDefId` | string | Yes | — | References a [BuildingDef](#buildingdef) |
| `level` | number | No | 1 | Current building level |
| `state` | JSON | No | `{}` | Dynamic runtime state. May contain `onStarve` override (`"starved"` or `"paused"`) that takes precedence over the definition default. Operational status (`"operational"`, `"starved"`, or `"paused"`) is tracked in the location's `storage.productionBundles` array, not in this field. |
| `enabled` | boolean | No | true | Whether this building participates in production |

**Toggle endpoint:** `POST /locations/:id/buildings/:buildingId/toggle`

---

## LocationRoomInstance

An instance of a room built within a location or building.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `locationId` | string | Yes | — | References a [LocationInstance](#locationinstance) |
| `roomDefId` | string | Yes | — | References a [RoomDef](#roomdef) |
| `buildingInstanceId` | string | No | — | References a LocationBuildingInstance (if room is inside a specific building) |
| `level` | number | No | 1 | Current room level |
| `state` | JSON | No | `{}` | Dynamic runtime state. May contain `onStarve` override (`"starved"` or `"paused"`) that takes precedence over the definition default. |
| `enabled` | boolean | No | true | Whether this room is active |

**Toggle endpoint:** `POST /locations/:id/rooms/:roomId/toggle`

---

## LocationWorkerAssignment

Assigns an entity (bird) to work at a location, with an optional role tag and bonus.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `locationId` | string | Yes | — | References a [LocationInstance](#locationinstance) |
| `entityId` | string | Yes | — | References an [Entity](#entity-instance) |
| `roleTag` | string | No | `production` | Worker role (e.g. `production`, `defense`) |
| `bonus` | JSON | No | `{}` | Worker-specific bonuses |
| `assignedAt` | datetime | Auto | now | When the worker was assigned |

**Unique constraint:** `(locationId, entityId)` — an entity can only be assigned to one role at a location.

---

## ItemInstance

A player-owned instance of an item definition. Supports quantity-based stacking, dynamic state, equipment linkage, and trade locking.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `userId` | string | Yes | — | Player who owns this item |
| `definitionId` | string | Yes | — | References an [ItemDef](#itemdef) |
| `quantity` | number | No | 1 | Stack quantity |
| `state` | JSON | No | — | Dynamic instance state for items that carry per-instance data |
| `equippedToId` | string | No | — | Entity ID this item is equipped to |
| `bound` | boolean | No | false | Whether this item is bound (untradeable) |
| `tradeLocked` | boolean | No | false | Whether this item is currently locked from trading |
| `data` | JSON | No | — | Freeform instance data |

---

## GiftInstance

A player-owned gift created by the event/gift system. Each instance is a snapshot of the GiftDef at creation time, supporting idempotent creation and atomic claiming.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `userId` | string | Yes | — | Player who received this gift |
| `giftDefId` | string | Yes | — | References a [GiftDef](#giftdef) |
| `giftDefVersion` | number | Yes | — | Version of the GiftDef at creation time |
| `status` | GiftStatus enum | No | `UNCLAIMED` | Current status (see GiftStatus below) |
| `createdAt` | datetime | Auto | now | When the gift was created |
| `expiresAt` | datetime | No | — | When the gift expires (null = never) |
| `sourceType` | string | No | — | What created this gift (e.g. `MissionJob`, `CraftingJob`) |
| `sourceId` | string | No | — | ID of the source (e.g. the job ID) |
| `idempotencyKey` | string | No | — | Unique key preventing duplicate gift creation (unique constraint) |
| `snapshot` | JSON | Yes | — | Frozen copy of the GiftDef's `presentation` and `rewardSpec` at creation time |
| `claim` | JSON | No | — | Claim results after the gift is claimed (granted rewards, rolls) |
| `claimTxId` | string | No | — | References the [GiftClaimTx](#giftclaimtx) if claimed (unique constraint) |

### GiftStatus Enum

| Value | Description |
|---|---|
| `UNCLAIMED` | Gift is available for the player to claim |
| `CLAIMED` | Gift has been claimed and rewards granted |
| `EXPIRED` | Gift passed its `expiresAt` deadline without being claimed |
| `REVOKED` | Gift was revoked by an admin or system action |

### Snapshot Format

The `snapshot` JSON preserves the GiftDef state at creation time so the gift is immune to later definition changes. It also optionally includes `contextData` — a frozen copy of the context available for `${path}` token resolution in the reward spec at claim time.

```json
{
  "presentation": {
    "title": "Rare Loot Box",
    "body": "A reward for completing the cave mission!",
    "iconKey": "gift_rare",
    "rarity": "RARE"
  },
  "rewardSpec": {
    "type": "bundle",
    "entries": [
      { "type": "currency", "currencyId": "soft_arcanium", "amount": 100 },
      { "type": "item", "itemDefId": "mat_iron_ore", "qty": 5 }
    ]
  },
  "contextData": {
    "job": {
      "id": "abc-123",
      "type": "MissionJob",
      "defId": "mission_cave_explore",
      "status": "COMPLETED",
      "team": ["entity-1"],
      "results": { "difficulty": "hard" },
      "data": {},
      "timer": {}
    }
  }
}
```

> **Note:** `contextData` is absent (not an empty object) when no context was provided at gift creation time. The token resolver is a no-op when `contextData` is absent — fully backward-compatible.

---

## GiftClaimTx

An atomic transaction record for gift claiming. Created when a player claims a GiftInstance, recording the RNG seed, individual rolls, and final granted rewards. Ensures claim results are deterministic and auditable.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `giftId` | string | Yes | — | References the [GiftInstance](#giftinstance) (unique constraint) |
| `userId` | string | Yes | — | Player who claimed the gift |
| `status` | string | Yes | — | Claim status (e.g. `completed`, `failed`) |
| `seed` | string | Yes | — | RNG seed used for deterministic reward resolution |
| `rolls` | JSON | No | `[]` | Reserved for recording individual random rolls (currently unused, defaults to empty array) |
| `grants` | JSON | No | `[]` | Array of resources actually granted to the player |

### Grants Format

Each entry in the `grants` array describes one resource granted:

```json
[
  { "type": "currency", "currencyId": "soft_arcanium", "amount": 100 },
  { "type": "item", "itemDefId": "mat_iron_ore", "qty": 5 },
  { "type": "entity", "entityId": "abc-123", "definitionId": "derp_bird" }
]
```

---

## Unified Level-Based Rules System

All definition types that support leveling (LocationDefinition, BuildingDef, RoomDef, EntityDefinition) use a unified level-based `rules` JSON structure. This enables data-driven game balancing through an external admin editor.

### LevelRules Structure

The top-level `rules` JSON on any definition:

```json
{
  "maxLevel": 50,
  "xpCurve": "exp",
  "baseXP": 100,
  "xpRate": 1.5,
  "level": {
    "1": { "...LevelBlock..." },
    "3": { "...LevelBlock..." },
    "5": { "...LevelBlock..." }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `maxLevel` | number | — | Maximum level for this definition |
| `xpCurve` | string | `exp` | XP curve type: `linear`, `exp`, or `custom` |
| `baseXP` | number | 100 | Base XP required for first level-up |
| `xpRate` | number | 1.5 | Growth rate for XP curve |
| `xpDepositCosts` | array | — | (LocationDefinition only) Cost options exposed by the deposit-XP modal. Each entry: `{ "type": "currency"\|"item", "id": string, "amount": number, "xpPerCharge"?: number }`. Defaults to one option spending `1× hard_essence` for `+1 XP`. |
| `level` | object | `{}` | Map of level number (as string) → LevelBlock |

**Sparse level entries inherit downward.** If level 1 defines `workers: { slots: 2 }` and level 5 defines `workers: { slots: 3 }`, then levels 2-4 use `slots: 2`. Resolution is done via `resolveLevelConfig()` which deep-merges all level blocks from 1 up to the current level.

### LevelBlock Structure

Each level entry can define any combination of:

```json
{
  "xpThreshold": 500,
  "workers": { "slots": 2, "rules": {} },
  "buildings": {
    "slots": 3,
    "allowed": [
      { "buildingDefId": "gen_arcanium_mine", "maxCount": 1, "minCount": 0 }
    ],
    "rules": {}
  },
  "rooms": {
    "allowed": [
      { "roomDefId": "room_storage_vault", "maxCount": 1, "minCount": 0 }
    ]
  },
  "storage": [
    { "type": "currency", "id": "soft_arcanium", "baseCapacity": 1000, "growthRate": "linear", "growthScalar": 200 }
  ],
  "production": [
    { "type": "currency", "id": "soft_arcanium", "ratePerHour": 3600, "growthRate": "linear", "growthScalar": 360 }
  ],
  "consumption": [
    { "type": "currency", "id": "soft_arcanium", "ratePerHour": 1800, "growthRate": "linear", "growthScalar": 180 }
  ],
  "constructionCost": [
    { "type": "currency", "id": "soft_arcanium", "baseAmount": 50, "growthRate": "exp", "growthScalar": 1.5 }
  ],
  "onStarve": "starved",
  "effects": [
    { "type": "production_multiplier_bps", "amount": 11000 }
  ],
  "timer": { "duration": 300 }
}
```

| Property | Type | Description |
|---|---|---|
| `xpThreshold` | number | XP required to reach this level (for `custom` xpCurve) |
| `workers` | object | Worker slot configuration: `{ slots: number, rules?: {} }` |
| `buildings` | object | Building slot configuration with allowed building list |
| `rooms` | object | Allowed room list |
| `storage` | ResourceEntry[] | Storage capacity definitions |
| `production` | ResourceEntry[] | Production rate definitions |
| `consumption` | ResourceEntry[] | Consumption rate definitions — resources this building/room/location requires to operate. Uses the same `ResourceEntry` format as `production`. When consumed resources are exhausted, the building's `onStarve` behavior is applied. |
| `constructionCost` | ResourceEntry[] | Construction cost definitions |
| `onStarve` | string | Default starvation behavior when consumed resources run out: `"starved"` (auto-restarts when resources become available) or `"paused"` (stays stopped until manually re-enabled). Defaults to `"starved"` if omitted. Can be overridden at the building instance level via the `state.onStarve` JSON field. |
| `effects` | array | Effects active at this level (e.g. `[{ "type": "production_multiplier_bps", "amount": 11000 }]`) |
| `timer` | object | Timer configuration (e.g. construction time) |

### ResourceEntry

Used in `storage`, `production`, `consumption`, and `constructionCost` arrays:

| Property | Type | Description |
|---|---|---|
| `type` | string | `"currency"` or `"item"` (lowercase) |
| `id` | string | Currency ID or item definition ID |
| `amount` | number | Fixed amount (for simple `constructionCost` entries without growth formulas) |
| `baseCapacity` | number | Base storage capacity (for `storage` entries) |
| `baseAmount` | number | Base amount for growth formula (for `constructionCost` entries with `growthRate`) |
| `ratePerHour` | number | Base production rate per hour (for `production` entries) |
| `growthRate` | string | Optional growth formula: `"flat"`, `"linear"`, or `"exp"` |
| `growthScalar` | number | Growth scaling factor (used with `growthRate`) |

### Growth Formulas

All resource entries support per-entry growth formulas:

| Formula | Calculation | Example (base=100, scalar=20, level=5) |
|---|---|---|
| `flat` | `base` (no scaling) | 100 |
| `linear` | `base + scalar * (level - 1)` | 100 + 20 * 4 = 180 |
| `exp` | `base * scalar^(level - 1)` | 100 * 20^4 = 16,000,000 |

### XP Curves

| Curve | Calculation | Description |
|---|---|---|
| `linear` | `baseXP * targetLevel` | XP grows linearly |
| `exp` | `baseXP * xpRate^(targetLevel - 1)` | XP grows exponentially (default) |
| `custom` | Look up `xpThreshold` in level block | Per-level custom thresholds |

### Allowed Buildings

Accumulated across level blocks via `resolveAllowedBuildings()`. Later levels can add new buildings without repeating earlier ones.

```json
{ "buildingDefId": "gen_arcanium_mine", "maxCount": 1, "minCount": 0 }
```

| Property | Type | Description |
|---|---|---|
| `buildingDefId` | string | References a [BuildingDef](#buildingdef) ID |
| `maxCount` | number | Maximum number of this building per location |
| `minCount` | number | Minimum required count |

### Allowed Rooms

Same pattern as buildings, accumulated via `resolveAllowedRooms()`:

```json
{ "roomDefId": "room_storage_vault", "maxCount": 1, "minCount": 0 }
```

---

## Settlement Storage JSON

The `storage` JSON field on `LocationInstance` holds the settlement state, computed by `recalculateLocationMeta` and updated during settlement. It contains the following top-level keys:

```json
{
  "capacity": { "soft_arcanium": 1200, "mat_iron_ore": 500 },
  "stored": { "soft_arcanium": 450, "mat_iron_ore": 120 },
  "productionRates": { "soft_arcanium": 3600, "mat_iron_ore": 30 },
  "consumptionRates": { "soft_arcanium": 1800 },
  "effectiveProductionRates": { "soft_arcanium": 4320, "mat_iron_ore": 36 },
  "netFlows": { "soft_arcanium": 1800, "mat_iron_ore": 30 },
  "productionBundles": [
    {
      "buildingId": "uuid-of-building",
      "buildingDefId": "gen_arcanium_mine",
      "produces": { "soft_arcanium": 3600 },
      "consumes": { "mat_iron_ore": 10 },
      "resourceTypes": { "soft_arcanium": "currency", "mat_iron_ore": "item" },
      "onStarve": "starved",
      "status": "operational"
    }
  ],
  "lastSettledAt": "2026-03-14T00:00:00.000Z"
}
```

| Property | Type | Description |
|---|---|---|
| `capacity` | `Record<string, number>` | Per-resource storage capacity aggregated from location, buildings, and rooms |
| `stored` | `Record<string, number>` | Current stored amounts per resource |
| `productionRates` | `Record<string, number>` | Aggregated base production rates per hour (before worker/threat/effect multipliers) |
| `consumptionRates` | `Record<string, number>` | Aggregated base consumption rates per hour (before multipliers) |
| `effectiveProductionRates` | `Record<string, number>` | Production rates after applying worker, threat, and effect multipliers |
| `netFlows` | `Record<string, number>` | Per-resource net rate per hour (`productionRates - consumptionRates`). Positive = accumulating, negative = draining. |
| `productionBundles` | `ProductionBundle[]` | Per-building/room breakdown of production and consumption (see below) |
| `lastSettledAt` | string (ISO date) | Timestamp of last settlement |

### ProductionBundle

Each entry in `productionBundles` represents one building or room:

| Property | Type | Description |
|---|---|---|
| `buildingId` | string | Instance ID of the building (prefixed with `location:` for location-level production, `room:` for rooms) |
| `buildingDefId` | string | Definition ID of the building/room/location |
| `produces` | `Record<string, number>` | Resources produced per hour by this building |
| `consumes` | `Record<string, number>` | Resources consumed per hour by this building |
| `resourceTypes` | `Record<string, string>` | Maps resource IDs to their type (`"currency"` or `"item"`). Used by settlement to route overflow consumption to the correct player wallet (currency) or inventory (item). |
| `onStarve` | string | Starvation behavior: `"starved"` (auto-restart when resources available) or `"paused"` (stays stopped) |
| `status` | string | Current operational status: `"operational"`, `"starved"`, or `"paused"` |

### Settlement Phased Simulation

During settlement, the system uses **net-flow simulation** rather than per-building sequential processing. All active buildings operate simultaneously:

1. **Net flows** are computed across all currently-active buildings (production minus consumption per resource)
2. For each resource with negative net flow, the **exhaustion time** is calculated from current stored amounts
3. Time advances to the earliest event point (either resource exhaustion or starved building restart); all production and consumption are applied for that phase using integer accounting (`Math.floor(rate * phaseSeconds / 3600)`)
4. Buildings whose consumed resources are exhausted follow their `onStarve` behavior:
   - `"starved"`: the system computes exact restart time — how long until active buildings produce enough of every consumed resource to reach at least 1 unit available. If achievable within remaining time, a phase advances to that point and the building reactivates. It may then re-starve in a later phase if resources are consumed faster than produced, creating natural phase-by-phase cycles bounded by the 50-iteration safety cap.
   - `"paused"`: removed from the active set for the remainder of settlement. The building stays paused across subsequent settlements and meta recalculations. To re-enable, the player can: (a) toggle the building off (`enabled: false`) and back on (`enabled: true`), which creates a fresh bundle with `operational` status, or (b) change the instance `state.onStarve` to `"starved"`, which on the next meta recalculation transitions the bundle from `paused` to `starved` so it becomes eligible for auto-restart.
5. Phases repeat until the full elapsed time window is covered, capped at **50 iterations** as a safety guard. If the cap is reached, only the simulated portion of elapsed time is advanced (the `lastCollectionTick` is set to `lastCollectionTick + simulatedSeconds`), ensuring no unprocessed time is dropped.

**Resource pool for consumption:** Consumed resources are drawn from a combined pool of location storage + player wallet (currency balances) / item inventory. Local storage is consumed first; any overflow is tracked separately and deducted atomically from the player's wallet via `CurrencyService.spendTx` or `InventoryService.removeItemTx` at the end of settlement. If any wallet deduction fails, the entire settlement transaction is rolled back. The `resourceTypes` field in each bundle determines whether each resource is a currency or item for correct routing.

**Integer accounting:** All resource deltas within a phase use `Math.floor(ratePerHour * phaseSeconds / 3600)` to produce whole-number amounts. This prevents fractional leakage across frequent settlements. At exhaustion boundaries, any remaining fractional amounts in local storage and wallet are force-consumed to zero, ensuring starvation triggers correctly even when floored deltas would leave tiny remainders.

---

## Shared JSON Formats

These JSON structures are used across multiple definition tables.

### Timer

Used in `timer` fields on MissionDef, RecipeDef, and within level-based rules. Controls duration, whether the timer is affected by tick boosts, and whether it can be skipped.

```json
{
  "duration": 1800,
  "boostable": true,
  "skipable": true,
  "skip_cost": [
    { "type": "currency", "id": "soft_arcanium", "amount": 50 }
  ],
  "skip_type": "scaling"
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `duration` | number | 0 | Total duration in seconds |
| `boostable` | boolean | true | If `true`, duration runs in tick-time (affected by speed boosts). If `false`, uses absolute wall-clock time. |
| `skipable` | boolean | false | Whether the player can pay to skip the timer |
| `skip_cost` | array | `[]` | Array of cost entries to skip, using the canonical `[{type, id, amount}]` format (see [Cost Objects](#cost-objects)) |
| `skip_type` | string | `"absolute"` | `"absolute"` = fixed cost regardless of remaining time. `"scaling"` = cost scales proportionally with remaining time. |

**Examples:**

Quick mission (30s, boostable, cheap skip):
```json
{ "duration": 30, "boostable": true, "skipable": true, "skip_cost": [{ "type": "currency", "id": "soft_arcanium", "amount": 5 }], "skip_type": "absolute" }
```

Standard mission (30min, boostable, scaling skip cost):
```json
{ "duration": 1800, "boostable": true, "skipable": true, "skip_cost": [{ "type": "currency", "id": "soft_arcanium", "amount": 50 }], "skip_type": "scaling" }
```

Unskippable endgame content (1hr, boostable, no skip):
```json
{ "duration": 3600, "boostable": true, "skipable": false, "skip_cost": [], "skip_type": "absolute" }
```

---

### Cost Objects

Used in `constructionCost` fields on level-based rules and the `cost` field on RecipeDef. All costs use the canonical `{type, id, amount}` array format. You can mix currencies and items freely in the same array.

**RecipeDef cost format:**

```json
[
  { "type": "currency", "id": "soft_arcanium", "amount": 500 },
  { "type": "item", "id": "mat_iron_ore", "amount": 25 },
  { "type": "currency", "id": "premium_gems", "amount": 5 }
]
```

**constructionCost format (in level-based rules):**

Construction costs support optional growth formulas via `baseAmount`, `growthRate`, and `growthScalar`. For simple fixed costs, use `amount` directly.

```json
[
  { "type": "currency", "id": "soft_arcanium", "amount": 50 },
  { "type": "item", "id": "mat_iron_ore", "amount": 30 }
]
```

With growth formula:

```json
[
  { "type": "currency", "id": "soft_arcanium", "baseAmount": 50, "growthRate": "exp", "growthScalar": 1.5 }
]
```

| Property | Type | Description |
|---|---|---|
| `type` | string | `"currency"` or `"item"` (lowercase) |
| `id` | string | Currency ID or item definition ID |
| `amount` | number | Fixed cost amount (use for simple costs without growth) |
| `baseAmount` | number | Base cost for growth formula calculation (use instead of `amount` when `growthRate` is set) |
| `growthRate` | string | Optional: `"flat"`, `"linear"`, or `"exp"` |
| `growthScalar` | number | Growth scaling factor (used with `growthRate`) |

> **Note:** The backend `resolveConstructionCosts()` accepts either `amount` or `baseAmount` (`amount` takes priority). Use `amount` for simple fixed costs and `baseAmount` when using growth formulas.

### Outcome Blocks

Used in `success` and `failure` fields on MissionDef. An outcome block is a JSON object with a `rewards` array that serves as the **unified entry list** — despite the field name, it holds all entry types: rewards, effects, text, and bundles mixed together. The server iterates through `rewards` and dispatches each entry by its `type` field.

```json
{
  "rewards": [ ...entries... ]
}
```

The `rewards` array supports all of these entry types in any combination:

| Entry Type | `type` value | Purpose |
|---|---|---|
| Reward | `entity_xp`, `keeper_xp`, `currency`, `item` | Grants resources to the player |
| Effect | `flag` (with `operation`) | Mutates a player flag |
| Text | `text` | Flavor text, one selected by weighted odds |
| Event | `emitEvent` | Dispatches a server event (e.g. to create a gift) |
| Bundle | (has `bundle` key) | Groups any mix of the above with shared odds |
| Bundle Ref | `bundle_ref` (with `bundleDefId`) | Inlines a saved [BundleDef](#bundledef) at resolve time, with optional `odds` / `pickMin` / `pickMax` / `requirements` overrides |

Every entry and bundle supports an optional `requirements` array that gates processing behind the same requirement types used elsewhere (keeper_level, flag, trait, team_size, etc.). If requirements are not met, the entry/bundle is silently skipped — no error, it simply does not drop. Requirements are checked before odds are rolled.

```
{ "type": "item", "key": "rare_gem", "min": 1, "max": 1, "odds": 100,
  "requirements": [{ "type": "keeper_level", "value": 5, "operator": "gte" }] }
```

**Example — mixing rewards, effects, text, events, bundles, and requirements in one outcome block:**

```json
{
  "rewards": [
    { "type": "entity_xp", "min": 40, "max": 80, "odds": 100 },
    { "type": "currency", "key": "soft_arcanium", "min": 20, "max": 50, "odds": 100 },
    { "type": "item", "key": "mat_iron_ore", "min": 1, "max": 3, "odds": 10 },
    { "type": "flag", "operation": "set", "key": "completed_cave", "value": true, "odds": 100 },
    { "type": "text", "message": "Flawless victory!", "odds": 30 },
    { "type": "text", "message": "Mission accomplished!", "odds": 70 },
    {
      "type": "emitEvent", "defId": "evt_mission_gift_drop",
      "payload": { "giftDefId": "gift_rare_loot" },
      "idempotencyKey": "mission-gift-${jobId}",
      "odds": 5,
      "requirements": [{ "type": "keeper_level", "value": 10, "operator": "gte" }]
    },
    {
      "type": "item", "key": "legendary_feather", "min": 1, "max": 1, "odds": 50,
      "requirements": [
        { "type": "keeper_level", "value": 10, "operator": "gte" },
        { "type": "flag", "key": "unlocked_void", "value": true }
      ]
    },
    {
      "bundle": [
        { "type": "item", "key": "mat_rare_gem", "min": 1, "max": 1, "odds": 80 },
        { "type": "flag", "operation": "set", "key": "found_secret", "value": true, "odds": 100 },
        { "type": "flag", "operation": "increment", "key": "secrets_found", "value": 1, "odds": 100 },
        { "type": "text", "message": "You discovered a hidden cache!", "odds": 100 }
      ],
      "odds": 15,
      "requirements": [{ "type": "flag", "key": "has_treasure_map", "value": true }]
    }
  ]
}
```

In this example, XP and currency are always granted. The iron ore has a 10% drop chance. The cave flag is always set. One of the two standalone text entries is selected by weighted odds. The `emitEvent` entry has a 5% chance of firing for keeper level 10+ players — if it triggers, it dispatches the `evt_mission_gift_drop` event which creates a gift for the player (the `${jobId}` template in the idempotency key is replaced with the actual mission job ID to prevent duplicates). The legendary feather only drops for keeper level 10+ players who have the `unlocked_void` flag, and even then only 50% of the time. The bundle only activates for players with the `has_treasure_map` flag, and has a 15% chance if that requirement is met; if it does activate, each entry inside is processed individually (the gem has its own 80% odds, the flags are guaranteed, and the bundle's text overrides the standalone text selection).

> **Note on field naming:** The `rewards` field name is historical — it is the single unified array that holds all outcome entry types (rewards, effects, text, and bundles). The runtime code reads only from `outcome.rewards` and ignores any separate `effects` or `text` fields at the top level.

### Rewards

Reward-type entries grant resources to the player. Each has a `type`, optional `key`, a min/max range for randomized amounts, and an `odds` field controlling drop chance.

| Type | Key | Min/Max | Odds | Meaning |
|---|---|---|---|---|
| `entity_xp` | — | XP range | 100 = guaranteed | XP split across all entities on the team |
| `keeper_xp` | — | XP range | 100 = guaranteed | XP granted to the keeper |
| `currency` | currency ID | amount range | 100 = guaranteed | Currency granted to the player |
| `item` | item def ID | quantity range | 10 = 10% chance | Item granted (odds = percentage chance, omit or 100 for guaranteed) |

**Odds** is a percentage value from 0-100. Default is `100` (guaranteed). `10` means 10% chance, `50` means 50% chance, etc.

**Requirements on entries:** Any reward entry can include an optional `requirements` array. If present, the entry is only processed when all requirements are met. Requirements are checked *before* odds are rolled. See [Requirements](#requirements) for the full list of requirement types.

#### Bundles

A bundle groups multiple entries together with its own `odds` field. **Bundles can contain any mix of reward, effect, and text entries.** When the bundle's odds roll succeeds, each entry inside is processed individually (and each entry can still have its own `odds`).

Bundle format: `{ "bundle": [...entries], "odds": N, "requirements": [...] }`

Bundles also support an optional `requirements` array. If present, the entire bundle is skipped when requirements are not met. Requirements are checked before the bundle's odds roll. Individual entries inside the bundle can also have their own `requirements`.

**Example — reward-only bundle:**
```json
{
  "bundle": [
    { "type": "item", "key": "mat_rare_gem", "min": 1, "max": 1, "odds": 80 },
    { "type": "item", "key": "mat_rare_dust", "min": 2, "max": 5, "odds": 100 }
  ],
  "odds": 15
}
```

**Example — mixed-type bundle (rewards + effects + text):**
```json
{
  "bundle": [
    { "type": "item", "key": "mat_ancient_artifact", "min": 1, "max": 1, "odds": 100 },
    { "type": "currency", "key": "premium_gems", "min": 5, "max": 10, "odds": 50 },
    { "type": "flag", "operation": "set", "key": "found_artifact", "value": true, "odds": 100 },
    { "type": "flag", "operation": "increment", "key": "artifacts_found", "value": 1, "odds": 100 },
    { "type": "text", "message": "You uncovered an ancient artifact!", "odds": 100 }
  ],
  "odds": 5
}
```

This mixed bundle has a 5% chance of activating. If it does: the artifact item is guaranteed, premium gems have a 50% chance, both flags are always set, and the bundle's flavor text is applied. This lets you create thematic "loot packages" where finding a rare item also triggers story flags and a special message.

#### Pick Mode Bundles

Bundles support an optional **pick mode** activated by adding `pickMin` and/or `pickMax` fields. Instead of rolling every entry individually, the system selects between `pickMin` and `pickMax` entries at random using each entry's `odds` as a relative weight (**with replacement** — duplicates are allowed and the count may exceed the pool size), then resolves the chosen entries as guaranteed.

Pick bundle format: `{ "bundle": [...entries], "odds": N, "pickMin": X, "pickMax": Y }`

- The outer `odds` roll still applies — if it fails the bundle is skipped entirely.
- `pickMin` — minimum number of entries to pick (default `1` if only `pickMax` is set).
- `pickMax` — maximum number of entries to pick (default equals `pickMin` if only `pickMin` is set).
- The actual count N is `random(pickMin, pickMax)`. Picks are weighted-random with replacement, so N is **not** clamped to the number of available entries — setting N greater than the pool size simply produces duplicate rolls of the same entries (this is how you express "roll the whole bundle N times" by wrapping the recipe in a single inner bundle).
- Entry `requirements` are evaluated before building the weighted pool — ineligible entries are excluded from selection.
- Once selected, entries are resolved as guaranteed (their `odds` value is not re-rolled during resolution since it was already used as a selection weight).
- `pickMin: 1, pickMax: 1` = pick exactly one entry (classic "choose 1 of N" pattern).
- `pickMin: 1, pickMax: 3` = pick anywhere from 1 to 3 entries (each pick weighted independently; the same entry can fire more than once).

**Example — "choose 1 of 3 bonus rewards":**
```json
{
  "bundle": [
    { "type": "currency", "key": "premium_gems", "min": 5, "max": 10, "odds": 30 },
    { "type": "item", "key": "mat_rare_gem", "min": 1, "max": 1, "odds": 50 },
    { "type": "item", "key": "mat_ancient_relic", "min": 1, "max": 1, "odds": 20 }
  ],
  "odds": 100,
  "pickMin": 1,
  "pickMax": 1
}
```

The player always receives exactly one of the three options. The higher-odds entries (rare gem at 50, gems at 30, relic at 20) are proportionally more likely to be chosen.

**Example — variable pick count:**
```json
{
  "bundle": [
    { "type": "item", "key": "reward_a", "min": 1, "max": 1, "odds": 1 },
    { "type": "item", "key": "reward_b", "min": 1, "max": 1, "odds": 1 },
    { "type": "item", "key": "reward_c", "min": 1, "max": 1, "odds": 1 },
    { "type": "item", "key": "reward_d", "min": 1, "max": 1, "odds": 1 }
  ],
  "odds": 50,
  "pickMin": 1,
  "pickMax": 2
}
```

This bundle has a 50% chance of firing. If it does, 1 or 2 of the four equally-weighted entries are selected at random with replacement (each pick is independent, so the same entry can be chosen twice).

**Example — "roll this recipe N times":** Wrap the recipe in a single inner bundle so `pickMax` on the consumer multiplies the whole recipe.

```json
{
  "id": "bundle.scout_loot",
  "name": "Scout Loot",
  "bundle": [
    {
      "bundle": [
        { "type": "keeper_xp", "min": 1, "max": 5 },
        { "type": "entity_xp", "min": 10, "max": 20 },
        {
          "bundle": [
            { "type": "item", "key": "mat_meadow_thread", "min": 1, "max": 5, "odds": 60 },
            { "type": "item", "key": "mat_shiny_rock",    "min": 1, "max": 3, "odds": 30 },
            { "type": "item", "key": "mat_golden_hay_core","min": 1, "max": 2, "odds": 10 }
          ],
          "pickMin": 1,
          "pickMax": 1
        }
      ]
    }
  ]
}
```

A consumer that references this bundle with `{ "type": "bundle_ref", "bundleDefId": "bundle.scout_loot", "pickMin": 5, "pickMax": 7 }` resolves to 5–7 picks from a pool of 1 (the inner recipe), each pick rolling a fresh Keeper XP amount, Entity XP amount, and weighted-random material — i.e. 5–7 full reward rolls.

### Requirements

A unified array of conditions used in `requirements` fields across all definition types. Each entry has a `type`, an optional `key` (only needed when specifying *which* thing), and a `value`. All types support an optional `operator` field.

**Full example with all types:**
```json
[
  { "type": "keeper_level", "value": 5 },
  { "type": "team_size", "value": 2, "operator": "gte" },
  { "type": "team_size", "value": 4, "operator": "lte" },
  { "type": "flag", "key": "tutorial_complete", "value": true, "operator": "eq" },
  { "type": "flag", "key": "missions_completed", "value": 10, "operator": "gte" },
  { "type": "trait", "key": "strength", "value": 10 },
  { "type": "building", "key": "gen_arcanium_mine", "value": 3 },
  { "type": "currency", "key": "soft_arcanium", "value": 1000 },
  { "type": "item", "key": "mat_iron_ore", "value": 5 },
  { "type": "has_building", "ids": ["gen_arcanium_mine"] },
  { "type": "has_room", "ids": ["room_workshop"] },
  { "type": "parent_has_building", "ids": ["gen_arcanium_mine"] },
  { "type": "parent_has_room", "ids": ["room_workshop"] },
  { "type": "in_region", "ids": ["derpshire_valley", "verdant_hollow"] }
]
```

#### Standard Requirement Types

| Type | Key needed? | Value | Default Operator | Applies to | Meaning |
|---|---|---|---|---|---|
| `keeper_level` | No | number | `gte` | All | Player must meet this keeper level threshold |
| `team_size` | No | number | `gte` | Missions only | Number of entities on the team (use `gte`/`lte` for min/max) |
| `flag` | Yes (flag name) | boolean/number/string | `eq` | All | Checks a player flag with an operator |
| `trait` | Yes (trait name) | number | `gte` | Missions only | The SUM of this trait across all entities on the team must meet the threshold |
| `building` | Yes (building def ID) | number | `gte` | All | Player must own this building at this level or higher |
| `currency` | Yes (currency ID) | number | `gte` | All | Player must hold at least this much of the currency |
| `item` | Yes (item def ID) | number | `gte` | All | Player must hold at least this many of the item |

#### Location-Specific Requirement Types

These types use an `ids` array instead of a single `key`/`value`. They are primarily used in BuildingDef, RoomDef, and LocationDefinition requirements.

| Type | `ids` contains | Meaning |
|---|---|---|
| `has_building` | BuildingDef IDs | Player owns at least one of these buildings anywhere across all locations |
| `has_room` | RoomDef IDs | Player owns at least one of these rooms anywhere across all locations |
| `parent_has_building` | BuildingDef IDs | The current outpost contains at least one of these buildings |
| `parent_has_room` | RoomDef IDs | The parent building contains at least one of these rooms |
| `in_region` | RegionDefinition IDs | The current location is in one of these regions |

**Example (room requires parent building):**
```json
[
  { "type": "parent_has_building", "ids": ["gen_arcanium_mine"] },
  { "type": "keeper_level", "value": 3 }
]
```

**Example (building requires player to have another building somewhere):**
```json
[
  { "type": "has_building", "ids": ["stor_warehouse"] }
]
```

#### Operators

All standard requirement types support an optional `operator` field that controls how the value is compared. If omitted, the default operator depends on the type: `eq` for `flag`, `gte` for all numeric types (`keeper_level`, `team_size`, `building`, `currency`, `item`, `trait`).

| Operator | Meaning | Example |
|---|---|---|
| `eq` | Equals (default for `flag`) | `{ "type": "flag", "key": "tutorial_done", "value": true }` |
| `neq` | Not equals | `{ "type": "flag", "key": "banned", "value": true, "operator": "neq" }` |
| `gt` | Greater than | `{ "type": "keeper_level", "value": 5, "operator": "gt" }` |
| `gte` | Greater than or equals (default for numeric types) | `{ "type": "team_size", "value": 2, "operator": "gte" }` |
| `lt` | Less than | `{ "type": "team_size", "value": 5, "operator": "lt" }` |
| `lte` | Less than or equals | `{ "type": "team_size", "value": 4, "operator": "lte" }` |
| `exists` | Value exists (not null/undefined) | `{ "type": "flag", "key": "has_played", "operator": "exists" }` |

**Notes:**
- Types marked "Missions only" (`team_size`, `trait`) are ignored when used on recipes, buildings, or rooms.
- Types without a key (`keeper_level`, `team_size`) don't need the `key` field -- just `type`, `value`, and optionally `operator`.
- The `trait` type compares against the **sum** of that trait value across all entities on the team, not a single entity's trait level.
- Location-specific types (`has_building`, `has_room`, `parent_has_building`, `parent_has_room`, `in_region`) use `ids` arrays and do not use `operator` or `value`.
- You can combine any number of requirements. All must be met for the condition to pass.

### Visibility Requirements

Used in `visibilityRequirements` fields. Same format as [Requirements](#requirements), but controls whether the definition appears in API responses at all. If any condition is not met, the mission/recipe/building/room is hidden from the player entirely.

```json
[
  { "type": "keeper_level", "value": 5 },
  { "type": "flag", "key": "unlocked_crafting", "value": true, "operator": "eq" }
]
```

All operators and requirement types work in visibility requirements. This is useful for progressive content reveals -- quests that only show up after certain story milestones, recipes that unlock after a building is constructed, etc.

### Effects

Effect-type entries mutate player flags. Used inside [Outcome Blocks](#outcome-blocks) mixed with rewards and text. Each effect has `type: "flag"` and an `operation` that determines how the flag is mutated. Each supports an `odds` field (default 100 = guaranteed). There is no standalone `effects` field — all effects are placed inside the `rewards` array of outcome blocks.

Effects can be mixed freely with reward and text entries in outcome blocks, and can appear inside [Bundles](#bundles) alongside any other entry type.

```json
[
  { "type": "flag", "operation": "set", "key": "main_storyline", "value": 1, "odds": 100 },
  { "type": "flag", "operation": "set", "key": "met_elder_bird", "value": true, "odds": 100 },
  { "type": "flag", "operation": "increment", "key": "missions_completed", "value": 1, "odds": 100 },
  { "type": "flag", "operation": "decrement", "key": "energy", "value": 5, "odds": 100 },
  { "type": "flag", "operation": "invert", "key": "stealth_mode", "odds": 50 },
  { "type": "flag", "operation": "remove", "key": "temporary_buff", "odds": 100 }
]
```

#### Flag Operations

| Operation | Key | Value | Meaning |
|---|---|---|---|
| `set` | flag name | any | Sets the flag to the given value |
| `increment` | flag name | number (default: 1) | Adds the value to the flag (treats missing/non-numeric as 0) |
| `decrement` | flag name | number (default: 1) | Subtracts the value from the flag (treats missing/non-numeric as 0) |
| `invert` | flag name | — (ignored) | Flips a boolean flag (`true` becomes `false` and vice versa) |
| `remove` | flag name | — (ignored) | Deletes the flag key entirely from the player's flags object. After removal, `exists` operator checks will correctly return false. |

**Odds** is a percentage value from 0-100. Default is `100` (guaranteed). Use lower values for random effects (e.g., `odds: 25` = 25% chance of applying).

### Effect System Enums

The Generic Effects System uses six enums to classify effect definitions and active effects. All enum values are **lowercase strings**.

#### EffectCategory

Determines what game mechanic the effect modifies.

| Value | Description |
|---|---|
| `stat_boost` | Modifies entity stats (ATK, DEF, SPD, FOC, LCK, VIT) |
| `mission_power` | Modifies mission power calculation |
| `success_chance` | Modifies mission success probability |
| `reward_multiplier` | Multiplies reward quantities |
| `xp_multiplier` | Multiplies entity XP gains |
| `keeper_xp_multiplier` | Multiplies keeper XP gains |
| `production_rate` | Modifies location/building production rate |
| `storage_capacity` | Modifies location/building storage capacity |
| `timer_speed` | Modifies job timer speed |
| `trait_grant` | Grants a trait archetype to an entity |
| `currency_multiplier` | Multiplies currency earnings |
| `cost_discount` | Reduces costs |
| `slot_unlock` | Unlocks equipment/building slots |
| `protection` | Provides damage protection |
| `reveal` | Reveals hidden content |
| `threat_reduction` | Reduces threat/aggro |
| `craft_luck` | Improves crafting success/bonus chances |
| `worker_efficiency` | Improves worker output |
| `cooldown_reduction` | Reduces cooldown timers |
| `level_up_bonus` | Provides bonuses on level up |

#### EffectValueMode

How the effect's `value` field is applied to the base value.

| Value | Description |
|---|---|
| `flat_add` | Adds a flat amount to the base (`base + value`) |
| `percent_add` | Adds a percentage (`base * (1 + value/100)`) |
| `multiplier` | Multiplies the result (`result * value`) |
| `flat_set` | Overrides to a fixed value |
| `bps` | Basis points (10000 = 1.0x, 11000 = 1.1x) |
| `flat_grant` | Grants a flat resource/trait (no base interaction) |
| `random_range` | Picks a random value in a range |

#### EffectDurationModel

How the effect expires.

| Value | Description |
|---|---|
| `instant` | Applied immediately, no ActiveEffect record created |
| `timed` | Expires after `durationSec` seconds (wall-clock, stored in `expiresAt`) |
| `tick_based` | Expires after `durationTicks` game ticks (stored in `expiresAtTick`) |
| `count_based` | Expires after `maxUses` uses (tracked in `remainingUses`) |
| `session` | Lasts until the session ends (scoped by `sessionType` + `sessionId`) |
| `permanent` | Lasts forever (no expiry fields set) |
| `until_removed` | Lasts until explicitly removed by game logic |

#### EffectStackingRule

What happens when the same `EffectDef` is applied again to the same target.

| Value | Description |
|---|---|
| `replace` | Removes the existing active effect and creates a new one |
| `refresh` | Resets the duration of the existing active effect |
| `stack_additive` | Increases `currentStacks` by 1, value adds linearly |
| `stack_multiplicative` | Increases `currentStacks` by 1, value multiplies |
| `stack_capped` | Like `stack_additive` but capped at `maxStacks` |
| `no_stack` | Ignores the new application if already active |

#### EffectTargetType

What the effect targets.

| Value | Description |
|---|---|
| `entity` | Targets a specific entity (bird/character) |
| `player` | Targets the player account globally |
| `location` | Targets a specific location instance |
| `team` | Targets all entities in the player's team |
| `job` | Targets a specific job (mission/crafting) |
| `global` | Affects all players (admin-only) |

#### EffectSourceType

Where the effect originated from.

| Value | Description |
|---|---|
| `consumable` | Applied by using a consumable item |
| `equipment` | Applied by equipping an item |
| `trait` | Applied by a trait archetype |
| `building` | Applied by a building |
| `room` | Applied by a room |
| `mission_reward` | Granted as a mission reward |
| `season_event` | Applied by a season event |
| `admin` | Applied by an admin action |
| `quest_reward` | Granted as a quest reward |
| `checkin` | Granted by the check-in system |
| `shop` | Granted by a shop purchase |
| `flag` | Applied by a flag trigger |
| `ascension` | Granted by entity ascension |

#### Resolution Order

When multiple effects target the same category, `EffectResolver` aggregates them into a `ResolvedModifier`:

1. **flatAdd** — Sum of all `flat_add` values
2. **percentAdd** — Sum of all `percent_add` values
3. **multiplier** — Product of all `multiplier` values (starts at 1.0)

Final value: `(base + flatAdd) × (1 + percentAdd/100) × multiplier`

For stat-based effects, per-stat maps (`statFlatAdds`, `statPercentAdds`, `statMultipliers`) are aggregated independently for each stat key.

### Extra Data

The `data` field on every definition is a freeform JSON object for custom game logic that doesn't fit into the structured fields above. Use it for things like:

```json
{
  "lore": "An ancient mining technique passed down through generations.",
  "animationId": "sparkle_burst",
  "sortOrder": 15,
  "tags": ["beginner", "tutorial"]
}
```

There is no enforced schema for `data` -- it's entirely up to your game logic to interpret whatever you put here.

### Gift Reward Spec

Used in the `rewardSpec` field on [GiftDef](#giftdef). Defines what a player receives when they claim a gift. Supports single rewards, bundles of multiple rewards, and `${path}` token resolution against snapshotted `contextData` (see [Token Resolution in rewardSpec](#token-resolution-in-rewardspec)).

**Single reward:**

```json
{ "type": "currency", "currencyId": "soft_arcanium", "amount": 500 }
```

**Bundle of rewards:**

```json
{
  "type": "bundle",
  "entries": [
    { "type": "currency", "currencyId": "soft_arcanium", "amount": 500 },
    { "type": "item", "itemDefId": "mat_iron_ore", "qty": 10 },
    { "type": "entity", "definitionId": "derp_bird" }
  ]
}
```

#### Reward Entry Types

| Type | Fields | Description |
|---|---|---|
| `currency` | `currencyId` (currency ID), `amount` | Grants currency to the player |
| `item` | `itemDefId` (item def ID), `qty` (quantity) | Grants items to the player's inventory |
| `entity` | `definitionId` (entity definition ID), `overrides?` | Creates a new entity (see below) |
| `lootTable` | `lootboxDefId` (LootboxDef ID), `qty` (default 1) | Grants a lootbox item to the player's inventory |
| `cosmetic` | — | Not yet implemented |

**Entity rewards** create a new entity instance using the same random stat generation as initial character creation (stats randomly assigned in the 8-15 range per stat: ATK, DEF, SPD, FOC, LCK, VIT). The optional `overrides` object can customize the created entity:

| Override | Type | Description |
|---|---|---|
| `name` | string | Override the entity's display name. Supports `${path}` tokens. |
| `level` | number | Override the starting level |
| `stats` | object | Override individual stat values (e.g. `{ "ATK": 20, "DEF": 15 }`) |
| `traits` | string[] | Override the entity's trait list |

**Example with overrides:**

```json
{
  "type": "entity",
  "definitionId": "${job.defId}",
  "overrides": {
    "name": "${random(\"Dave\",\"DJ\",\"Dirty\")}"
  }
}
```

**lootTable rewards** grant a lootbox item to the player's inventory. The player must then open the lootbox via the standard lootbox flow to receive its contents.

#### Token Resolution in rewardSpec

String values in `rewardSpec` support `${path.to.value}` token syntax, resolved against the `contextData` snapshotted at gift creation time. This allows a single GiftDef to produce different rewards depending on the triggering context (e.g. which mission completed, check-in streak day).

**Syntax:**
- `${path.to.value}` — Resolves a dot-path against `contextData`. Example: `${job.defId}` → `"mission_cave_explore"`.
- `${random("a","b","c")}` — Randomly selects one of the quoted values. Example: `${random("Dave","DJ","Dirty")}` → `"DJ"`.

**Context shapes** (see [Context Enrichment](#context-enrichment) for how these are built):
- `${job.id}`, `${job.type}`, `${job.defId}`, `${job.status}` — Job fields (auto-built for MissionJob/CraftingJob/BuildingJob sources).
- `${job.results.difficulty}`, `${job.data.someField}` — Nested job data.
- `${checkin.streak}`, `${checkin.trackId}`, `${checkin.day}` — Check-in fields.
- Any custom key passed via `contextData` in the event payload.

**Behavior:**
- **Numeric coercion:** When a field's entire value is a single token (e.g. `"amount": "${checkin.streak}"`), the result is coerced to a number if the resolved value is numeric. This allows dynamic amounts.
- **Unresolved tokens:** Tokens that don't match any path in `contextData` resolve to an empty string (not left as-is). This prevents broken data but means missing context is silent.
- **No-op when absent:** If `contextData` is absent from the snapshot, the resolver does nothing — all values pass through unchanged. Fully backward-compatible.

### emitEvent Entry Type

Used inside [Outcome Blocks](#outcome-blocks) to dispatch a server event during reward processing. This connects the outcome system to the event/gift pipeline, allowing missions and crafting completions to trigger gifts, notifications, or other server-side actions.

```json
{
  "type": "emitEvent",
  "defId": "evt_mission_gift_drop",
  "payload": { "giftDefId": "gift_rare_loot" },
  "idempotencyKey": "mission-gift-${jobId}",
  "odds": 10,
  "requirements": [{ "type": "keeper_level", "value": 5, "operator": "gte" }]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"emitEvent"` | Yes | Entry type identifier |
| `defId` | string | Yes | References an [EventDefinition](#eventdefinition) ID |
| `payload` | object | No | Data passed to the event handler (e.g. `{ "giftDefId": "..." }` for gift creation). May include an optional `contextData` object for token resolution. |
| `idempotencyKey` | string | No | Prevents duplicate events. Supports `${jobId}` template which is replaced with the actual job ID at runtime. |
| `odds` | number | No | Percentage chance (0-100, default 100 = guaranteed) |
| `requirements` | array | No | Requirement conditions that must be met before odds are rolled |

**Processing order:** Requirements are checked first. If met, odds are rolled. If the roll succeeds, the event is dispatched via `EventService.dispatch()`. The event looks up the EventDefinition, validates security rules, and routes to the appropriate handler.

**Supported in:** MissionDef outcome blocks (`success.rewards`, `failure.rewards`) and RecipeDef reward processing.

### Event → Gift Flow

The complete flow from outcome entry to claimed gift:

```
Mission/Crafting completes
  → outcome.rewards[] contains { type: "emitEvent", defId: "evt_...", payload: { giftDefId: "gift_..." } }
  → Requirements checked → Odds rolled → EventService.dispatch() called
    → EventDefinition looked up by defId
    → Security.allowedEmitters validated against sourceType (MissionJob/CraftingJob)
    → Handler key routes to GiftService.createGiftForPlayer()
      → Context enrichment:
        → If sourceType is MissionJob/CraftingJob/BuildingJob → job looked up by sourceId
        → Auto-built context: { job: { id, type, defId, status, team, results, data, timer } }
        → payload.contextData merged (manual fields override auto-built on conflict)
      → GiftDef looked up, snapshot created (presentation + rewardSpec + contextData frozen)
      → GiftInstance created with UNCLAIMED status
      → Idempotency key prevents duplicates (unique constraint)
      → Notification sent to player ("You received a gift!")
  → Player opens gift inbox (GET /gifts)
  → Player claims gift (POST /gifts/:id/claim)
    → GiftClaimTx created with RNG seed
    → Token resolution: ${path} tokens in rewardSpec resolved against snapshotted contextData
    → RewardSpec resolved: currencies credited, items added, entities created
    → GiftInstance status → CLAIMED
```

**Key design properties:**
- **Snapshot pattern:** Gift rewards and `contextData` are frozen at creation time. Changing a GiftDef later does not affect already-created gifts.
- **Context enrichment:** Job context is auto-built from DB lookups — the emitEvent entry only needs to supply `giftDefId` in the payload. The mission service does not inject context manually.
- **Token resolution at claim time:** `${path}` tokens in the snapshotted `rewardSpec` are resolved against snapshotted `contextData` when the player claims, not when the gift is created.
- **Idempotent creation:** The `idempotencyKey` (unique constraint) prevents the same job from creating duplicate gifts, even if outcome processing runs multiple times.
- **Atomic claiming:** Each claim creates a GiftClaimTx with an RNG seed, making results deterministic and auditable. The `claimTxId` unique constraint on GiftInstance prevents double-claiming.

---

### Example Flow 1: Welcome Gems (Registration → Currency Gift)

New players receive 100 Premium Gems automatically upon registration.

**GiftDef record:**

```json
{
  "id": "gift_welcome_gems",
  "name": "Welcome Gems",
  "version": 1,
  "presentation": {
    "title": "Welcome to Derp Universe!",
    "body": "Here are 100 Gems to get you started on your journey. Spend them wisely!",
    "iconKey": "premium_gems",
    "rarity": "RARE"
  },
  "claimRules": {
    "limitPerPlayer": 1,
    "expiresInSeconds": 2592000
  },
  "rewardSpec": {
    "type": "currency",
    "currencyId": "premium_gems",
    "amount": 100
  },
  "enabled": true
}
```

**EventDefinition record:**

```json
{
  "id": "evt_welcome_gift",
  "name": "Welcome Gift",
  "version": 1,
  "kind": "system",
  "handlerKey": "createGiftForPlayer",
  "security": {},
  "enabled": true
}
```

**Dispatch (in AuthService, after user creation):**

```
EventService.dispatch('evt_welcome_gift', { giftDefId: 'gift_welcome_gems' }, {
  userId: user.id,
  sourceType: 'registration',
  sourceId: user.id,
  idempotencyKey: `welcome-gift-${user.id}`,
})
```

**Flow walkthrough:**

```
Player registers
  → AuthService creates user, location, starter entity
  → AuthService dispatches evt_welcome_gift (wrapped in try/catch so failures don't block registration)
    → EventDefinition looked up: handlerKey = "createGiftForPlayer"
    → Security: {} (empty = no emitter restrictions, accepts any sourceType)
    → GiftService.createGiftForPlayer() called
      → GiftDef "gift_welcome_gems" looked up
      → Snapshot frozen: presentation + rewardSpec copied from GiftDef
      → GiftInstance created: status=UNCLAIMED, expiresAt=now+30 days
      → Idempotency key "welcome-gift-{userId}" prevents duplicates
      → Notification sent: type=gift, priority=high
  → Player logs in, sees notification toast
  → Player opens gift inbox (GET /gifts) → sees Welcome Gems gift
  → Player claims (POST /gifts/:id/claim)
    → GiftClaimTx created with deterministic RNG seed
    → 100 premium_gems credited to UserCurrencyBalance
    → GiftInstance status → CLAIMED
```

**Key points:**
- `security: {}` means any sourceType can dispatch this event (registration is not a job type, so it would fail if `allowedEmitters` were set)
- `limitPerPlayer: 1` ensures even if dispatch runs twice, only one gift is created
- `expiresInSeconds: 2592000` gives the player 30 days to claim
- The try/catch in AuthService means gift failure never blocks user creation

---

### Example Flow 2: New Guest Arrived (Mission → Context-Seeded Entity Gift)

Players can receive a new bird entity as a gift triggered by mission outcomes. The gift uses token resolution to dynamically determine the entity definition and name based on the triggering mission context.

**GiftDef record:**

```json
{
  "id": "gift_mission_bird",
  "name": "Mission Bird Reward",
  "version": 1,
  "presentation": {
    "title": "A New Guest Has Arrived!",
    "body": "A mysterious bird has wandered into your outpost. Claim this gift to welcome them to your flock!",
    "iconKey": "entity_bird",
    "rarity": "EPIC"
  },
  "claimRules": {},
  "rewardSpec": {
    "type": "entity",
    "definitionId": "${job.defId}",
    "overrides": {
      "name": "${random(\"Dave\",\"DJ\",\"Dirty\")}"
    }
  },
  "enabled": true
}
```

> Note how `definitionId` uses `${job.defId}` — this resolves to the completing mission's definition ID at claim time. The `overrides.name` uses `${random(...)}` to randomly pick a name.

**EventDefinition record:**

```json
{
  "id": "evt_new_guest_arrived",
  "name": "New Guest Arrived",
  "version": 1,
  "kind": "system",
  "handlerKey": "createGiftForPlayer",
  "security": {
    "allowedEmitters": ["MissionJob", "CraftingJob"]
  },
  "enabled": true
}
```

**Triggering from a MissionDef outcome (emitEvent entry):**

```json
{
  "success": {
    "rewards": [
      { "type": "entity_xp", "min": 20, "max": 40, "odds": 100 },
      { "type": "currency", "key": "soft_arcanium", "min": 50, "max": 100, "odds": 100 },
      {
        "type": "emitEvent",
        "defId": "evt_new_guest_arrived",
        "payload": { "giftDefId": "gift_mission_bird" },
        "idempotencyKey": "bird-gift-${jobId}",
        "odds": 5,
        "requirements": [
          { "type": "keeper_level", "value": 3, "operator": "gte" }
        ]
      }
    ]
  }
}
```

**Flow walkthrough:**

```
Mission "mission_cave_explore" completes successfully
  → Outcome processing iterates success.rewards[]
    → entity_xp and currency granted normally
    → emitEvent entry found:
      → Requirements checked: keeper_level >= 3? If not met → skip silently
      → Odds rolled: 5% chance → if roll fails → skip
      → If both pass: EventService.dispatch('evt_new_guest_arrived', { giftDefId: 'gift_mission_bird' }, {
          userId, sourceType: 'MissionJob', sourceId: jobId,
          idempotencyKey: 'bird-gift-{jobId}'
        })
        → EventDefinition looked up: handlerKey = "createGiftForPlayer"
        → Security: allowedEmitters includes "MissionJob" → passes
        → Context enrichment:
          → sourceType is MissionJob → job looked up by sourceId
          → Auto-built: { job: { id, type: "MissionJob", defId: "mission_cave_explore", ... } }
        → GiftService.createGiftForPlayer() called
          → GiftDef "gift_mission_bird" looked up
          → Snapshot frozen: presentation + rewardSpec + contextData
          → GiftInstance created: status=UNCLAIMED, no expiry
          → Idempotency key "bird-gift-{jobId}" prevents duplicates
          → Notification sent: type=gift, priority=high
  → Player sees notification toast
  → Player claims gift (POST /gifts/:id/claim)
    → GiftClaimTx created
    → Token resolution against snapshotted contextData:
      → "${job.defId}" resolves to "mission_cave_explore"
      → "${random("Dave","DJ","Dirty")}" resolves to "DJ" (randomly selected)
    → Resolved rewardSpec: { type: "entity", definitionId: "mission_cave_explore", overrides: { name: "DJ" } }
    → New Entity created from "mission_cave_explore" definition, named "DJ", with random stats
    → GiftInstance status → CLAIMED
```

**Key points:**
- `allowedEmitters: ["MissionJob", "CraftingJob"]` restricts this event to only fire from mission/crafting outcomes (registration or other sources would be rejected)
- **Context enrichment is automatic** — the emitEvent entry only passes `giftDefId` in the payload. The job context (`{ job: { ... } }`) is built automatically by `EventService` via DB lookup of the source job.
- `${job.defId}` in `definitionId` means different missions can produce different entity types from the same GiftDef
- `${random("Dave","DJ","Dirty")}` randomly names the entity at claim time — the randomness happens per-claim, not per-gift-creation
- Token resolution happens **at claim time** against the **snapshotted** `contextData`, not against live data
- `claimRules: {}` means no per-player limit and no expiration
- `odds: 5` gives a 5% chance per eligible mission completion
- `requirements` gate the roll behind keeper level 3+
- `idempotencyKey: "bird-gift-${jobId}"` uses the job ID template variable, replaced at runtime with the actual mission job UUID

---

## Entity Events API

### GET /entities/:id/events

Returns a reverse-chronological list of significant events for a specific entity (mission completions, level-ups, injuries). Protected by JWT auth — only the owning player can query their own entity's events.

**Response:** Array of up to 50 event objects, sorted newest first.

```json
[
  {
    "type": "mission",
    "timestamp": "2026-05-13T10:30:00.000Z",
    "missionName": "Cave Exploration",
    "success": true,
    "xpGained": 150,
    "injured": false
  },
  {
    "type": "injury",
    "timestamp": "2026-05-12T08:00:00.000Z",
    "missionName": "Dangerous Raid"
  },
  {
    "type": "level_up",
    "timestamp": null,
    "level": 3,
    "gains": { "STR": 2, "VIT": 1 }
  }
]
```

**Event types:**

| type | Fields | Notes |
|---|---|---|
| `mission` | `timestamp`, `missionName`, `success`, `xpGained`, `injured` | One entry per completed/failed mission this entity participated in |
| `injury` | `timestamp`, `missionName` | Emitted alongside `mission` when `injured: true`; enables collapse separation |
| `level_up` | `timestamp: null`, `level`, `gains` | Sourced from `Entity.progression.levelHistory`; no timestamp available |

**Sorting:** Timestamped events sort newest-first. Level-up events (no timestamp) appear after all timestamped events, sorted by level descending.

**Cap:** Maximum 500 completed mission jobs scanned per call; response capped at 50 events.

---

## Outpost Slot System — Admin Endpoints

### PUT /admin/players/:id/bonus-outpost-slots

Grants a player bonus outpost slots on top of their level-derived cap.

**Header:** `x-admin-key: <ADMIN_SECRET>`

**Body:**
```json
{ "slots": 2 }
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `slots` | integer | 0–3 | Number of bonus outpost slots to grant. Replaces the current value. |

**Response:** Updated `User` record (BigInts serialized to strings).

**Effect on cap formula:**
```
maxActiveOutposts = min(1 + floor(keeperLevel / 20) + min(bonusSlots, 3), 7)
```
At level 1 with 0 bonus slots the cap is 1. Each 20 keeper levels adds 1 slot. Bonus slots are capped at 3 and cannot push the total above 7.

---

## Outpost Slot System — Commands

### SetPrimaryOutpost

Sets the player's preferred primary outpost. Pure display preference — no gameplay effect. The frontend uses this to decide which outpost to show first. Clears automatically if the outpost is disabled.

**Payload:**
```json
{ "locationId": "uuid" }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `locationId` | string (UUID) | yes | ID of an enabled LocationInstance owned by the player. |

**Validation:** Location must exist, belong to the calling player, and have `enabled: true`.

**Response patches:** `player` upsert with updated `primaryLocationId`.

---

## ToggleLocation — Deactivation Side-Effects

When `ToggleLocation` is sent with `enabled: false`, the following side-effects run atomically inside the same transaction (in addition to settling production):

1. **Last-outpost guard** — rejected with 400 if it would leave the player with 0 active outposts.
2. **Worker unassignment** — all `LocationWorkerAssignment` rows for the location are deleted; each affected entity's `state.status` is set to `idle`.
3. **Job cancellation** — all active `BuildingJob` and `CraftingJob` rows with `data.locationId` matching the location are set to `status: cancelled`. Active `MissionJob` rows whose `team` array overlaps with the unassigned entity IDs are also cancelled.
4. **Primary outpost clear** — if `User.primaryLocationId` matches this location, it is set to `null`.

Player and entity delta patches for affected jobs/entities should be re-fetched by the frontend via the normal delta/SSE pipeline.
