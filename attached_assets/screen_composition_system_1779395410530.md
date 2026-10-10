# Derp Universe Screen Composition Definition System

## 1. Purpose

This document defines a reusable **Screen Composition Definition System** for Derp Universe.

The goal is to let the game define selected screens through structured JSON definitions while keeping the actual UI components, game logic, economy logic, validation, and backend authority safely implemented in code.

In practical terms, a screen composition definition answers:

> Which approved UI components should appear on this screen, in what order, under what conditions, with what props and actions?

It does **not** answer:

> How should mission success be calculated? How should purchases be validated? How should crafting results be generated? How should stats be computed?

Those systems should remain server-authoritative and code-driven.

---

## 2. Why Use Screen Composition Definitions?

Derp Universe has a strong live-ops layer: seasons, events, battle passes, store offers, quests, banners, featured content, rotating modifiers, and onboarding prompts. These screens change often and benefit from being configurable without requiring a client app release.

Screen composition definitions are useful when a screen is mostly made of:

- Banners
- Cards
- Rails
- Carousels
- Panels
- CTAs
- Empty states
- Offer modules
- Seasonal widgets
- Quest panels
- Progress summaries
- Navigation prompts

They are less useful when a screen is dominated by complex interaction, spatial manipulation, calculations, state mutation, validation, or economy-sensitive decisions.

---

## 3. Core Principle

Use this system for **composition**, not **logic**.

```txt
Good:
Show this SeasonBanner above this DailyQuestPanel when a season is active.

Bad:
Calculate whether the player succeeds on a mission from JSON.
```

The client should have a fixed registry of allowed components. The screen definition may select from that registry, configure props, and provide safe actions, but it should never execute arbitrary code.

---

## 4. Where This Fits in the Existing Definition System

Most Derp Universe game data is already definition-driven. This screen system is a parallel definition type specifically for UI composition.

Recommended definition type:

```txt
screen_composition
```

Example definition keys:

```txt
home_screen
store_screen
season_hub_screen
events_screen
battle_pass_screen
menu_screen
onboarding_flow
wallet_prompt_modal
offer_modal_daily_gems
```

---

## 5. Recommended Prisma Storage

The screen composition does not need a dedicated relational table per screen, section, or component. Store it in a generic definition table as versioned JSON.

```prisma
model GameDefinition {
  id        String   @id @default(cuid())
  type      String
  key       String
  version   Int      @default(1)
  data      Json
  isActive  Boolean  @default(false)

  startsAt  DateTime?
  endsAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([type, key, version])
  @@index([type, key, isActive])
}
```

Example row:

```ts
await prisma.gameDefinition.create({
  data: {
    type: "screen_composition",
    key: "home_screen",
    version: 1,
    isActive: true,
    data: homeScreenCompositionJson
  }
});
```

Keep player-specific state, transactions, ownership, entitlements, and economy logs in proper relational tables.

---

## 6. High-Level Architecture

```txt
GameDefinition: screen_composition
        |
        v
Screen Composition Resolver
        |
        |-- loads active screen definition
        |-- checks platform availability
        |-- checks audience rules
        |-- fetches declared data sources
        |-- evaluates visibility rules
        |-- validates components and props
        v
Client Renderer
        |
        |-- renders approved components from registry
        |-- passes resolved props
        |-- wires safe action handlers
        v
Backend APIs
        |
        |-- validates all game/economy mutations
        |-- resolves purchases, claims, missions, crafting, etc.
```

The definition controls presentation. The backend controls authority.

---

# 7. ScreenCompositionDefinition

## 7.1 Top-Level Shape

```ts
type ScreenCompositionDefinition = {
  id: string;
  type: "screen_composition";
  screenKey: string;
  version: number;
  status: "draft" | "active" | "archived";

  metadata?: ScreenMetadata;
  platform?: PlatformRule;
  availability?: AvailabilityRule;
  audience?: AudienceRule;

  navigation?: NavigationConfig;
  layout: ScreenLayoutConfig;
  dataSources?: DataSourceDefinition[];
  sections: ScreenSectionDefinition[];

  analytics?: AnalyticsConfig;
  fallback?: FallbackConfig;
  validation?: ScreenValidationConfig;
};
```

---

## 7.2 Property Reference

| Property | Required | Purpose |
|---|---:|---|
| `id` | Yes | Unique definition ID. Usually includes screen key and version. |
| `type` | Yes | Must be `screen_composition`. |
| `screenKey` | Yes | Stable screen identifier used by the app router. |
| `version` | Yes | Numeric version for publishing, rollback, and testing. |
| `status` | Yes | Draft, active, or archived lifecycle state. |
| `metadata` | No | Human-readable notes, ownership, tags, change reason. |
| `platform` | No | Platform targeting rules. |
| `availability` | No | Time, season, or live-ops availability. |
| `audience` | No | Player segment targeting. |
| `navigation` | No | Top bar, bottom nav, title, back behavior. |
| `layout` | Yes | Overall screen layout style. |
| `dataSources` | No | Server, definition, local, or computed data required by sections. |
| `sections` | Yes | Ordered component definitions. |
| `analytics` | No | Screen-level analytics events. |
| `fallback` | No | Safe fallback if definition fails. |
| `validation` | No | Optional explicit validation behavior. |

---

# 8. Complex Object Definitions

## 8.1 ScreenMetadata

Human-facing metadata for designers and developers.

```ts
type ScreenMetadata = {
  name?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  notes?: string;
  changelog?: ChangelogEntry[];
};
```

```ts
type ChangelogEntry = {
  version: number;
  date: string;
  author?: string;
  summary: string;
};
```

Example:

```json
{
  "name": "Home Screen",
  "description": "Main dashboard shown after login.",
  "owner": "design",
  "tags": ["home", "live_ops", "mobile"],
  "changelog": [
    {
      "version": 2,
      "date": "2026-05-21",
      "author": "Derp Team",
      "summary": "Added weekly event card and revised daily quest placement."
    }
  ]
}
```

---

## 8.2 PlatformRule

Controls which platforms may receive this screen definition.

```ts
type PlatformRule = {
  include?: PlatformKey[];
  exclude?: PlatformKey[];
  minAppVersion?: string;
  maxAppVersion?: string;
};
```

```ts
type PlatformKey = "ios" | "android" | "web" | "desktop";
```

Example:

```json
{
  "include": ["ios", "android", "web"],
  "exclude": [],
  "minAppVersion": "1.3.0"
}
```

Recommended use:

- Use `include` for broad platform targeting.
- Use `minAppVersion` when a screen uses a newly shipped component.
- Avoid platform-specific definitions unless the layout materially differs.

---

## 8.3 AvailabilityRule

Controls time, season, and event availability.

```ts
type AvailabilityRule = {
  startsAt?: string | null;
  endsAt?: string | null;
  seasonIds?: string[];
  eventIds?: string[];
  featureFlags?: string[];
};
```

Example:

