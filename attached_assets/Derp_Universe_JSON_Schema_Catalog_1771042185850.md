# 🧾 Derp Universe -- Universal Schemas as JSON Objects

## Overview

This document provides **JSON object representations** of the universal
schema models we've discussed, in two layers:

-   **Definitions (Static Content)**
-   **Instances (Runtime / Player-Owned State)**

These JSON objects are intended as canonical payload shapes for: -
content pipelines (definitions), - API contracts, - and JSONB storage
(where applicable).

------------------------------------------------------------------------

# 1) ENTITY (CHARACTER) DEFINITIONS

## 1.1 EntityDefinition (static)

``` json
{
  "id": "bird_default",
  "speciesId": "bird",
  "bodySchemaId": "avian_7",
  "equipmentSchemaId": "bird_relic_pool_3",
  "progressionProfileId": "standard_bird",
  "rules": {
    "allowedArchetypes": ["all"],
    "specialRules": {}
  }
}
```

## 1.2 BodySchema (static)

``` json
{
  "id": "avian_7",
  "slots": ["head", "ears", "beak", "eyes", "body", "back", "tail"]
}
```

## 1.3 ProgressionProfile (static)

``` json
{
  "id": "standard_bird",
  "leveling": true,
  "ascension": true,
  "mastery": true,
  "prestigeEligible": true,
  "maxLevel": 50,
  "ascensionCap": 5
}
```

## 1.4 EquipmentSchema (static)

Supports pooled slots and/or discrete slots.

``` json
{
  "id": "bird_relic_pool_3",
  "schema": {
    "slotPools": [
      { "id": "relic", "capacity": 3, "allowedTags": ["relic"] }
    ],
    "discreteSlots": []
  }
}
```

## 1.5 TraitDefinition (static)

``` json
{
  "id": "trait_ninja_head_03",
  "archetype": "ninja",
  "statModifiers": { "spd": 2, "atk": 1 },
  "tags": ["stealth", "jungle_affinity"]
}
```

------------------------------------------------------------------------

# 2) ENTITY (CHARACTER) INSTANCES

## 2.1 Entity (instance)

``` json
{
  "id": "9e7a1f2c-1111-4444-8888-9d0a0b1c2d3e",
  "ownerUserId": "11111111-2222-3333-4444-555555555555",
  "nftAssetId": "cardano_asset_...optional",

  "definitionId": "bird_default",
  "speciesId": "bird",
  "role": "player_unit",

  "display": {
    "name": "Derp #1234",
    "portraitAssetId": "portrait_derp_1234",
    "cosmetics": {
      "skinId": null,
      "frameId": "frame_season_1",
      "titleId": "title_chaos_enjoyer"
    }
  },

  "progression": {
    "level": 12,
    "xp": 15400,
    "ascensionTier": 1,
    "prestigeCount": 0,
    "mastery": {
      "treeId": "ninja_tree",
      "nodes": { "path1_node1": true },
      "totalMpts": 3
    }
  },

  "stats": {
    "atk": 78,
    "def": 44,
    "spd": 62,
    "foc": 31,
    "lck": 15,
    "vit": 110,
    "extra": {}
  },

  "traits": {
    "schemaId": "avian_7",
    "slots": {
      "head": "trait_ninja_head_03",
      "ears": "trait_ninja_ears_01",
      "beak": "trait_buff_beak_02",
      "eyes": "trait_ninja_eyes_04",
      "body": "trait_buff_body_01",
      "back": "trait_buff_back_01",
      "tail": "trait_monk_tail_02"
    }
  },

  "archetypeVector": {
    "ninja": 4,
    "buff": 3,
    "monk": 1
  },

  "affinities": {
    "elemental": ["cosmic"],
    "regional": ["chillvine_jungle"],
    "faction": ["shadow_guild"]
  },

  "state": {
    "status": "idle",
    "statusExpiresAt": null,
    "assignedOutpostId": null,
    "injury": { "active": false, "expiresAt": null },
    "lock": { "reason": null, "expiresAt": null }
  },

  "timestamps": {
    "createdAt": "2026-02-13T00:00:00Z",
    "updatedAt": "2026-02-13T00:00:00Z"
  },

  "version": 1
}
```

## 2.2 EntityEquipment (instance join)

Supports multi-slot equipment via `slotClaims`.

``` json
{
  "id": "2c5c8c10-aaaa-bbbb-cccc-111122223333",
  "entityId": "9e7a1f2c-1111-4444-8888-9d0a0b1c2d3e",
  "itemInstanceId": "7c1b2a33-9999-8888-7777-666655554444",
  "slotClaims": [
    { "poolId": "relic", "amount": 2 }
  ],
  "equippedAt": "2026-02-13T00:00:00Z"
}
```

------------------------------------------------------------------------

# 3) UNIVERSAL LOCATION / OUTPOST DEFINITIONS

