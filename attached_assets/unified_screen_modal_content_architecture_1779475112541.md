# Unified Screen / Modal / Content Architecture

## Overview

This document describes the recommended evolution from:

```text
ScreenDefinition System
ModalDefinition System
```

to a unified architecture:

```text
Content Documents (shared content)
        ↑
        |
Screen Surfaces      Modal Surfaces
```

The goal is to eliminate duplicated UI definitions while preserving the strengths of both the existing screen and modal systems.

---

# The Problem

The original approach treated screens and modals as independent composition systems.

```text
Home Screen
 └─ sections

Mission Screen
 └─ sections

Store Screen
 └─ sections

Reward Modal
 └─ sections

Mission Modal
 └─ sections
```

This works initially but quickly creates duplication.

Example:

- Mission Available screen
- Mission Active modal
- Mission Complete modal
- Mission History modal

All contain:

- Hero image
- Description
- Requirements
- Synergy information
- Team information
- Rewards
- Power vs difficulty

Only the container and actions change.

The actual content structure is almost identical.

---

# Core Principle

The content layout should not belong to either screens or modals.

Instead:

```text
Screens own screen chrome.

Modals own modal chrome.

Content documents own content.
```

---

# Final Architecture

```text
┌──────────────────────────────┐
│       Content Document       │
│                              │
│  Image Block                 │
│  Rich Text Block             │
│  Rewards Block               │
│  Team Block                  │
│  Requirements Block          │
│  Etc                         │
└──────────────┬───────────────┘
               │
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼

┌───────────────┐   ┌───────────────┐
│ Screen Surface│   │ Modal Surface │
└───────────────┘   └───────────────┘
```

Content becomes reusable everywhere.

---

# Layer 1: Content Documents

Content documents are the shared body definitions.

They are rendered by the existing block renderer.

## Responsibilities

Content documents own:

- block order
- content structure
- conditional blocks
- data bindings
- visual hierarchy

Content documents do NOT own:

- navigation
- modal buttons
- close behavior
- modal sizing
- routing
- back buttons

---

## Definition

```ts
type ContentDocumentDefinition = {
  id: string;
  version: number;

  blocks: BlockDefinition[];
}
```

---

## Example

```json
{
  "id": "mission_detail_document",

  "blocks": [
    {
      "type": "image",
      "source": "$mission.banner"
    },

    {
      "type": "rich_text",
      "content": "$mission.description"
    },

    {
      "type": "mission_requirements"
    },

    {
      "type": "mission_synergy"
    },

    {
      "type": "team_section"
    },

    {
      "type": "reward_list"
    }
  ]
}
```

---

# Layer 2: Screen Surfaces

Screen definitions become much thinner.

Their purpose is to define:

- routing
- navigation
- screen chrome
- document selection
- screen-level data sources

---

## Responsibilities

Screens own:

- route
- title
- navigation
- top bar
- bottom nav
- screen background
- document selection
- refresh rules

Screens do NOT own:

- content blocks
- rewards lists
- requirements layouts
- modal buttons

Those belong to content documents.

---

## Definition

```ts
type ScreenSurfaceDefinition = {
  id: string;

  route: string;

  title: string;

  documentId: string;

  layout: LayoutDefinition;

  navigation: NavigationDefinition;

  dataSources: DataSourceDefinition[];

  visibilityRules?: VisibilityRule[];
}
```

---

## Example

```json
{
  "id": "mission_detail_screen",

  "route": "/missions/:id",

  "title": "Mission",

  "documentId": "mission_detail_document",

  "navigation": {
    "showBottomNav": true
  }
}
```

---

# Layer 3: Modal Surfaces

Modals become responsible for presentation and actions.

---

## Responsibilities

Modals own:

- sizing
- presentation style
- close behavior
- action buttons
- modal transitions
- stacking rules
- modal lifecycle

Modals do NOT own:

- content layout
- block structure
- rewards rendering
- requirements rendering

---

## Definition

```ts
type ModalSurfaceDefinition = {
  id: string;

  presentation: ModalPresentation;

  documentId: string;

  buttons: ModalButtonDefinition[];

  dismissRules: DismissRuleDefinition;
}
```

---

## Example

```json
{
  "id": "active_mission_modal",

  "presentation": {
    "variant": "bottom_sheet",
    "size": "large"
  },

  "documentId": "mission_detail_document",

  "buttons": [
    {
      "label": "Close"
    },
    {
      "label": "Skip"
    }
  ]
}
```

---

# Mission Detail Example

This is where the architecture really shines.

---

## Available Mission

Container:

```text
Screen
```

Content:

```text
mission_detail_document
```

Actions:

```text
Start Mission
```

---

## Active Mission

Container:

```text
Modal
```

Content:

```text
mission_detail_document
```

Actions:

```text
Close
Skip
```

---

## Completed Mission

Container:

```text
Modal
```

Content:

```text
mission_detail_document
```

Actions:

```text
Close
Claim Rewards
```

---

## Historical Mission

Container:

```text
Modal
```

Content:

```text
mission_detail_document
```

Actions:

```text
Close
Run Again
```

---

# Context-Driven Rendering

A document should not know whether it is displayed inside a screen or modal.

Instead it receives context.

Example:

```json
{
  "teamMode": "editable",
  "rewardMode": "preview"
}
```

or

```json
{
  "teamMode": "locked",
  "rewardMode": "actual"
}
```

Blocks can adjust behavior accordingly.

---

# Recommended Ownership Matrix

| Responsibility | Content | Screen | Modal |
|---------------|----------|---------|---------|
| Block order | Yes | No | No |
| Rich text | Yes | No | No |
| Images | Yes | No | No |
| Rewards lists | Yes | No | No |
| Requirements | Yes | No | No |
| Routing | No | Yes | No |
| Top bar | No | Yes | No |
| Bottom navigation | No | Yes | No |
| Screen background | No | Yes | No |
| Modal presentation | No | No | Yes |
| Modal sizing | No | No | Yes |
| Close button | No | No | Yes |
| Action buttons | No | No | Yes |
| Dismiss rules | No | No | Yes |

---

# Migration Plan

## Phase 1

Keep current modal system intact.

Introduce:

```text
ContentDocumentDefinition
```

and allow modals to reference documents.

---

## Phase 2

Convert screen definitions.

Remove:

```text
sections
cards
panels
components
```

from screens.

Replace with:

```text
documentId
```

---

## Phase 3

Convert duplicated modal content.

Move shared layouts into reusable documents.

Examples:

```text
mission_detail_document
bird_detail_document
store_item_document
relic_detail_document
outpost_detail_document
```

---

## Phase 4

Add context-driven variants.

Instead of:

```text
mission_available_document
mission_active_document
mission_history_document
```

use:

```text
mission_detail_document
```

with context.

---

# Recommended End-State

The final architecture should be:

```text
Definitions
│
├── Content Documents
│   ├── mission_detail_document
│   ├── bird_detail_document
│   ├── outpost_detail_document
│   ├── relic_detail_document
│   └── store_item_document
│
├── Screen Surfaces
│   ├── home_screen
│   ├── mission_screen
│   ├── store_screen
│   └── outpost_screen
│
└── Modal Surfaces
    ├── mission_modal
    ├── reward_modal
    ├── store_purchase_modal
    └── bird_detail_modal
```

Benefits:

- One source of truth for content layouts
- Reusable UI definitions
- Reduced duplication
- Cleaner ownership boundaries
- Easier live-ops updates
- Better maintainability
- Consistent player experience across screens and modals