```json
{
  "startsAt": "2026-06-01T00:00:00Z",
  "endsAt": "2026-07-31T23:59:59Z",
  "seasonIds": ["cosmic_jamboree"],
  "featureFlags": ["season_hub_v2"]
}
```

Recommended use:

- Use `startsAt` and `endsAt` for limited-time screens or modals.
- Use `seasonIds` for seasonal hubs, event hubs, battle pass screens, and seasonal offer pages.
- Use `featureFlags` for gradual rollout.

---

## 8.4 AudienceRule

Controls which players should receive the screen composition.

```ts
type AudienceRule = {
  includeUserSegments?: string[];
  excludeUserSegments?: string[];
  minKeeperLevel?: number;
  maxKeeperLevel?: number | null;
  requiredFlags?: string[];
  excludedFlags?: string[];
  walletStatus?: "any" | "connected" | "not_connected";
  nftStatus?: "any" | "has_nft" | "no_nft";
};
```

Example:

```json
{
  "includeUserSegments": ["all"],
  "excludeUserSegments": ["new_user_day_0"],
  "minKeeperLevel": 3,
  "walletStatus": "any",
  "nftStatus": "any"
}
```

Recommended use:

- Use `minKeeperLevel` for unlocked screens or advanced prompts.
- Use `walletStatus` for wallet connect education.
- Use `nftStatus` carefully; NFT ownership should be framed as capacity/prestige, not power.
- Do not use targeting to show pay-to-win offers.

---

## 8.5 NavigationConfig

Controls screen-level navigation chrome.

```ts
type NavigationConfig = {
  showTopBar?: boolean;
  showBottomNav?: boolean;
  selectedTab?: NavigationTabKey;
  title?: string;
  subtitle?: string;
  backBehavior?: "none" | "default" | "close_modal" | "custom_target";
  customBackTarget?: string;
  topBarActions?: TopBarActionDefinition[];
};
```

```ts
type NavigationTabKey =
  | "home"
  | "outposts"
  | "missions"
  | "birds"
  | "crafting"
  | "inventory"
  | "season"
  | "store"
  | "more";
```

```ts
type TopBarActionDefinition = {
  id: string;
  icon: string;
  label?: string;
  action: ActionDefinition;
  visibility?: VisibilityRuleGroup;
};
```

Example:

```json
{
  "showTopBar": true,
  "showBottomNav": true,
  "selectedTab": "home",
  "title": "Home",
  "backBehavior": "none",
  "topBarActions": [
    {
      "id": "settings",
      "icon": "gear",
      "label": "Settings",
      "action": {
        "type": "navigate",
        "target": "settings"
      }
    }
  ]
}
```

Recommended use:

- Keep bottom nav stable across primary screens.
- Use top bar actions sparingly on mobile.
- Avoid dynamic navigation that moves core tabs around.

---

# 9. Layout System

## 9.1 ScreenLayoutConfig

```ts
type ScreenLayoutConfig = {
  layoutType: ScreenLayoutType;
  safeArea?: boolean;
  maxWidth?: "mobile_full" | "content" | "wide";
  padding?: SpacingToken;
  gap?: SpacingToken;
  scroll?: boolean;
  refreshBehavior?: "none" | "pull_to_refresh" | "auto_refresh";
  tabs?: LayoutTabDefinition[];
  columns?: LayoutColumnDefinition[];
  modal?: ModalLayoutConfig;
  responsive?: ResponsiveLayoutConfig;
};
```

```ts
type SpacingToken = "none" | "tight" | "standard" | "loose";
```

---

## 9.2 Initial Layout Variants

Start with a constrained set. Do not create a fully generic layout engine at first.

```ts
type ScreenLayoutType =
  | "vertical_feed"
  | "tabbed_feed"
  | "grid"
  | "split_panel"
  | "modal_stack"
  | "wizard"
  | "fixed_structure";
```

---

## 9.3 Layout Variant Details

### 9.3.1 `vertical_feed`

Best for mobile-first stacked screens.

Use for:

- Home
- Store
- Events hub
- News
- More/Menu
- Offer pages

Behavior:

- Sections render by priority from top to bottom.
- Screen is normally scrollable.
- Components should be card, banner, rail, or panel based.

Example:

```json
{
  "layoutType": "vertical_feed",
  "safeArea": true,
  "padding": "standard",
  "gap": "standard",
  "scroll": true,
  "refreshBehavior": "pull_to_refresh"
}
```

---

### 9.3.2 `tabbed_feed`

Best for a hub with multiple logical categories.

Use for:

- Season Hub
- Battle Pass Hub
- Events Hub
- Store with categories
- Inventory shell, if only category structure is data-driven

Additional object:

```ts
type LayoutTabDefinition = {
  id: string;
  label: string;
  icon?: string;
  default?: boolean;
  visibility?: VisibilityRuleGroup;
};
```

Example:

```json
{
  "layoutType": "tabbed_feed",
  "tabs": [
    { "id": "overview", "label": "Overview", "default": true },
    { "id": "pass", "label": "Pass" },
    { "id": "boss", "label": "Boss" },
    { "id": "events", "label": "Events" }
  ]
}
```

Sections use `slot` to identify the tab where they render.

---

### 9.3.3 `grid`

Best for repeated collections of simple cards.

Use for:

- Cosmetic collections
- Store category pages
- Badge collections
- Title collections
- Simple inventory category landing pages

Additional object:

```ts
type GridLayoutConfig = {
  minCardWidth?: number;
  columnsMobile?: number;
  columnsTablet?: number;
  columnsDesktop?: number;
};
```

The top-level `ScreenLayoutConfig` can include these values through `responsive` or a future `grid` property.

Example:

```json
{
  "layoutType": "grid",
  "safeArea": true,
  "padding": "standard",
  "gap": "standard",
  "scroll": true,
  "responsive": {
    "mobile": {
      "columns": 2
    },
    "tablet": {
      "columns": 3
    },
    "desktop": {
      "columns": 4
    }
  }
}
```

---

### 9.3.4 `split_panel`

Best for larger screens or tablet/desktop experiences.

Use for:

- Store desktop layout
- Season overview desktop layout
- Inventory shell on tablet
- Mission list shell on tablet, if the interactive detail remains coded

Additional object:

```ts
type LayoutColumnDefinition = {
  id: string;
  width: "fixed" | "flex" | "content";
  size?: number;
};
```

Example:

```json
{
  "layoutType": "split_panel",
  "columns": [
    { "id": "left", "width": "fixed", "size": 320 },
    { "id": "main", "width": "flex" }
  ]
}
```

Sections use `slot` to select column placement.

---

### 9.3.5 `modal_stack`

Best for popups and limited-time prompts.

Use for:

- Offer modals
- Wallet prompts
- First-time user prompts
- Patch notes modals
- Daily reward modals

Additional object:

