# Render Blocks Reference

The Derp Universe frontend uses a **three-tier block/render pipeline**. Every piece of server-driven UI is expressed as one of the block types described here. When you want new UI, add a block — never a parallel rendering system.

- [Modal Blocks](#modal-blocks) — atomic content elements used inside modals and content documents
- [Screen Composition Blocks](#screen-composition-blocks) — full-width card/section components placed on page layouts
- [Content Document Blocks](#content-document-blocks) — mission-specific and generic pass-through blocks for the content document surface
- [Supporting Types](#supporting-types) — shared sub-types referenced by multiple blocks
- [Modal Shell](#modal-shell) — the top-level `ModalSpecV1` wrapper and button/action vocabulary

---

## Modal Blocks

**Source:** `packages/shared/src/types/modal.ts`  
**Renderer:** `apps/web/src/components/modal/blocks/BlockRenderer.tsx`  
**Used in:** `ModalPageSpec.body`, `ModalButton.requiresConfirm.body`, content document pass-throughs

All modal block objects carry a discriminant `type` field. Many carry an optional `from?: string` metadata hint used by tooling — ignore it at runtime.

---

### `richText`

Structured formatted text. Supports headings, paragraphs, lists, bold/italic, inline code, links, and token substitutions.

```json
{
  "type": "richText",
  "doc": [ ...RichTextNode[] ],
  "from": "optional-source-hint"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `doc` | `RichTextNode[]` | ✅ | Ordered list of rich text nodes. See [RichTextNode](#richtextnode). |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `divider`

A horizontal visual separator line. No configuration.

```json
{ "type": "divider" }
```

---

### `image`

A full-width image block with an optional caption below it.

```json
{
  "type": "image",
  "image": { "assetKey": "banner_season_3", "alt": "Season 3" },
  "caption": "The new era begins.",
  "from": "optional-source-hint"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `image` | `AssetRef` | ✅ | Asset key to resolve. See [AssetRef](#assetref). |
| `caption` | `string` | — | Small caption text rendered below the image. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `metaRows`

A table of label → value pairs. Values can optionally include inline item icons with quantities.

```json
{
  "type": "metaRows",
  "rows": [
    { "label": "Duration", "value": "4h 30m" },
    { "label": "Cost", "value": "500", "valueItems": [{ "assetKey": "gold", "amount": 500 }] }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `rows` | `MetaRow[]` | ✅ | Ordered list of rows. |
| `rows[].label` | `string` | ✅ | Left-side label text. |
| `rows[].value` | `string` | ✅ | Right-side value text. |
| `rows[].valueItems` | `MetaRowValueItem[]` | — | Optional list of icon+amount items rendered alongside the value string. Each item: `{ assetKey: string, amount: number }`. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `timer`

A live countdown timer that ticks down to an ISO timestamp. Triggers a modal refresh when it reaches zero (via `ModalRefreshContext`).

```json
{
  "type": "timer",
  "endsAt": "2026-06-01T00:00:00Z",
  "label": "Mission completes in"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `endsAt` | `string` (ISO 8601) | ✅ | UTC timestamp the timer counts down to. |
| `label` | `string` | — | Text shown above the countdown digits. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `progress`

A labelled progress bar. Can be driven by explicit `current`/`max` values or auto-derived from `startsAt`/`endsAt` timestamps.

```json
{
  "type": "progress",
  "label": "Crafting…",
  "current": 40,
  "max": 100,
  "startsAt": "2026-05-23T10:00:00Z",
  "endsAt": "2026-05-23T12:00:00Z"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `current` | `number` | ✅ | Current progress value. |
| `max` | `number` | ✅ | Maximum (100%) value. |
| `label` | `string` | — | Text shown above the bar. |
| `startsAt` | `string` (ISO 8601) | — | Start time; used to auto-compute `current` when time-driven. |
| `endsAt` | `string` (ISO 8601) | — | End time; used to auto-compute fill when time-driven. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `rewardsPreview`

A compact reward grid showing estimated/upcoming rewards. Renders with a "Preview" label and tighter spacing.

```json
{
  "type": "rewardsPreview",
  "items": [
    { "name": "Gold", "qty": 500, "assetKey": "currency_gold" },
    { "name": "Rare Egg", "qty": 1, "assetKey": "egg_rare", "rarity": "rare" }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `items` | `RewardItem[]` | ✅ | List of rewards to display. See [RewardItem](#rewarditem). |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `rewardsList`

An expanded reward list with an optional custom title. Used for confirmed/collected rewards.

```json
{
  "type": "rewardsList",
  "title": "Mission Rewards",
  "items": [
    { "name": "Gold", "qty": 250, "assetKey": "currency_gold", "note": "×2 weekend bonus" }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `items` | `RewardItem[]` | ✅ | List of rewards to display. See [RewardItem](#rewarditem). |
| `title` | `string` | — | Section title shown above the list. Defaults to `"Rewards"`. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `inventoryDelta`

Shows changes to the player's inventory — positive quantities in green, negative in red. Used for crafting consume/produce summaries.

```json
{
  "type": "inventoryDelta",
  "items": [
    { "name": "Iron Ore", "assetKey": "item_iron_ore", "qtyDelta": -3 },
    { "name": "Iron Bar", "assetKey": "item_iron_bar", "qtyDelta": 1 }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `items` | `InventoryDeltaItem[]` | ✅ | List of inventory changes. |
| `items[].name` | `string` | ✅ | Display name of the item. |
| `items[].assetKey` | `string` | — | Asset key for the item icon. |
| `items[].qtyDelta` | `number` | ✅ | Change in quantity. Negative = consumed, positive = gained. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `giftReveal`

An animated gift-opening experience. The player taps to reveal rewards. Rendered by `GiftRevealBlock`.

```json
{
  "type": "giftReveal",
  "gift": {
    "giftId": "gift_daily_001",
    "title": "Daily Gift",
    "image": { "assetKey": "gift_box_gold" }
  },
  "rewards": [
    { "name": "Gems", "qty": 50, "assetKey": "currency_gems" }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `gift` | `object` | ✅ | Gift metadata. |
| `gift.giftId` | `string` | ✅ | Identifier for the gift instance. |
| `gift.title` | `string` | ✅ | Display title shown on the gift card. |
| `gift.image` | `AssetRef` | — | Image shown on the gift card before opening. |
| `rewards` | `RewardItem[]` | — | Rewards revealed after the player taps. If omitted, revealed server-side. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `list`

A container block that renders its children in sequence. The `list` string is a server-supplied identifier; `emptyText` is shown when `children` is empty.

```json
{
  "type": "list",
  "list": "mission_participants",
  "emptyText": "No participants yet.",
  "children": [ ...ModalBlock[] ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `list` | `string` | ✅ | Identifier for this list (used by tooling/logging). |
| `children` | `ModalBlock[]` | ✅ | Nested blocks rendered in order. Each child can be any `ModalBlock` type. |
| `emptyText` | `string` | — | Fallback text shown when `children` is empty. |

---

### `clickReveal`

A "scratch-off" interactive block. The player taps a cover to reveal child blocks underneath. Supports sound and visual effects mapped to item tags (e.g. for lootbox pulls).

```json
{
  "type": "clickReveal",
  "cover": "Tap to reveal your reward!",
  "coverImage": { "assetKey": "lootbox_cover" },
  "tags": "legendary",
  "soundMap": "legendary=sfx_legendary, *=sfx_common",
  "fxMap": "legendary=sparkle_gold, *=sparkle_white",
  "children": [ ...ModalBlock[] ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `cover` | `string` | — | Text shown on the un-tapped cover. |
| `coverImage` | `AssetRef` | — | Image shown on the cover before tap. |
| `tags` | `string` | — | Comma-separated tag string (e.g. `"legendary,shiny"`) used to select sound/FX entries. |
| `soundMap` | `string` | — | `"tag=sfxKey, *=fallback"` map resolving which sound plays on reveal. |
| `fxMap` | `string` | — | `"tag=fxKey, *=fallback"` map resolving which visual effect plays on reveal. |
| `children` | `ModalBlock[]` | ✅ | Blocks revealed after tap. |

---

### `error`

A simple error message display. Used for server-returned failure states.

```json
{
  "type": "error",
  "message": "Mission data could not be loaded. Please try again."
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `message` | `string` | ✅ | The error text to display. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `characterEvents`

A list of character milestone events from a completed mission — level-ups and injuries. Rendered as a visual timeline.

```json
{
  "type": "characterEvents",
  "items": [
    { "type": "level_up", "entityName": "Zephyr", "newLevel": 5 },
    { "type": "injured", "entityName": "Blaze" }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `items` | `CharacterEvent[]` | ✅ | List of events. |
| `items[].type` | `"level_up" \| "injured"` | ✅ | Event type. |
| `items[].entityName` | `string` | ✅ | Display name of the entity. |
| `items[].newLevel` | `number` | ✅ (level_up only) | The level the entity reached. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

### `entityRoster`

A roster panel showing a set of entities with their levels, power contributions, and optional mission outcome data (XP gained, injury status, level changes).

```json
{
  "type": "entityRoster",
  "editable": false,
  "entities": [
    {
      "id": "entity_abc",
      "name": "Zephyr",
      "level": 7,
      "portraitKey": "portrait_zephyr",
      "powerContribution": 340,
      "outcome": {
        "injured": false,
        "xpGained": 120,
        "levelBefore": 6,
        "levelAfter": 7
      }
    }
  ]
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `editable` | `boolean` | ✅ | Whether the roster allows entity selection/removal (not yet implemented in renderer; reserved for future use). |
| `entities` | `EntityRosterEntity[]` | ✅ | List of entities in the roster. |
| `entities[].id` | `string` | ✅ | Entity instance ID. |
| `entities[].name` | `string` | ✅ | Display name. |
| `entities[].level` | `number` | ✅ | Current level. |
| `entities[].portraitKey` | `string` | — | Asset key for the portrait image. |
| `entities[].powerContribution` | `number` | — | This entity's contribution to total mission power. |
| `entities[].outcome` | `object` | — | Post-mission outcome data. Only present after a mission completes. |
| `entities[].outcome.injured` | `boolean` | ✅ | Whether the entity was injured. |
| `entities[].outcome.xpGained` | `number` | ✅ | XP awarded. |
| `entities[].outcome.levelBefore` | `number` | ✅ | Level at mission start. |
| `entities[].outcome.levelAfter` | `number` | ✅ | Level after XP applied. |
| `from` | `string` | — | Source metadata hint for tooling. |

---

## Screen Composition Blocks

**Source of component keys:** `packages/shared/src/types/screen-composition.ts` (`ScreenComponentKey`)  
**Implementations:** `apps/web/src/features/screens/componentRegistry.tsx`  
**Renderer:** `apps/web/src/features/screens/ScreenCompositionRenderer.tsx`

Screen sections are defined in a `ScreenCompositionDefinition` as entries in the `sections` array. Each section specifies a `component` key and an optional `props` object.

```json
{
  "id": "my-section",
  "component": "HelpTipCard",
  "priority": 10,
  "props": { "title": "Pro Tip", "message": "Check back daily for rewards." }
}
```

### Fully Implemented Components

---

#### `BannerCarousel` / `SeasonBanner`

A data-driven swipeable banner carousel. Banners are sourced from the sync store (`homeBanners`). Supports auto-advance, swipe gestures, and page dots. Banners with expired `endsAt` are filtered out in real time. Both keys render identically.

**Props:** none — all data from the sync store.

---

#### `ResourceSummaryBar`

A horizontal scrollable row of resource balance pills. Displays a curated mix of currencies and/or items defined by the `resources` prop.

| Prop | Type | Required | Description |
|---|---|---|---|
| `resources` | `Array<{ type: "currency" \| "item", defId: string }>` | ✓ | Ordered list of resources to display. Each entry specifies a type (`"currency"` or `"item"`) and the definition ID. Hidden entirely when the array is empty. |

**Example:**
```json
"resources": [
  { "type": "currency", "defId": "gold" },
  { "type": "currency", "defId": "gems" },
  { "type": "item", "defId": "potion_health" }
]
```

---

#### `GlobalBuffsSection`

Displays all currently active global power boosts as a countdown list. Hidden automatically when there are no active powers.

**Props:** none — reads from sync store.

---

#### `CraftingWorkshopsCard`

Shows the number of crafting workshops the player has access to with a link to The Forge. Hides itself when the player has zero workshops.

**Props:** none — fetches live from the API.

---

#### `QuickStatusCards`

A 3-column grid of tappable summary cards: Entities (with idle count), Outposts, and Active Missions. Each card navigates to the relevant section.

**Props:** none — reads from sync store.

---

#### `DailyQuestPanel`

A placeholder card for the upcoming daily quests system.

**Props:** none.

---

#### `MissionFeaturedCard`

A summary card showing active mission count with a "VIEW MISSIONS" CTA button.

**Props:** none — reads from sync store.

---

#### `ActiveMissionList`

A card listing up to 5 active mission jobs by name. Shows a "Start Mission" empty state when none are active.

**Props:** none — reads from sync store.

---

#### `EmptyStateCard`

A generic empty state with optional call-to-action button.

| Prop | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | `"Nothing here yet"` | The message shown in the empty state. |
| `actionKey` | `string` | — | Action key emitted via `onAction` when the button is tapped. Button is hidden if omitted. |
| `actionLabel` | `string` | `"OK"` | Label text for the optional button. |

---

#### `HelpTipCard`

An info tip card with an icon, optional title, and body text. Styled with a blue border.

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | `string` | `"ℹ️"` | Emoji or single character shown as the lead icon. |
| `title` | `string` | — | Bold title above the message. Omit to show message-only. |
| `message` | `string` | `""` | Body text of the tip. |

---

#### `CTAButtonGroup`

A vertical stack of call-to-action buttons. Each button emits an action key when tapped.

| Prop | Type | Required | Description |
|---|---|---|---|
| `buttons` | `CTAButton[]` | ✅ | Ordered list of buttons to render. |
| `buttons[].actionKey` | `string` | ✅ | Key passed to `onAction` when this button is tapped. |
| `buttons[].label` | `string` | ✅ | Button label text. |
| `buttons[].style` | `"primary" \| "secondary"` | — | Visual variant. `"secondary"` renders a ghost/outline style; any other value (or omitted) renders the purple primary style. |

---

#### `SkeletonCard`

An animated loading skeleton card. Used to hold layout space while content loads.

| Prop | Type | Default | Description |
|---|---|---|---|
| `rows` | `number` | `3` | Number of shimmer lines to render. |

---

#### `DailyCheckInCard`

A tappable daily check-in prompt card with an amber border and a claim button.

| Prop | Type | Default | Description |
|---|---|---|---|
| `subtitle` | `string` | `"Come back each day for rewards!"` | Secondary text below the "Daily Check-In" title. |
| `actionKey` | `string` | — | Action key emitted when the card or button is tapped. If omitted, the card is non-interactive and the button is hidden. |
| `actionLabel` | `string` | `"CLAIM"` | Label for the action button. |

---

#### `PatchNotesCard`

A patch notes / changelog card with an indigo border.

| Prop | Type | Description |
|---|---|---|
| `version` | `string` | Version string displayed below the title (e.g. `"1.4.2"`). |
| `notes` | `string` | Free-form patch notes text rendered with whitespace preserved. |

---

#### `WalletPromptCard`

A card prompting the player to connect a blockchain wallet. Emits an action when the "CONNECT" button is tapped.

| Prop | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | `"Link your wallet to unlock NFT features."` | Body text. |
| `actionKey` | `string` | `"connect_wallet"` | Action key emitted on button tap. |

---

#### `SeasonProgressCard`

A progress bar showing how far through the current season the game is, with a colored days-remaining badge. Hidden when no active season is present.

**Props:** none — reads `activeSeason` from sync store.

---

#### `EventCountdownCard`

A countdown timer card for a timed event. Shows days/hours/minutes/seconds. Card color shifts amber when < 24 h remain and red when < 1 h. Disappears automatically when the event ends.

| Prop | Type | Required | Description |
|---|---|---|---|
| `endsAt` | `string` (ISO 8601) | ✅ | UTC timestamp when the event ends. |
| `title` | `string` | — | Card header text. Defaults to `"⏰ EVENT"`. |
| `actionKey` | `string` | — | Action key emitted when the CTA button is tapped. Button hidden if omitted. |
| `actionLabel` | `string` | — | CTA button label. Defaults to `"JOIN"`. |

---

#### `TelemetryCard`

A live-polling metrics card that fetches a telemetry definition by ID and renders it in one of four display modes.

| Prop | Type | Default | Description |
|---|---|---|---|
| `telemetryDefId` | `string` | — | **Required.** ID of the telemetry definition to fetch. Card renders nothing if omitted. |
| `displayType` | `"number" \| "progress_bar" \| "comparison" \| "leaderboard"` | `"number"` | How the metric data is visualised. |
| `title` | `string` | — | Card title. Falls back to the definition's `name` field, then `"📊 METRICS"`. |
| `metricKey` | `string` | — | Which sub-event key to display (for `number` and `progress_bar` modes). Defaults to the first key returned. |
| `target` | `number` | — | Goal value for `progress_bar` mode (drives percentage fill). |
| `pollIntervalSeconds` | `number` | `30` | How often to re-fetch. Minimum 5 seconds. |
| `entries` | `TelemetryEntryConfig[]` | `[]` | Display overrides per sub-event key. Each entry: `{ key, label, icon?, color? }`. |

**`displayType` modes:**

| Mode | Behaviour |
|---|---|
| `number` | Shows a single large numeric counter. |
| `progress_bar` | Shows a labelled fill bar from 0 to `target`. |
| `comparison` | Side-by-side split bar comparing two metrics (`entries[0]` vs `entries[1]`). |
| `leaderboard` | Ranked list of all sub-events, sorted descending, with 🥇🥈🥉 medals. |

---

### Stub-only Components

These keys are registered in the type system and registry but render a dev-mode placeholder dashed box in development and render **nothing in production**. They are reserved for future implementation.

`StoreOfferCard` · `StoreOfferCarousel` · `StoreItemGrid` · `StoreItemRail` · `BattlePassProgress` · `BattlePassTierList` · `EventCarousel` · `EventCardList` · `SeasonBossPanel` · `NewsCard` · `AnnouncementFeed` · `MissionCategoryRail` · `CraftingQueuePreview` · `RecipeCategoryRail` · `OutpostReadyList` · `OutpostSummaryCards` · `InventoryCategoryGrid` · `NFTCapacityInfoCard` · `FeaturedBirdCard` · `FeaturedShopRail` · `GemPackGrid`

---

## Content Document Blocks

**Source:** `packages/shared/src/types/content-document.ts`  
**Registry:** `apps/web/src/features/content-document/blockRegistry.tsx`  
**Renderer:** `apps/web/src/features/content-document/ContentDocumentRenderer.tsx`

Content documents are stored in the `GameDefinition` table with `type = "content_document"`. They consist of an ordered `blocks` array and an optional default `context`. The surface that renders the document (a modal or screen) supplies `SurfaceContext` data that the context-aware blocks consume.

### Mission-Specific Blocks

These blocks have no props — they read everything from `SurfaceContext`. They are only meaningful when the document is rendered in a mission surface.

---

#### `mission_hero`

The full-bleed mission header image, name, category badge, and back navigation. Renders `MissionHeroPanel`.

```json
{ "type": "mission_hero" }
```

---

#### `mission_stats`

Success chance, injury chance, and power ratio display. Renders `MissionStatsPanel`. Shows a loading state when stats are being computed.

```json
{ "type": "mission_stats" }
```

---

#### `mission_requirements`

The mission's level and stat requirements checklist. Renders `MissionRequirementsBlock`.

```json
{ "type": "mission_requirements" }
```

---

#### `mission_stats_requirements`

A side-by-side two-column grid combining `mission_requirements` and `mission_stats` in a single row. Used in planning mode.

```json
{ "type": "mission_stats_requirements" }
```

---

#### `mission_synergy`

Displays matched synergy bonus rules for the current team composition. Hidden automatically when no synergies are active.

```json
{ "type": "mission_synergy" }
```

---

#### `team_section`

An interactive team roster picker. Allows the player to select/deselect entities from the mission team. Hidden when `context.teamMode === "locked"`.

```json
{ "type": "team_section" }
```

---

#### `reward_list`

The mission's reward list. Title adapts to context: `"Rewards"` when `context.rewardMode === "actual"`, otherwise `"Estimated Rewards"`. Hidden when the reward list is empty.

```json
{ "type": "reward_list" }
```

---

#### `narrative_text`

Thematic/flavour text for the mission. Sources text from `SurfaceContext.narrativeTexts` (a string array), falling back to the block's inline `text` prop. Rendered as italic paragraphs. In `outcome` mode, wrapped in a styled "Report" panel.

```json
{
  "type": "narrative_text",
  "text": "The ancient ruins call to you…"
}
```

| Property | Type | Description |
|---|---|---|
| `text` | `string` | Static fallback text shown when the surface provides no dynamic narrative. |

---

### Generic Pass-Through Blocks

These blocks have no dependency on mission data and can appear in any content document.

---

#### `rich_text`

Plain text content that renders as a paragraph. Internally converted to a `richText` modal block.

```json
{
  "type": "rich_text",
  "content": "Remember to send your best entities on high-difficulty missions."
}
```

| Property | Type | Description |
|---|---|---|
| `content` | `string` | Plain text to display. Block renders nothing if omitted. |

---

#### `image`

An asset image with an optional caption. Delegates to the modal `image` block renderer.

```json
{
  "type": "image",
  "assetKey": "banner_mission_ruins",
  "caption": "The Forgotten Ruins"
}
```

| Property | Type | Description |
|---|---|---|
| `assetKey` | `string` | Asset key for the image. Block renders nothing if omitted. |
| `caption` | `string` | Optional caption below the image. |

---

#### `divider`

A horizontal visual separator. No configuration. Delegates to the modal `divider` block.

```json
{ "type": "divider" }
```

---

#### `key_value_row`

A single label → value row. Delegates to the modal `metaRows` block (single-row).

```json
{
  "type": "key_value_row",
  "label": "Difficulty",
  "value": "Hard"
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `label` | `string` | ✅ | Left-side label text. |
| `value` | `string` | ✅ | Right-side value text. |

---

## Supporting Types

### `RewardItem`

Used by `rewardsPreview`, `rewardsList`, and `giftReveal`.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name of the reward. |
| `assetKey` | `string` | Asset key for the reward icon. |
| `qty` | `number` | Quantity awarded. |
| `rarity` | `string` | Rarity tag (e.g. `"common"`, `"rare"`, `"legendary"`). Used for colour/styling. |
| `note` | `string` | Optional footnote (e.g. `"×2 weekend bonus"`). |

### `AssetRef`

Used by `image`, `giftReveal`, and `clickReveal`.

| Field | Type | Description |
|---|---|---|
| `assetKey` | `string` | Key used to resolve the image from the asset registry. |
| `alt` | `string` | Accessible alt text for the image. |

### `RichTextNode`

The building block of a `RichTextDoc` (used by the `richText` modal block).

| Node shape | Description |
|---|---|
| `{ t: "text", v: string }` | A plain text leaf. |
| `{ t: "br" }` | A line break. |
| `{ t: "p" \| "h1" \| "h2" \| "ul" \| "li" \| "strong" \| "em" \| "code", c: RichTextNode[] }` | A structural or formatting container. |
| `{ t: "link", c: RichTextNode[], href: string }` | A hyperlink. |
| `{ t: "token", key: string }` | A server-resolved dynamic value substitution. |

---

## Modal Shell

A modal is expressed as a `ModalSpecV1` object. It supports multiple pages, where each page can override the header, buttons, and dismiss rules from the root defaults.

```json
{
  "version": 1,
  "id": "mission_complete_v2",
  "kind": "mission_outcome",
  "dismiss": { "backdrop": false, "x": true, "escape": true },
  "header": { "title": "Mission Complete!", "icon": { "assetKey": "icon_success" } },
  "buttons": [
    { "id": "close", "label": "DONE", "variant": "primary", "action": { "type": "CLOSE_MODAL" } }
  ],
  "pages": [
    { "body": [ ...ModalBlock[] ] },
    {
      "header": { "title": "Rewards" },
      "buttons": [ { "id": "collect", "label": "COLLECT", "variant": "primary", "action": { "type": "CLAIM_GIFT", "giftId": "gift_abc" } } ],
      "body": [ ...ModalBlock[] ]
    }
  ],
  "showPageIndicator": true
}
```

### `ModalSpecV1` root fields

| Field | Type | Description |
|---|---|---|
| `version` | `1` | Schema version. Always `1`. |
| `id` | `string` | Stable identifier for this modal definition. |
| `kind` | `string` | Semantic category (e.g. `"mission_outcome"`, `"gift_reveal"`). Used for telemetry. |
| `dismiss` | `object` | Default dismiss behaviour for all pages. |
| `dismiss.backdrop` | `boolean` | Whether tapping the backdrop closes the modal. |
| `dismiss.x` | `boolean` | Whether the ✕ close button is shown. |
| `dismiss.escape` | `boolean` | Whether the Escape key closes the modal. |
| `header` | `ModalHeader` | Default header for all pages. |
| `header.title` | `string` | Title text. |
| `header.subtitle` | `string` | Secondary text below the title. |
| `header.icon` | `AssetRef` | Small icon shown beside the title. |
| `header.banner` | `AssetRef` | Full-width banner image at the top of the modal. |
| `buttons` | `ModalButton[]` | Default button row for all pages. |
| `pages` | `ModalPageSpec[]` | Ordered list of pages. Each page can override `header`, `buttons`, and `dismiss`. |
| `showPageIndicator` | `boolean` | Whether to show page progress dots for multi-page modals. |
| `telemetry` | `ModalTelemetry` | Optional telemetry metadata for analytics. |

### Page override

Each entry in `pages` is a `ModalPageSpec`. The page's `header`, `buttons`, and `dismiss` are merged on top of the root defaults (accumulated through all prior pages up to the current index).

| Field | Type | Description |
|---|---|---|
| `body` | `ModalBlock[]` | The block content for this page. |
| `header` | `Partial<ModalHeader>` | Overrides merged on top of the root header. |
| `buttons` | `ModalButton[]` | Replaces the entire button row for this page. |
| `dismiss` | `Partial<dismiss>` | Overrides individual dismiss flags. |

### `ModalButton`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier for the button. |
| `label` | `string` | Button label text. |
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger"` | Visual style. |
| `disabled` | `boolean` | Whether the button is non-interactive. |
| `action` | `ModalAction` | What happens when the button is tapped. See below. |
| `requiresConfirm` | `object` | When present, a confirmation dialog is shown before the action fires. `{ title, body?: ModalBlock[], confirmLabel?, cancelLabel? }`. |

### `ModalAction` types

| `type` | Additional fields | Description |
|---|---|---|
| `CLOSE_MODAL` | — | Closes the modal. |
| `NEXT_PAGE` | — | Advances to the next page. |
| `PREV_PAGE` | — | Goes back to the previous page. |
| `NAVIGATE` | `route: string`, `params?` | Navigates to a client route. |
| `ACK_NOTIFICATION` | `notificationId: string` | Marks a notification as acknowledged. |
| `COMPLETE_JOB` | `jobId: string` | Completes a pending job and fetches the result modal. |
| `CLAIM_GIFT` | `giftId: string` | Claims a gift and fetches the reveal modal. |
| `OPEN_INVENTORY` | — | Navigates to the inventory screen. |
| `OPEN_MISSIONS` | — | Navigates to the missions screen. |
| `OPEN_CRAFTING` | — | Navigates to the crafting screen. |
| `REPEAT_MISSION` | `defId: string`, `entityIds?` | Starts a new mission run with the same definition. |
| `CRAFT_AGAIN` | `recipeDefId: string` | Starts a new crafting job with the same recipe. |
| `API_CALL` | `apiKey: string`, `payload?` | Fires a named API call from a server-maintained key map. |
| `BUILD_BUILDING` | `locationId: string`, `buildingDefId: string` | Queues a building construction job. |
| `UPGRADE_BUILDING` | `locationId: string`, `buildingId: string` | Queues a building upgrade job. |
| `SHOP_PURCHASE` | `shopItemDefId: string` | Initiates a store item purchase. |
| `DEPOSIT_LOCATION_XP` | `locationId`, `costOption`, `charges?` | Deposits XP into a location via currency or item cost. |
| `PRESTIGE` | — | Triggers a prestige reset. |
| `SKIP` | `targetType: string`, `targetId: string` | Skips a timer-based target (e.g. a job or cooldown). |