## 3.1 RegionDefinition (static)

``` json
{
  "id": "chillvine_jungle",
  "displayName": "Chillvine Jungle",
  "biome": "rainforest",
  "modifiers": {
    "favoredArchetypes": ["ninja", "monk"],
    "productionBonus": 0.10
  }
}
```

## 3.2 LocationDefinition (static)

``` json
{
  "id": "outpost_fungible_base",
  "kind": "outpost_fungible",
  "regionId": "chillvine_jungle",
  "isUnique": false,
  "rules": {
    "maxLevel": 50,
    "allowsCorruption": false,
    "workerSlotsByLevel": {
      "1": 2, "10": 3, "20": 4, "30": 5, "40": 6, "50": 7
    }
  },
  "productionProfile": {
    "baseOutputs": {
      "arcanium": 100,
      "materials_common": 10
    }
  }
}
```

## 3.3 BuildingDefinition (static)

``` json
{
  "id": "generator",
  "displayName": "Generator",
  "tags": ["production"],
  "rules": {
    "maxCount": 2,
    "produces": ["arcanium", "materials_common"]
  }
}
```

## 3.4 RoomDefinition (static)

``` json
{
  "id": "research_bench",
  "displayName": "Research Bench",
  "tags": ["research", "efficiency"],
  "rules": {
    "requiresBuilding": "lab",
    "maxCount": 3
  }
}
```

## 3.5 LocationBuildingDefinition (static link)

``` json
{
  "id": "outpost_fungible_base__generator",
  "locationDefId": "outpost_fungible_base",
  "buildingDefId": "generator",
  "rules": {
    "minCount": 1,
    "maxCount": 2,
    "unlockLevel": 1
  }
}
```

## 3.6 LocationRoomDefinition (static link)

``` json
{
  "id": "outpost_fungible_base__research_bench",
  "locationDefId": "outpost_fungible_base",
  "roomDefId": "research_bench",
  "rules": {
    "maxCount": 3,
    "unlockLevel": 10
  }
}
```

------------------------------------------------------------------------

# 4) UNIVERSAL LOCATION / OUTPOST INSTANCES

## 4.1 LocationInstance (instance)

``` json
{
  "id": "8a3b7d10-1234-5678-9012-abcdefabcdef",
  "ownerUserId": "11111111-2222-3333-4444-555555555555",
  "nftAssetId": null,

  "definitionId": "outpost_fungible_base",
  "regionId": "chillvine_jungle",
  "kind": "outpost_fungible",
  "isUnique": false,

  "level": 14,
  "xp": 9000,

  "threatLevel": 22,
  "corruptionLevel": 0,

  "lastCollectionTick": 105000,

  "storage": {
    "capacity": {
      "arcanium": 150000,
      "materials_common": 3000,
      "materials_advanced": 800
    },
    "stored": {
      "arcanium": 42000,
      "materials_common": 1200,
      "materials_advanced": 130
    }
  },

  "state": {
    "seasonalModifiers": [],
    "locks": []
  },

  "timestamps": {
    "createdAt": "2026-02-13T00:00:00Z",
    "updatedAt": "2026-02-13T00:00:00Z"
  },

  "version": 1
}
```

## 4.2 LocationBuildingInstance (instance)

``` json
{
  "id": "bld-1111-2222-3333-4444",
  "locationId": "8a3b7d10-1234-5678-9012-abcdefabcdef",
  "buildingDefId": "generator",
  "level": 3,
  "state": {
    "upgradeQueued": false
  }
}
```

## 4.3 LocationRoomInstance (instance)

``` json
{
  "id": "rm-1111-2222-3333-4444",
  "locationId": "8a3b7d10-1234-5678-9012-abcdefabcdef",
  "roomDefId": "research_bench",
  "buildingInstanceId": null,
  "level": 1,
  "state": {}
}
```

## 4.4 LocationWorkerAssignment (instance)

``` json
{
  "id": "wrk-1111-2222-3333-4444",
  "locationId": "8a3b7d10-1234-5678-9012-abcdefabcdef",
  "entityId": "9e7a1f2c-1111-4444-8888-9d0a0b1c2d3e",
  "roleTag": "production",
  "bonus": {
    "productionMultiplier": 0.08
  },
  "assignedAt": "2026-02-13T00:00:00Z"
}
```

------------------------------------------------------------------------

# Notes on Usage

## Definitions vs Instances

-   **Definitions** are authored content and should be versioned or
    treated as immutable.
-   **Instances** are player/world state and mutate frequently.

## Cached Fields

-   `speciesId` and `archetypeVector` can be treated as cached fields
    for performance, recomputed server-side when needed.

## Multi-slot Equipment

-   Use `slotClaims` on `EntityEquipment` to represent occupancy and
    enforce pooled/discrete slot rules.

------------------------------------------------------------------------

**End of JSON Object Schema Catalog**