```ts
type ModalLayoutConfig = {
  size: "small" | "medium" | "large" | "full_screen_mobile";
  dismissible: boolean;
  closeOnBackdrop?: boolean;
};
```

Example:

```json
{
  "layoutType": "modal_stack",
  "modal": {
    "size": "medium",
    "dismissible": true,
    "closeOnBackdrop": true
  }
}
```

---

### 9.3.6 `wizard`

Best for ordered onboarding or tutorial flows.

Use for:

- First-session onboarding
- Wallet connection education
- First mission tutorial
- First crafting tutorial
- First outpost setup

Wizard-specific component convention:

Each section represents one step or one module inside a step.

Example:

```json
{
  "layoutType": "wizard",
  "safeArea": true,
  "scroll": false
}
```

Sections should include props such as:

```json
{
  "stepIndex": 1,
  "nextAction": {
    "type": "navigate",
    "target": "onboarding_step_2"
  }
}
```

---

### 9.3.7 `fixed_structure`

Best when a screen has a mostly coded layout, but still allows small defined modules.

Use for:

- Mission List shell
- Outpost Detail helper panels
- Crafting category structure
- Inventory filter/sort shell

This is the compromise layout for screens that should **not** be fully definition-driven.

Example:

```json
{
  "layoutType": "fixed_structure",
  "safeArea": true,
  "padding": "standard",
  "scroll": false
}
```

The client owns the main structure. The definition may fill approved slots like:

```txt
header_banner
side_panel
empty_state
footer_cta
help_card
promo_slot
```

---

## 9.4 ResponsiveLayoutConfig

Optional responsive overrides.

```ts
type ResponsiveLayoutConfig = {
  mobile?: Record<string, unknown>;
  tablet?: Record<string, unknown>;
  desktop?: Record<string, unknown>;
};
```

Example:

```json
{
  "mobile": {
    "layoutType": "vertical_feed"
  },
  "desktop": {
    "layoutType": "split_panel",
    "columns": [
      { "id": "left", "width": "fixed", "size": 320 },
      { "id": "main", "width": "flex" }
    ]
  }
}
```

Recommendation:

Prefer keeping the same definition across platforms and letting the client adapt the component layout where possible.

---

# 10. Data Sources

## 10.1 DataSourceDefinition

Data sources declare what information the screen needs. They do not mutate game state.

```ts
type DataSourceDefinition = {
  id: string;
  sourceType: "api" | "definition" | "local_state" | "computed";

  endpoint?: string;
  method?: "GET";
  params?: Record<string, unknown>;

  definitionType?: string;
  definitionKey?: string;

  localPath?: string;
  computedKey?: string;

  cacheTtlSeconds?: number;
  required?: boolean;
  fallbackValue?: unknown;
};
```

---

## 10.2 Data Source Types

### `api`

Fetches read-only server data.

```json
{
  "id": "player_summary",
  "sourceType": "api",
  "endpoint": "/api/player/summary",
  "method": "GET",
  "cacheTtlSeconds": 30,
  "required": true
}
```

Use for:

- Player summary
- Outpost readiness summary
- Mission completion summary
- Season progress
- Battle pass progress
- Store eligibility

---

### `definition`

Loads another definition.

```json
{
  "id": "storefront",
  "sourceType": "definition",
  "definitionType": "storefront",
  "definitionKey": "main_store",
  "required": true
}
```

Use for:

- Storefront sections
- Event definitions
- Battle pass definitions
- Announcement definitions

---

### `local_state`

Reads app-local state.

```json
{
  "id": "device_state",
  "sourceType": "local_state",
  "localPath": "app.device",
  "required": false
}
```

Use for:

- Reduced motion settings
- Last seen prompts
- Local UI preferences
- App version

---

### `computed`

Uses a safe, predefined computation key implemented in code.

```json
{
  "id": "most_actionable_bird",
  "sourceType": "computed",
  "computedKey": "featured_bird.most_actionable",
  "required": false
}
```

Use sparingly. Computed keys must be whitelisted.

---

# 11. Sections

## 11.1 ScreenSectionDefinition

A section is one rendered module on a screen.

```ts
type ScreenSectionDefinition = {
  id: string;
  component: ScreenComponentKey;
  slot?: string;
  priority: number;

  visibility?: VisibilityRuleGroup;
  props?: Record<string, unknown>;
  actions?: Record<string, ActionDefinition>;

  analytics?: SectionAnalyticsConfig;
  refresh?: SectionRefreshConfig;
  fallback?: SectionFallbackConfig;
};
```

---

## 11.2 Section Properties

| Property | Required | Purpose |
|---|---:|---|
| `id` | Yes | Unique section ID within the screen. |
| `component` | Yes | Approved component key from component registry. |
| `slot` | No | Layout slot, tab, column, or named region. Defaults to `main`. |
| `priority` | Yes | Sort order. Lower numbers render first. |
| `visibility` | No | Rules determining whether the section appears. |
| `props` | No | Component-specific configuration. Must validate against component schema. |
| `actions` | No | Named actions referenced by props or component events. |
| `analytics` | No | Section impression/click tracking. |
| `refresh` | No | Section-level refresh behavior. |
| `fallback` | No | What to render if this section fails. |

---

## 11.3 Slot Usage

The `slot` field depends on layout type.

Examples:

```txt
vertical_feed: main

tabbed_feed: overview, pass, boss, events

split_panel: left, main, right

fixed_structure: header_banner, promo_slot, empty_state, footer_cta

modal_stack: main, footer
```

---

## 11.4 SectionRefreshConfig

```ts
type SectionRefreshConfig = {
  refreshOnScreenFocus?: boolean;
  refreshIntervalSeconds?: number;
  refreshDataSources?: string[];
};
```

Example:

```json
{
  "refreshOnScreenFocus": true,
  "refreshIntervalSeconds": 60,
  "refreshDataSources": ["season_summary"]
}
```

Use for timers, boss progress, mission completion cards, and live events.

---

## 11.5 SectionFallbackConfig

```ts
type SectionFallbackConfig = {
  behavior: "hide" | "placeholder" | "error_card";
  component?: ScreenComponentKey;
  props?: Record<string, unknown>;
};
```

Example:

```json
{
  "behavior": "placeholder",
  "component": "SkeletonCard",
  "props": {
    "height": 120
  }
}
```

Recommendation:

- Hide optional promotional sections on failure.
- Use placeholders for important content loading states.
- Use error cards only when the player can do something about the issue.

---

# 12. Visibility Rules

## 12.1 VisibilityRuleGroup

```ts
type VisibilityRuleGroup = {
  all?: VisibilityRule[];
  any?: VisibilityRule[];
  none?: VisibilityRule[];
};
```

Evaluation:

```txt
all: every rule must be true
any: at least one rule must be true
none: every rule must be false
```

If no visibility is supplied, the section is visible.

---

## 12.2 VisibilityRule

```ts
type VisibilityRule = {
  path: string;
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "includes"
    | "not_includes"
    | "exists"
    | "not_exists"
    | "in"
    | "not_in";
  value?: unknown;
};
```

