# Admin Panel Schema Documentation

This document describes each definition table editable through the Admin Panel, the unified Job system for runtime activities, instance tables, and all shared JSON structure formats.

---

## Table of Contents

### Definition Tables
1. [Currency](#currency)
2. [ItemDef (Items)](#itemdef)
3. [EntityDefinition](#entitydefinition)
4. [BodySchema](#bodyschema)
5. [EquipmentSchema](#equipmentschema)
6. [ProgressionProfile](#progressionprofile)
7. [TraitDefinition](#traitdefinition)
8. [RegionDefinition](#regiondefinition)
9. [LocationDefinition](#locationdefinition)
10. [BuildingDef (Buildings)](#buildingdef)
11. [RoomDef (Rooms)](#roomdef)
12. [DisplayDef](#displaydef)
13. [MissionCategoryDef](#missioncategorydef)
14. [MissionDef (Missions / Quests)](#missiondef)
15. [RecipeDef (Crafting Recipes)](#recipedef)
16. [EventDefinition](#eventdefinition)
17. [GiftDef](#giftdef)
18. [ModalDef](#modaldef)
19. [LootboxDef](#lootboxdef)
20. [CheckInDef](#checkindef)
21. [QuestDef](#questdef)
22. [ShopItemDef](#shopitemdef)

### Runtime Tables
23. [Job (Unified Job System)](#job)
24. [Notification](#notification)
25. [TickRateInterval](#tickrateinterval)
26. [BoostEvent](#boostevent)

### Instance Tables
27. [Entity (Instance)](#entity-instance)
28. [EntityEquipment](#entityequipment)
29. [LocationInstance](#locationinstance)
30. [LocationBuildingInstance](#locationbuildinginstance)
31. [LocationRoomInstance](#locationroominstance)
32. [LocationWorkerAssignment](#locationworkerassignment)
33. [ItemInstance](#iteminstance)
34. [GiftInstance](#giftinstance)
35. [GiftClaimTx](#giftclaimtx)

### Shared JSON Formats
36. [Unified Level-Based Rules System](#unified-level-based-rules-system)
37. [Timer](#timer)
38. [Cost Objects](#cost-objects)
39. [Outcome Blocks](#outcome-blocks)
40. [Rewards](#rewards)
41. [Requirements](#requirements)
42. [Visibility Requirements](#visibility-requirements)
43. [Effects](#effects)
44. [Extra Data](#extra-data)
45. [Gift Reward Spec](#gift-reward-spec)
46. [Event → Gift Flow](#event--gift-flow)
47. [Example Flow 1: Welcome Gems](#example-flow-1-welcome-gems-registration--currency-gift)
48. [Example Flow 2: New Guest Arrived](#example-flow-2-new-guest-arrived-missioncrafting--entity-gift)

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

Defines an item that can exist in player inventories. Supports materials, potions, consumables, gear, and quest items with full rarity tiers, equipment data, stat modifiers, and seasonal tagging.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `mat_iron_ore`, `gear_iron_sword`) |
| `version` | number | No | 1 | Schema version for forward compatibility |
| `type` | ItemType enum | Yes | — | One of: `MATERIAL`, `POTION`, `CONSUMABLE`, `GEAR`, `QUEST` |
| `rarity` | ItemRarity enum | No | `COMMON` | Rarity tier (see [ItemRarity Enum](#itemrarity-enum)) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text |
| `iconKey` | string | No | — | Key used to resolve the display icon |
| `iconUrl` | string | No | — | Direct URL to an icon image |
| `uiColor` | string | No | — | CSS color for UI accent (e.g. border glow) |
| `category` | ItemCategory enum | No | `MISC` | One of: `MISC`, `CRAFTING`, `COMBAT`, `EXPLORATION`, `QUEST_ITEMS`, `ENHANCEMENT` |
| `groups` | string[] | No | `[]` | Tags for filtering/searching (e.g. `["ore", "basic"]`, `["weapon", "melee"]`) |
| `tags` | string[] | No | `[]` | Additional classification tags |
| `stackable` | boolean | No | false | Whether multiple units stack in one inventory slot |
| `maxStack` | number | No | — | Maximum stack size (blank = unlimited when stackable) |
| `uniqueInstance` | boolean | No | false | If true, each item gets its own ItemInstance (no stacking) |
| `tradable` | boolean | No | true | Whether the item can be traded between players |
| `bindOnEquip` | boolean | No | false | Item becomes bound (untradeable) when equipped |
| `bindOnPickup` | boolean | No | false | Item becomes bound (untradeable) when acquired |
| `hasState` | boolean | No | false | Whether instances of this item carry dynamic state |
| `stateSchema` | JSON | No | — | JSON Schema defining the shape of instance state |
| `equipData` | JSON | No | — | Equipment slot and stat bonuses (see [EquipData](#equipdata)) |
| `statModifiers` | JSON | No | — | Passive stat modifiers when held or equipped |
| `passiveEffects` | JSON | No | — | Passive effects applied while the item is in inventory or equipped |
| `consumableData` | JSON | No | — | Consumable behavior (see [ConsumableData](#consumabledata)) |
| `craftingData` | JSON | No | — | Crafting-related metadata |
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

Used in the `consumableData` field on potion/consumable items:

```json
{
  "effect": "heal",
  "amount": 50
}
```

```json
{
  "effect": "speed_boost",
  "duration": 60
}
```

| Property | Type | Description |
|---|---|---|
| `effect` | string | Effect type (e.g. `heal`, `speed_boost`, `luck_boost`, `xp_boost`) |
| `amount` | number | Magnitude of the effect (for instant effects like healing) |
| `duration` | number | Duration in seconds (for timed buffs) |
| `multiplier` | number | Multiplier value (for XP scrolls, etc.) |

---

## EntityDefinition

Defines a species/type of game entity (character). Each entity definition references schemas for body, equipment, and progression.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `derp_bird`) |
| `speciesId` | string | Yes | — | Species identifier for grouping |
| `bodySchemaId` | string | Yes | — | References a [BodySchema](#bodyschema) |
| `equipmentSchemaId` | string | Yes | — | References an [EquipmentSchema](#equipmentschema) |
| `progressionProfileId` | string | Yes | — | References a [ProgressionProfile](#progressionprofile) |
| `rules` | JSON | No | `{}` | Level-based rules (see [Unified Level-Based Rules System](#unified-level-based-rules-system)) |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## BodySchema

Defines the body slot structure for an entity type. Determines which slots exist and which archetypes (trait types) are allowed per slot.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `avian_7`) |
| `slots` | JSON | No | `[]` | Map of slot name → array of allowed archetype names (stored as JSON, default is empty array `[]` but populated as an object map) |
| `data` | JSON | No | `{}` | Freeform extra data |

**Slots format** — a map where keys are slot names and values are arrays of allowed archetype strings:

```json
{
  "head": ["Dave", "Astro", "Magician", "Ninja", "Redneck", "Stoner", "DJ", "Viking", "Monk", "Corpo", "Cyborg", "Buff", "Mad Scientist", "Deity"],
  "ears": ["Dave", "Astro", "Magician", "Ninja", "Redneck", "Stoner", "DJ", "Viking", "Monk", "Corpo", "Cyborg", "Buff", "Mad Scientist", "Deity"],
  "beak": ["..."],
  "eyes": ["..."],
  "body": ["..."],
  "back": ["..."],
  "tail": ["..."]
}
```

The current body schema `avian_7` defines 7 slots: `head`, `ears`, `beak`, `eyes`, `body`, `back`, `tail`. All 14 archetypes are allowed in every slot.

---

## EquipmentSchema

Defines the equipment slot layout for an entity type. Controls how many items can be equipped in each slot category.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `bird_equip_v1`) |
| `schema` | JSON | No | `{}` | Map of equipment slot → max count |
| `data` | JSON | No | `{}` | Freeform extra data |

**Schema format:**

```json
{
  "weapon": 1,
  "armor": 1,
  "accessory": 2
}
```

---

## ProgressionProfile

Defines the leveling, ascension, and mastery rules for an entity type.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `bird_prog_v1`) |
| `leveling` | boolean | No | true | Whether entities can level up |
| `ascension` | boolean | No | true | Whether entities can ascend |
| `mastery` | boolean | No | true | Whether entities can gain mastery |
| `prestigeEligible` | boolean | No | true | Whether entities are eligible for prestige |
| `maxLevel` | number | No | 50 | Maximum level cap |
| `ascensionCap` | number | No | 5 | Maximum ascension tier |
| `data` | JSON | No | `{}` | Freeform extra data |

---

## TraitDefinition

Defines an archetype trait that can be assigned to entity body slots. Each trait provides per-slot stat bonuses.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `dave`, `ninja`, `deity`) |
| `archetype` | string | Yes | — | Display name of the archetype (e.g. `Dave`, `Ninja`, `Deity`) |
| `slotStats` | JSON | No | `{}` | Nested map of slot → stat bonuses (see below) |
| `tags` | JSON | No | `[]` | Classification tags |
| `data` | JSON | No | `{}` | Freeform extra data |

**slotStats format** — a nested map where the outer key is the body slot name and the inner map is stat ID → bonus value:

```json
{
  "head": { "ATK": 1, "DEF": 1 },
  "beak": { "SPD": 2 },
  "eyes": { "FOC": 1 },
  "body": { "VIT": 1 },
  "ears": { "FOC": 1 },
  "back": { "DEF": 1 },
  "tail": { "SPD": 1 }
}
```

Entity stats are computed by summing the per-slot bonuses from each trait assigned to each slot. For example, if a `Ninja` trait is assigned to the `head` slot, the entity gains `{ SPD: 1, ATK: 1 }` from that slot.

**Current archetypes (14 total):**
Dave, Astro, Magician, Ninja, Redneck, Stoner, DJ, Viking, Monk, Corpo, Cyborg, Buff, Mad Scientist, Deity

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
| `data` | JSON | No | `{}` | Freeform extra data |

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
| `data` | JSON | No | `{}` | Freeform extra data |

---

## MissionDef

Defines a mission or quest that players can send their entities (birds) on.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `mission_quick_gather`) |
| `name` | string | Yes | — | Display name |
| `description` | string | No | — | Flavor text or instructions |
| `type` | string | Yes | — | Mission type (e.g. `quick`, `standard`, `raid`, `story`) |
| `category` | string | No | — | Grouping category string for UI filtering |
| `group` | string | No | — | Sub-group within a category |
| `difficulty` | number | No | 0 | Difficulty rating affecting success calculations |
| `minSuccessChance` | int | No | 0 | Floor for success chance (0–100) |
| `maxSuccessChance` | int | No | 100 | Ceiling for success chance (0–100) |
| `timer` | JSON | No | (see [Timer](#timer)) | Duration, boost, and skip settings (see [Timer](#timer)) |
| `success` | JSON | No | `{"rewards":[],"effects":[],"text":[]}` | Outcome block for mission success (see [Outcome Blocks](#outcome-blocks)) |
| `failure` | JSON | No | `{"rewards":[],"effects":[],"text":[]}` | Outcome block for mission failure (see [Outcome Blocks](#outcome-blocks)) |
| `requirements` | JSON | No | `[]` | All conditions including team size, keeper level, flags, etc. (see [Requirements](#requirements)) |
| `visibilityRequirements` | JSON | No | `[]` | Conditions for the mission to appear in the UI (see [Visibility Requirements](#visibility-requirements)) |
| `tags` | JSON | No | `[]` | Classification tags for filtering (e.g. `["beginner"]`, `["seasonal"]`) |
| `rewardPreview` | JSON | No | `[]` | Preview of possible rewards shown to the player before starting |
| `enabled` | boolean | No | true | Whether this mission is currently active |
| `displayDefId` | string | No | — | References a [DisplayDef](#displaydef) for card visual styling |
| `missionCategoryDefId` | string | No | — | References a [MissionCategoryDef](#missioncategorydef) for grouping |
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
| `data` | JSON | No | `{}` | Freeform extra data |

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
| `enabled` | boolean | No | true | Whether this event is active. Disabled events throw an error if dispatched. |

> **Note:** Payload validation is handled directly in each handler. For example, the `createGiftForPlayer` handler validates that `giftDefId` is present in the payload.

### Handler Keys

| Key | Description | Expected Payload |
|---|---|---|
| `createGiftForPlayer` | Creates a GiftInstance for the triggering player | `{ "giftDefId": "<GiftDef ID>" }` |

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
| `rewardSpec` | JSON | No | `{}` | What the player receives on claim (see [Gift Reward Spec](#gift-reward-spec)) |
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

Defines a server-driven modal template. Modals are constructed by the backend and delivered to the client via the `UiIntent` system. The `spec` field provides overrides applied on top of any default modal structure.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier (e.g. `modal_mission_complete`) |
| `name` | string | Yes | — | Admin-facing display name |
| `description` | string | No | — | Notes on what this modal is for |
| `version` | number | No | 1 | Schema version |
| `spec` | JSON | No | `{}` | ModalSpecV1 overrides: `{ header?, body?, buttons?, replaceBody? }` |
| `enabled` | boolean | No | true | Whether this modal is active |

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
{ "type": "interval", "seconds": 86400 }
```

| Property | Type | Description |
|---|---|---|
| `type` | string | `"daily"` (resets at midnight UTC) or `"interval"` (fixed seconds since last claim) |
| `seconds` | number | Only used when `type: "interval"` — number of seconds between windows |

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

Each entry in `objectives` describes one trackable goal. Objectives are matched against player telemetry events:

```json
[
  {
    "id": "obj_complete_missions",
    "label": "Complete 5 missions",
    "eventType": "mission_completed",
    "targetCount": 5,
    "filters": { "missionType": "exploration" }
  },
  {
    "id": "obj_craft_items",
    "label": "Craft 3 items",
    "eventType": "crafting_completed",
    "targetCount": 3
  }
]
```

| Property | Type | Description |
|---|---|---|
| `id` | string | Unique objective ID within the quest |
| `label` | string | Human-readable description shown in the UI |
| `eventType` | string | Telemetry event type to track (e.g. `mission_completed`, `lootbox_opened`, `checkin_completed`) |
| `targetCount` | number | How many matching events are required to complete this objective |
| `filters` | object | Optional key-value pairs that the telemetry event payload must match for the event to count |

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

## Entity (Instance)

A player-owned entity instance (e.g. a bird character). Created from an EntityDefinition with randomized traits and computed stats.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string (UUID) | Auto | — | Unique identifier |
| `ownerUserId` | string | Yes | — | Player who owns this entity |
| `nftAssetId` | string | No | — | Optional NFT asset link (unique) |
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

**Stats computation:** An entity's `stats` are the sum of per-slot bonuses from assigned traits. For each slot in `traits`, the system looks up the corresponding [TraitDefinition](#traitdefinition) and adds the `slotStats[slot]` bonuses to the totals.

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
| `storage` | JSON | No | `{}` | Current resource storage state |
| `state` | JSON | No | `{}` | Dynamic runtime state |
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
| `state` | JSON | No | `{}` | Dynamic runtime state |
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
| `state` | JSON | No | `{}` | Dynamic runtime state |
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
| `state` | JSON | No | — | Dynamic instance state (for items with `hasState: true`) |
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

The `snapshot` JSON preserves the GiftDef state at creation time so the gift is immune to later definition changes:

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
  }
}
```

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
  "constructionCost": [
    { "type": "currency", "id": "soft_arcanium", "baseAmount": 50, "growthRate": "exp", "growthScalar": 1.5 }
  ],
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
| `constructionCost` | ResourceEntry[] | Construction cost definitions |
| `effects` | array | Effects active at this level (e.g. `[{ "type": "production_multiplier_bps", "amount": 11000 }]`) |
| `timer` | object | Timer configuration (e.g. construction time) |

### ResourceEntry

Used in `storage`, `production`, and `constructionCost` arrays:

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

Used in the `rewardSpec` field on [GiftDef](#giftdef). Defines what a player receives when they claim a gift. Supports single rewards and bundles of multiple rewards.

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
| `entity` | `definitionId` (entity definition ID) | Creates a new entity with randomized stats |
| `cosmetic` | — | Not yet implemented |
| `lootTable` | — | Not yet implemented |

Entity rewards create a new entity instance using the same random stat generation as initial character creation (stats randomly assigned in the 8-15 range per stat: ATK, DEF, SPD, FOC, LCK, VIT).

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
| `payload` | object | No | Data passed to the event handler (e.g. `{ "giftDefId": "..." }` for gift creation) |
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
      → GiftDef looked up, snapshot created (presentation + rewardSpec frozen)
      → GiftInstance created with UNCLAIMED status
      → Idempotency key prevents duplicates (unique constraint)
      → Notification sent to player ("You received a gift!")
  → Player opens gift inbox (GET /gifts)
  → Player claims gift (POST /gifts/:id/claim)
    → GiftClaimTx created with RNG seed
    → RewardSpec resolved: currencies credited, items added, entities created
    → GiftInstance status → CLAIMED
```

**Key design properties:**
- **Snapshot pattern:** Gift rewards are frozen at creation time. Changing a GiftDef later does not affect already-created gifts.
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

### Example Flow 2: New Guest Arrived (Mission/Crafting → Entity Gift)

Players can receive a new bird entity as a gift triggered by mission or crafting outcomes.

**GiftDef record:**

```json
{
  "id": "gift_starter_bird",
  "name": "Starter Bird",
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
    "definitionId": "derp_bird"
  },
  "enabled": true
}
```

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
        "payload": { "giftDefId": "gift_starter_bird" },
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
Mission completes successfully
  → Outcome processing iterates success.rewards[]
    → entity_xp and currency granted normally
    → emitEvent entry found:
      → Requirements checked: keeper_level >= 3? If not met → skip silently
      → Odds rolled: 5% chance → if roll fails → skip
      → If both pass: EventService.dispatch('evt_new_guest_arrived', { giftDefId: 'gift_starter_bird' }, {
          userId, sourceType: 'MissionJob', sourceId: jobId,
          idempotencyKey: 'bird-gift-{jobId}'
        })
        → EventDefinition looked up: handlerKey = "createGiftForPlayer"
        → Security: allowedEmitters includes "MissionJob" → passes
        → GiftService.createGiftForPlayer() called
          → GiftDef "gift_starter_bird" looked up
          → Snapshot frozen: presentation + rewardSpec
          → GiftInstance created: status=UNCLAIMED, no expiry (claimRules is empty)
          → Idempotency key "bird-gift-{jobId}" prevents duplicates if job re-processes
          → Notification sent: type=gift, priority=high
  → Player sees notification toast
  → Player claims gift (POST /gifts/:id/claim)
    → GiftClaimTx created
    → New Entity created from "derp_bird" definition with random traits
    → GiftInstance status → CLAIMED
```

**Key points:**
- `allowedEmitters: ["MissionJob", "CraftingJob"]` restricts this event to only fire from mission/crafting outcomes (registration or other sources would be rejected)
- `claimRules: {}` means no per-player limit and no expiration — once created, the gift lives forever until claimed
- `odds: 5` gives a 5% chance per eligible mission completion
- `requirements` gate the roll behind keeper level 3+, so new players don't get overwhelmed
- `idempotencyKey: "bird-gift-${jobId}"` uses the job ID template variable, replaced at runtime with the actual mission job UUID
- The entity reward type creates a brand new Entity instance from the `derp_bird` EntityDefinition, complete with random trait assignments