---

## 12.3 Visibility Path Conventions

Paths should resolve against a known context object.

Suggested context namespaces:

```txt
user.*
player_summary.*
season.*
store.*
wallet.*
flags.*
local.*
```

Examples:

```json
{
  "path": "season.isActive",
  "operator": "equals",
  "value": true
}
```

```json
{
  "path": "user.keeperLevel",
  "operator": "greater_than_or_equal",
  "value": 5
}
```

```json
{
  "path": "wallet.isConnected",
  "operator": "equals",
  "value": false
}
```

---

## 12.4 Visibility Example

Show a wallet prompt only when the player has not connected a wallet and has reached Keeper Level 3.

```json
{
  "all": [
    {
      "path": "wallet.isConnected",
      "operator": "equals",
      "value": false
    },
    {
      "path": "user.keeperLevel",
      "operator": "greater_than_or_equal",
      "value": 3
    }
  ]
}
```

---

## 12.5 Visibility Rules to Avoid

Avoid complex business logic inside visibility rules.

Bad:

```txt
Show this if the player's mission team has enough SPD after potions and synergy modifiers.
```

Good:

```txt
Show this if server says the player has an actionable completed mission.
```

The backend should compute complicated game facts and expose simple booleans or summary values to the UI.

---

# 13. Actions

Actions are safe, declarative instructions wired to coded handlers.

## 13.1 ActionDefinition

```ts
type ActionDefinition =
  | NavigateAction
  | OpenModalAction
  | CloseModalAction
  | ApiAction
  | ClaimRewardAction
  | OpenStoreItemAction
  | OpenExternalLinkAction
  | TrackOnlyAction
  | NoOpAction;
```

---

## 13.2 NavigateAction

```ts
type NavigateAction = {
  type: "navigate";
  target: string;
  params?: Record<string, unknown>;
};
```

Example:

```json
{
  "type": "navigate",
  "target": "missions",
  "params": {
    "filter": "seasonal"
  }
}
```

Use for:

- Opening Missions
- Opening Store
- Opening Season Hub
- Opening a detail screen with a specific ID

---

## 13.3 OpenModalAction

```ts
type OpenModalAction = {
  type: "open_modal";
  modalKey: string;
  params?: Record<string, unknown>;
};
```

Example:

```json
{
  "type": "open_modal",
  "modalKey": "wallet_connect_prompt"
}
```

Use for:

- Wallet prompts
- Daily reward details
- Offer details
- Confirmation dialogs

---

## 13.4 CloseModalAction

```ts
type CloseModalAction = {
  type: "close_modal";
};
```

Example:

```json
{
  "type": "close_modal"
}
```

---

## 13.5 ApiAction

Used for server-validated mutations.

```ts
type ApiAction = {
  type: "api";
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  body?: Record<string, unknown>;
  confirm?: ConfirmationConfig;
  successToast?: string;
  errorToast?: string;
  refreshDataSources?: string[];
};
```

```ts
type ConfirmationConfig = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};
```

Example:

```json
{
  "type": "api",
  "method": "POST",
  "endpoint": "/api/outposts/collect-all",
  "confirm": {
    "title": "Collect all?",
    "body": "Scoop up the shiny nonsense from every ready Outpost?",
    "confirmLabel": "Collect"
  },
  "successToast": "Resources collected.",
  "errorToast": "Could not collect right now.",
  "refreshDataSources": ["player_summary"]
}
```

Important:

The action may request the mutation, but the backend must validate ownership, cooldowns, costs, eligibility, rewards, limits, and anti-cheat rules.

---

## 13.6 ClaimRewardAction

Specialized action for reward claiming flows.

```ts
type ClaimRewardAction = {
  type: "claim_reward";
  rewardSource: "daily_quest" | "battle_pass" | "event" | "mail" | "achievement";
  rewardIdPath?: string;
  endpoint: string;
  successToast?: string;
  refreshDataSources?: string[];
};
```

Example:

```json
{
  "type": "claim_reward",
  "rewardSource": "daily_quest",
  "rewardIdPath": "props.questId",
  "endpoint": "/api/quests/claim",
  "successToast": "Quest reward claimed.",
  "refreshDataSources": ["daily_quests", "player_summary"]
}
```

---

## 13.7 OpenStoreItemAction

```ts
type OpenStoreItemAction = {
  type: "open_store_item";
  storeItemId: string;
  presentation?: "modal" | "screen" | "bottom_sheet";
};
```

Example:

```json
{
  "type": "open_store_item",
  "storeItemId": "cosmic_skin_bundle_001",
  "presentation": "bottom_sheet"
}
```

---

## 13.8 OpenExternalLinkAction

```ts
type OpenExternalLinkAction = {
  type: "open_external_link";
  url: string;
  mode?: "browser" | "webview";
  confirmExternal?: boolean;
};
```

Example:

```json
{
  "type": "open_external_link",
  "url": "https://example.com/patch-notes",
  "mode": "browser",
  "confirmExternal": true
}
```

Use sparingly. Prefer internal screens for game content.

---

## 13.9 TrackOnlyAction

```ts
type TrackOnlyAction = {
  type: "track_only";
  eventName: string;
  payload?: Record<string, unknown>;
};
```

Use for analytics-only interactions.

---

## 13.10 NoOpAction

```ts
type NoOpAction = {
  type: "noop";
};
```

Useful for disabled CTAs or placeholder modules.

---

# 14. Component Registry

The definition must only reference approved components. This prevents arbitrary rendering and keeps the app testable.

## 14.1 ScreenComponentKey

Initial recommended registry:

```ts
type ScreenComponentKey =
  | "ResourceSummaryBar"
  | "SeasonBanner"
  | "QuickStatusCards"
  | "DailyQuestPanel"
  | "FeaturedBirdCard"
  | "StoreOfferCard"
  | "StoreOfferCarousel"
  | "StoreItemGrid"
  | "StoreItemRail"
  | "BattlePassProgress"
  | "BattlePassTierList"
  | "EventCarousel"
  | "EventCardList"
  | "SeasonBossPanel"
  | "NewsCard"
  | "AnnouncementFeed"
  | "MissionCategoryRail"
  | "MissionFeaturedCard"
  | "CraftingQueuePreview"
  | "RecipeCategoryRail"
  | "OutpostReadyList"
  | "OutpostSummaryCards"
  | "InventoryCategoryGrid"
  | "WalletPromptCard"
  | "NFTCapacityInfoCard"
  | "EmptyStateCard"
  | "HelpTipCard"
  | "CTAButtonGroup"
  | "PatchNotesCard"
  | "SkeletonCard";
```

---

## 14.2 Component Guidelines

Each registered component should have:

```ts
type RegisteredComponent = {
  key: ScreenComponentKey;
  component: ReactComponent;
  propsSchema: JsonSchema;
  allowedActions?: string[];
  allowedDataSources?: string[];
};
```

This lets you validate definitions before publishing.

---

## 14.3 Recommended Components and Purpose

| Component | Purpose | Best Screens |
|---|---|---|
| `ResourceSummaryBar` | Shows key currencies/resources. | Home, Store, Crafting, Outposts |
| `SeasonBanner` | Seasonal hero/banner with timer and CTA. | Home, Season Hub, Events |
| `QuickStatusCards` | Summary cards for Outposts, Missions, Crafting. | Home |
| `DailyQuestPanel` | Shows active daily quests and claim states. | Home, Daily Quests |
| `FeaturedBirdCard` | Highlights an actionable or favorite Bird. | Home |
| `StoreOfferCard` | Single offer presentation. | Home, Store, Modals |
| `StoreOfferCarousel` | Featured store offers. | Store, Home |
| `StoreItemGrid` | Grid of store products. | Store |
| `StoreItemRail` | Horizontal product rail. | Store, Home |
| `BattlePassProgress` | Current battle pass progress summary. | Season Hub, Battle Pass |
| `BattlePassTierList` | Full reward tier list. | Battle Pass |
| `EventCarousel` | Rotating event cards. | Home, Events, Season Hub |
| `EventCardList` | Event list with timers and CTAs. | Events |
| `SeasonBossPanel` | Boss progress and attack CTA. | Home, Season Hub |
| `NewsCard` | Single announcement. | Home, News |
| `AnnouncementFeed` | Feed of patch notes/news. | Menu, News |
| `MissionCategoryRail` | Mission category shortcuts. | Missions shell, Home |
| `MissionFeaturedCard` | Promoted mission or seasonal mission. | Missions shell, Events |
| `CraftingQueuePreview` | Shows active crafting timers. | Home, Crafting shell |
| `RecipeCategoryRail` | Crafting category shortcuts. | Crafting shell |
| `OutpostReadyList` | Ready-to-collect outpost summaries. | Home, Outposts shell |
| `OutpostSummaryCards` | Outpost status overview cards. | Home, Outposts shell |
| `InventoryCategoryGrid` | Inventory category shortcuts. | Inventory shell |
| `WalletPromptCard` | Wallet education and connect CTA. | Home, Menu, Onboarding |
| `NFTCapacityInfoCard` | Explains NFTs as capacity/slots. | Wallet, Menu, Onboarding |
| `EmptyStateCard` | Configurable empty state. | Many screens |
| `HelpTipCard` | Contextual explanation card. | Onboarding, Missions, Crafting |
| `CTAButtonGroup` | Reusable grouped CTAs. | Modals, empty states, onboarding |
| `PatchNotesCard` | Highlights latest updates. | Home, Menu, News |
| `SkeletonCard` | Loading placeholder. | Any screen |

---

## 14.4 Component Prop Validation

Every component should define an explicit props schema.

Example for `SeasonBanner`:

```ts
type SeasonBannerProps = {
  seasonId: "current" | string;
  variant: "compact" | "wide" | "hero";
  showTimer?: boolean;
  cta?: CTAConfig;
};
```

Example JSON:

```json
{
  "seasonId": "current",
  "variant": "hero",
  "showTimer": true,
  "cta": {
    "label": "Enter Season",
    "action": {
      "type": "navigate",
      "target": "season_hub"
    }
  }
}
```

---

# 15. Analytics

## 15.1 AnalyticsConfig

```ts
type AnalyticsConfig = {
  screenViewEvent?: string;
  sectionImpressionEvent?: string;
  actionEvent?: string;
  payload?: Record<string, unknown>;
};
```

Example:

```json
{
  "screenViewEvent": "screen_home_viewed",
  "sectionImpressionEvent": "screen_section_impression",
  "actionEvent": "screen_action_clicked",
  "payload": {
    "screenKey": "home"
  }
}
```

---

## 15.2 SectionAnalyticsConfig

```ts
type SectionAnalyticsConfig = {
  impressionEvent?: string;
  clickEvent?: string;
  payload?: Record<string, unknown>;
};
```

Example:

```json
{
  "impressionEvent": "home_section_impression",
  "clickEvent": "home_section_clicked",
  "payload": {
    "sectionId": "season_banner"
  }
}
```

Recommendation:

Track impressions for:

- Store offers
- Seasonal banners
- Wallet prompts
- Event cards
- Battle pass CTAs

Do not over-instrument every small UI element.

---

# 16. Fallbacks and Validation

## 16.1 FallbackConfig

```ts
type FallbackConfig = {
  component: ScreenComponentKey;
  reason?: string;
  props?: Record<string, unknown>;
};
```

Example:

```json
{
  "component": "EmptyStateCard",
  "reason": "invalid_definition_or_missing_required_data",
  "props": {
    "title": "Something got derped.",
    "body": "The screen could not load cleanly. Try again in a moment.",
    "tone": "lighthearted_error"
  }
}
```

---

## 16.2 ScreenValidationConfig

```ts
type ScreenValidationConfig = {
  componentMustExist?: boolean;
  actionTargetsMustExist?: boolean;
  dataSourcesMustBeAllowed?: boolean;
  requiredPropsMustValidate?: boolean;
  visibilityPathsMustBeKnown?: boolean;
  noEconomyMutationWithoutServerEndpoint?: boolean;
  noRawHtml?: boolean;
  noArbitraryCode?: boolean;
};
```

Recommended default:

```json
{
  "componentMustExist": true,
  "actionTargetsMustExist": true,
  "dataSourcesMustBeAllowed": true,
  "requiredPropsMustValidate": true,
  "visibilityPathsMustBeKnown": true,
  "noEconomyMutationWithoutServerEndpoint": true,
  "noRawHtml": true,
  "noArbitraryCode": true
}
```

---

## 16.3 Publishing Validation Checklist

Before activating a screen composition definition:

- Every component key exists in the registry.
- Every section ID is unique within the screen.
- Every action type is allowed.
- Every navigation target exists.
- Every modal key exists.
- Every data source is allowed for this screen.
- Every required data source has a fallback strategy.
- Every component's props validate against its schema.
- Every visibility path is known or intentionally allowed.
- No raw HTML is present.
- No arbitrary JavaScript or expression evaluation is present.
- Economy-sensitive actions go through server endpoints.
- Store purchase actions go through validated purchase flow.

---

# 17. Recommended Screen Classification

## 17.1 Strong Fit: Fully Data-Driven Composition

These screens are ideal for screen composition definitions.

| Screen | Recommendation | Why |
|---|---|---|
| Home | Strong yes | Modular dashboard with seasonal banners, summaries, quests, CTAs. |
| Store | Strong yes | Offers, product grids, featured sections, rails, bundles. |
| Season Hub | Strong yes | Seasonal modules, boss panels, pass progress, event links. |
| Events Hub | Strong yes | Rotating event cards, timers, weekly challenges. |
| Battle Pass | Yes | Track/tier display and seasonal progress modules. |
| News / Announcements | Yes | Content feed, patch notes, update cards. |
| Daily Quests page | Yes | Quest panels, reward states, claim CTAs. |
| Menu / More | Yes | Links, support cards, wallet prompts, settings shortcuts. |
| Tutorial / Onboarding | Yes | Wizard steps, explanation cards, gated prompts. |
| Offer popups / modals | Yes | Limited-time offers, cosmetic bundles, CTA panels. |
| Wallet connect prompts | Yes | Education and navigation modules. |
| Empty states | Yes | Reusable context-aware empty screens. |

Recommended definition keys:

```txt
home_screen
store_screen
season_hub_screen
events_hub_screen
battle_pass_screen
news_screen
daily_quests_screen
menu_screen
onboarding_flow
wallet_connect_prompt_modal
empty_state_no_missions
empty_state_no_outposts_ready
```

---

## 17.2 Partial Fit: Use for Structure Only

These screens contain complex game interaction, but still benefit from data-driven banners, tabs, category rails, prompts, or empty states.

| Screen | Recommendation | Data-driven parts | Code-driven parts |
|---|---|---|---|
| Mission List | Partial | Categories, banners, featured missions, filters, empty states. | Mission availability logic, requirements, active mission state. |
| Mission Detail | Partial | Info panels, tips, promo slots, seasonal callouts. | Team builder, requirement validation, MP previews. |
| Outposts List | Partial | Summary cards, promo banners, collect-all CTA placement. | Production math, collection validation, ownership. |
| Outpost Detail | Mostly coded | Help cards, regional banners, tab labels, empty slots. | Isometric map, building taps, workers, production. |
| Crafting Screen | Partial | Category rails, recipe groups, help cards. | Crafting validation, timers, material spending. |
| Inventory | Partial | Category grid, empty states, filter presets. | Item interactions, equip, compare, consume. |
| Character Roster | Partial | Filter/sort presets, banners, empty states. | Roster behavior, selection, status rules. |
| Wallet / NFT Info | Partial to strong | Educational cards, prompts, capacity explanation. | Wallet signing, NFT verification. |

Use the `fixed_structure` layout for these screens.

Example slots:

```txt
header_banner
category_rail
promo_slot
help_card
empty_state
footer_cta
```

---

## 17.3 Avoid: Poor Fit for Screen Composition

These screens should stay primarily code-driven.

| Screen | Why to avoid full data-driven composition |
|---|---|
| Character Detail | Stats, traits, relics, mastery, status, equipment are state-heavy. |
| Team Builder | Complex validation, optimization, filtering, selection, potions, requirements. |
| Outpost Map / Building Placement | Spatial UI, map interaction, building states, worker assignment. |
| Building Detail / Room Management | Upgrade logic, slot logic, material costs, timers. |
| Relic Equip / Compare | Complex inventory comparison and stat deltas. |
| Craft Confirmation / Timer Flow | Economy-sensitive and mutation-heavy. |
| Mission Result Resolution | Outcome presentation must match server result exactly. |
| Boss Combat / Boss Resolution | Outcome and damage contribution are backend-driven. |
| Settings | Mostly app behavior and device preferences, not live-ops content. |
| Payment / Receipt Validation | Must be native/platform/backend controlled. |
| NFT Verification Flow | Wallet signatures and chain verification must be coded securely. |

These screens can still use small composable modules such as help cards or empty states, but the core screen should remain implemented in code.

---

# 18. Example Definitions

## 18.1 Home Screen Example

```json
{
  "id": "home_screen_v1",
  "type": "screen_composition",
  "screenKey": "home",
  "version": 1,
  "status": "active",
  "metadata": {
    "name": "Home Screen",
    "description": "Main dashboard shown after login.",
    "tags": ["home", "dashboard", "live_ops"]
  },
  "platform": {
    "include": ["ios", "android", "web"]
  },
  "audience": {
    "includeUserSegments": ["all"],
    "minKeeperLevel": 1
  },
  "navigation": {
    "showTopBar": true,
    "showBottomNav": true,
    "selectedTab": "home",
    "title": "Home",
    "backBehavior": "none"
  },
  "layout": {
    "layoutType": "vertical_feed",
    "safeArea": true,
    "maxWidth": "mobile_full",
    "padding": "standard",
    "gap": "standard",
    "scroll": true,
    "refreshBehavior": "pull_to_refresh"
  },
  "dataSources": [
    {
      "id": "player_summary",
      "sourceType": "api",
      "endpoint": "/api/player/summary",
      "method": "GET",
      "cacheTtlSeconds": 30,
      "required": true
    },
    {
      "id": "season_summary",
      "sourceType": "api",
      "endpoint": "/api/seasons/current/summary",
      "method": "GET",
      "cacheTtlSeconds": 60,
      "required": false,
      "fallbackValue": {
        "isActive": false
      }
    }
  ],
  "sections": [
    {
      "id": "resource_bar",
      "component": "ResourceSummaryBar",
      "slot": "main",
      "priority": 5,
      "props": {
        "resources": ["arcanium", "essence", "gems"],
        "presentation": "compact"
      }
    },
    {
      "id": "season_banner",
      "component": "SeasonBanner",
      "slot": "main",
      "priority": 10,
      "visibility": {
        "all": [
          {
            "path": "season_summary.isActive",
            "operator": "equals",
            "value": true
          }
        ]
      },
      "props": {
        "seasonId": "current",
        "variant": "wide",
        "showTimer": true,
        "cta": {
          "label": "Enter Season",
          "action": {
            "type": "navigate",
            "target": "season_hub"
          }
        }
      }
    },
    {
      "id": "quick_status",
      "component": "QuickStatusCards",
      "slot": "main",
      "priority": 20,
      "props": {
        "cards": [
          {
            "type": "outposts",
            "label": "Outposts",
            "dataPath": "player_summary.outposts.readyCount",
            "action": {
              "type": "navigate",
              "target": "outposts"
            }
          },
          {
            "type": "missions",
            "label": "Missions",
            "dataPath": "player_summary.missions.completedCount",
            "action": {
              "type": "navigate",
              "target": "missions"
            }
          },
          {
            "type": "crafting",
            "label": "Crafting",
            "dataPath": "player_summary.crafting.activeCount",
            "action": {
              "type": "navigate",
              "target": "crafting"
            }
          }
        ]
      }
    },
    {
      "id": "daily_quests",
      "component": "DailyQuestPanel",
      "slot": "main",
      "priority": 30,
      "props": {
        "maxVisible": 3,
        "showClaimButtons": true
      },
      "actions": {
        "viewAll": {
          "type": "navigate",
          "target": "daily_quests"
        }
      }
    },
    {
      "id": "featured_bird",
      "component": "FeaturedBirdCard",
      "slot": "main",
      "priority": 40,
      "props": {
        "selectionMode": "most_actionable",
        "showCTA": true
      }
    },
    {
      "id": "featured_offer",
      "component": "StoreOfferCard",
      "slot": "main",
      "priority": 80,
      "visibility": {
        "all": [
          {
            "path": "player_summary.flags.storeUnlocked",
            "operator": "equals",
            "value": true
          }
        ]
      },
      "props": {
        "storeItemId": "cosmic_skin_bundle_001",
        "presentation": "compact"
      }
    }
  ],
  "analytics": {
    "screenViewEvent": "screen_home_viewed",
    "sectionImpressionEvent": "screen_section_impression",
    "actionEvent": "screen_action_clicked"
  },
  "fallback": {
    "component": "EmptyStateCard",
    "reason": "invalid_definition_or_missing_required_data",
    "props": {
      "title": "Home got a little derped.",
      "body": "Try refreshing to reload your dashboard."
    }
  },
  "validation": {
    "componentMustExist": true,
    "actionTargetsMustExist": true,
    "dataSourcesMustBeAllowed": true,
    "requiredPropsMustValidate": true,
    "visibilityPathsMustBeKnown": true,
    "noEconomyMutationWithoutServerEndpoint": true,
    "noRawHtml": true,
    "noArbitraryCode": true
  }
}
```

---

## 18.2 Store Screen Example

```json
{
  "id": "store_screen_v1",
  "type": "screen_composition",
  "screenKey": "store",
  "version": 1,
  "status": "active",
  "metadata": {
    "name": "Store Screen",
    "description": "Main storefront composition."
  },
  "navigation": {
    "showTopBar": true,
    "showBottomNav": true,
    "selectedTab": "store",
    "title": "Store",
    "backBehavior": "default"
  },
  "layout": {
    "layoutType": "vertical_feed",
    "safeArea": true,
    "padding": "standard",
    "gap": "standard",
    "scroll": true,
    "refreshBehavior": "pull_to_refresh"
  },
  "dataSources": [
    {
      "id": "storefront",
      "sourceType": "definition",
      "definitionType": "storefront",
      "definitionKey": "main_store",
      "required": true
    },
    {
      "id": "store_eligibility",
      "sourceType": "api",
      "endpoint": "/api/store/eligibility",
      "method": "GET",
      "cacheTtlSeconds": 30,
      "required": true
    }
  ],
  "sections": [
    {
      "id": "featured_offers",
      "component": "StoreOfferCarousel",
      "slot": "main",
      "priority": 10,
      "props": {
        "storefrontSectionId": "featured",
        "presentation": "hero"
      }
    },
    {
      "id": "purchase_gems",
      "component": "StoreItemGrid",
      "slot": "main",
      "priority": 20,
      "props": {
        "storefrontSectionId": "gems",
        "columnsMobile": 2
      }
    },
    {
      "id": "cosmetics",
      "component": "StoreItemRail",
      "slot": "main",
      "priority": 30,
      "props": {
        "storefrontSectionId": "cosmetics",
        "title": "Derpy Cosmetics"
      }
    },
    {
      "id": "seasonal_items",
      "component": "StoreItemRail",
      "slot": "main",
      "priority": 40,
      "visibility": {
        "all": [
          {
            "path": "store_eligibility.hasSeasonalItems",
            "operator": "equals",
            "value": true
          }
        ]
      },
      "props": {
        "storefrontSectionId": "seasonal",
        "title": "Seasonal Weirdness"
      }
    }
  ]
}
```

---

## 18.3 Season Hub Example

```json
{
  "id": "season_hub_screen_v1",
  "type": "screen_composition",
  "screenKey": "season_hub",
  "version": 1,
  "status": "active",
  "metadata": {
    "name": "Season Hub",
    "description": "Seasonal overview, battle pass, boss, and events."
  },
  "availability": {
    "seasonIds": ["current"]
  },
  "navigation": {
    "showTopBar": true,
    "showBottomNav": true,
    "selectedTab": "season",
    "title": "Season",
    "backBehavior": "default"
  },
  "layout": {
    "layoutType": "tabbed_feed",
    "safeArea": true,
    "padding": "standard",
    "gap": "standard",
    "scroll": true,
    "tabs": [
      {
        "id": "overview",
        "label": "Overview",
        "default": true
      },
      {
        "id": "pass",
        "label": "Pass"
      },
      {
        "id": "boss",
        "label": "Boss"
      },
      {
        "id": "events",
        "label": "Events"
      }
    ]
  },
  "dataSources": [
    {
      "id": "season_summary",
      "sourceType": "api",
      "endpoint": "/api/seasons/current/summary",
      "method": "GET",
      "cacheTtlSeconds": 60,
      "required": true
    },
    {
      "id": "battle_pass",
      "sourceType": "api",
      "endpoint": "/api/seasons/current/battle-pass",
      "method": "GET",
      "cacheTtlSeconds": 60,
      "required": false
    },
    {
      "id": "season_events",
      "sourceType": "api",
      "endpoint": "/api/seasons/current/events",
      "method": "GET",
      "cacheTtlSeconds": 60,
      "required": false
    }
  ],
  "sections": [
    {
      "id": "season_hero",
      "component": "SeasonBanner",
      "slot": "overview",
      "priority": 10,
      "props": {
        "seasonId": "current",
        "variant": "hero",
        "showTimer": true
      }
    },
    {
      "id": "overview_boss_panel",
      "component": "SeasonBossPanel",
      "slot": "overview",
      "priority": 20,
      "props": {
        "seasonId": "current",
        "presentation": "compact"
      }
    },
    {
      "id": "overview_event_carousel",
      "component": "EventCarousel",
      "slot": "overview",
      "priority": 30,
      "props": {
        "eventScope": "seasonal",
        "maxVisible": 5
      }
    },
    {
      "id": "battle_pass_progress",
      "component": "BattlePassProgress",
      "slot": "pass",
      "priority": 10,
      "props": {
        "seasonId": "current",
        "showPremiumUpsell": true
      }
    },
    {
      "id": "battle_pass_tiers",
      "component": "BattlePassTierList",
      "slot": "pass",
      "priority": 20,
      "props": {
        "seasonId": "current"
      }
    },
    {
      "id": "boss_panel",
      "component": "SeasonBossPanel",
      "slot": "boss",
      "priority": 10,
      "props": {
        "seasonId": "current",
        "presentation": "full"
      }
    },
    {
      "id": "events_list",
      "component": "EventCardList",
      "slot": "events",
      "priority": 10,
      "props": {
        "eventScope": "weekly"
      }
    }
  ]
}
```

---

## 18.4 Mission List Shell Example

This is a **structure-only** example. The actual mission list, mission availability, team validation, and mission start flow remain code-driven and backend-validated.

```json
{
  "id": "mission_list_shell_v1",
  "type": "screen_composition",
  "screenKey": "missions",
  "version": 1,
  "status": "active",
  "metadata": {
    "name": "Mission List Shell",
    "description": "Data-driven structural modules for the Missions screen. Core mission logic remains coded."
  },
  "navigation": {
    "showTopBar": true,
    "showBottomNav": true,
    "selectedTab": "missions",
    "title": "Missions"
  },
  "layout": {
    "layoutType": "fixed_structure",
    "safeArea": true,
    "padding": "standard",
    "gap": "standard"
  },
  "dataSources": [
    {
      "id": "season_summary",
      "sourceType": "api",
      "endpoint": "/api/seasons/current/summary",
      "method": "GET",
      "cacheTtlSeconds": 60,
      "required": false
    }
  ],
  "sections": [
    {
      "id": "seasonal_mission_banner",
      "component": "MissionFeaturedCard",
      "slot": "header_banner",
      "priority": 10,
      "visibility": {
        "all": [
          {
            "path": "season_summary.isActive",
            "operator": "equals",
            "value": true
          }
        ]
      },
      "props": {
        "missionGroup": "seasonal",
        "title": "Seasonal Missions",
        "cta": {
          "label": "View Seasonal",
          "action": {
            "type": "navigate",
            "target": "missions",
            "params": {
              "filter": "seasonal"
            }
          }
        }
      }
    },
    {
      "id": "mission_category_rail",
      "component": "MissionCategoryRail",
      "slot": "category_rail",
      "priority": 20,
      "props": {
        "categories": ["quick", "standard", "scavenging", "rescue", "seasonal", "boss"]
      }
    },
    {
      "id": "mission_help_tip",
      "component": "HelpTipCard",
      "slot": "help_card",
      "priority": 90,
      "props": {
        "title": "Team synergy matters",
        "body": "Matching archetypes can boost your mission performance. The server will validate your final team before launch."
      }
    }
  ]
}
```

---

## 18.5 Wallet Prompt Modal Example

```json
{
  "id": "wallet_connect_prompt_modal_v1",
  "type": "screen_composition",
  "screenKey": "wallet_connect_prompt_modal",
  "version": 1,
  "status": "active",
  "audience": {
    "walletStatus": "not_connected",
    "minKeeperLevel": 3
  },
  "layout": {
    "layoutType": "modal_stack",
    "modal": {
      "size": "medium",
      "dismissible": true,
      "closeOnBackdrop": true
    }
  },
  "sections": [
    {
      "id": "wallet_prompt",
      "component": "WalletPromptCard",
      "slot": "main",
      "priority": 10,
      "props": {
        "title": "Connect your wallet?",
        "body": "Wallets unlock NFT capacity slots and ownership features. The game is still fully playable without one.",
        "primaryCta": {
          "label": "Connect Wallet",
          "action": {
            "type": "navigate",
            "target": "wallet_connect"
          }
        },
        "secondaryCta": {
          "label": "Maybe later",
          "action": {
            "type": "close_modal"
          }
        }
      }
    },
    {
      "id": "nft_capacity_info",
      "component": "NFTCapacityInfoCard",
      "slot": "main",
      "priority": 20,
      "props": {
        "emphasis": "capacity_not_power"
      }
    }
  ]
}
```

---

# 19. Implementation Notes

## 19.1 Resolver Flow

Recommended runtime process:

```txt
1. Client requests screen composition by screenKey.
2. Backend finds active definition for screenKey, platform, version, audience, and availability.
3. Backend or client loads declared data sources.
4. Visibility rules are evaluated against resolved context.
5. Invalid or hidden sections are removed.
6. Sections are sorted by priority.
7. Component props are validated.
8. Safe render payload is returned to the client.
9. Client renders components from registry.
```

The resolver can run server-side, client-side, or hybrid. For strongest control, resolve availability/audience server-side and render client-side.

---

## 19.2 Suggested API

```http
GET /api/screens/:screenKey
```

Example response:

```json
{
  "screenKey": "home",
  "version": 1,
  "layout": {},
  "sections": [],
  "resolvedAt": "2026-05-21T00:00:00Z"
}
```

Optional endpoints:

```http
GET /api/screens/:screenKey/preview?version=2
POST /api/admin/screens/:screenKey/validate
POST /api/admin/screens/:screenKey/publish
POST /api/admin/screens/:screenKey/rollback
```

---

## 19.3 Caching

Recommended caching behavior:

| Layer | What to cache | TTL |
|---|---|---:|
| Server | Active screen definitions | 1-5 minutes |
| Client | Screen definition payload | Until app restart or version change |
| Client | Data source responses | Per `cacheTtlSeconds` |
| CDN | Public static art/icons only | Long-lived |

Do not cache player-specific rewards, purchases, or claim states without server revalidation.

---

## 19.4 Rollout Strategy

Recommended rollout phases:

### Phase 1

Implement:

```txt
home_screen
store_screen
season_hub_screen
wallet_prompt_modal
empty_states
```

### Phase 2

Add:

```txt
events_hub_screen
battle_pass_screen
news_screen
menu_screen
onboarding_flow
```

### Phase 3

Add structure-only modules for:

```txt
mission_list_shell
crafting_shell
outposts_shell
inventory_shell
```

Do not start with Team Builder, Character Detail, or Outpost Map.

---

# 20. Safety Boundaries

The screen composition system must never include:

```txt
- Arbitrary JavaScript
- Raw HTML
- Inline SQL
- Unvalidated external URLs
- Client-side reward calculation
- Client-side purchase validation
- Client-side mission resolution
- Client-side crafting output generation
- Client-side NFT verification authority
```

Allowed:

```txt
- Selecting approved components
- Ordering approved components
- Passing validated props
- Showing or hiding sections from simple resolved facts
- Triggering approved actions
- Calling server endpoints that perform final validation
```

---

# 21. Design Guidance for Derp Universe

The screen composition system should still respect Derp Universe's UI identity:

- Mobile-first
- Chunky panels
- Bold CTAs
- Dark-mode native
- Playful but readable
- High contrast
- No corporate SaaS feeling
- No glassmorphism
- No overly thin iconography
- No raw generic monetization layouts

Definitions should control the arrangement of Derpy components, not turn the UI into a generic remote-config dashboard.

---

# 22. Final Recommendation

Build `ScreenCompositionDefinition` as a constrained, versioned JSON definition type with:

```txt
layout + sections + visibility + props + actions + analytics + fallback
```

Use it heavily for:

```txt
Home
Store
Season Hub
Events
Battle Pass
News
Menu
Onboarding
Wallet prompts
Offer modals
Empty states
```

Use it structurally for:

```txt
Mission List
Mission Detail
Outposts List
Outpost Detail
Crafting
Inventory
Character Roster
```

Avoid using it as the primary implementation for:

```txt
Character Detail
Team Builder
Outpost Map
Building/Room Management
Relic Equip/Compare
Crafting Confirmation
Mission Results
Boss Resolution
Payment Validation
NFT Verification
```

This gives Derp Universe strong live-ops flexibility while preserving stability, economy integrity, and server-authoritative game logic.
