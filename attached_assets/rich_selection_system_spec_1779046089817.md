# Derp Universe — Unified Rich Selection System Specification

## Purpose

This document defines the new unified **Rich Selection System** used throughout Derp Universe.

The Rich Selection System replaces:

- Requirements objects
- Visibility requirement objects
- Synergy selector objects
- Bonus qualification selectors
- Seasonal condition selectors
- Conditional filtering systems

The goal is to create a single, extensible, recursive rule language that can evaluate:

- Teams
- Birds
- Outposts
- Buildings
- Rooms
- Crafting jobs
- Missions
- Inventory
- Seasons
- Temporary effects
- Derived stats
- Synergies
- Contextual state

---

# Core Design Philosophy

## Key Principle

The system separates:

### Selection

Determines:

> Does this object/team/player qualify?

Represented by:

```ts
RichSelection
RichSelectionRule
```

### Effects

Determines:

> What happens when the selection qualifies?

Represented by:

```ts
ConditionalEffect
```

This prevents duplication of selector logic across multiple systems.

---

# Core Objects

## RichSelection

Recursive logical condition group.

### Example

```json
{
  "op": "AND",
  "rules": []
}
```

---

## RichSelectionRule

Single evaluable condition.

### Example

```json
{
  "scope": "team",
  "field": "traits.Ninja",
  "aggregate": "sum",
  "operator": "gte",
  "value": 2,
  "includeTemporary": true
}
```

---

## ConditionalEffect

Applies effects when a RichSelection evaluates true.

### Example

```json
{
  "condition": {
    "op": "AND",
    "rules": []
  },
  "effects": []
}
```

---

# RichSelection Schema

## Structure

```ts
interface RichSelection {
  op: "AND" | "OR" | "NOT";
  rules: Array<RichSelection | RichSelectionRule>;

  label?: string;
  description?: string;

  failText?: string;
  passText?: string;

  data?: Record<string, any>;
}
```

---

# RichSelectionRule Schema

## Structure

```ts
interface RichSelectionRule {
  id?: string;

  label?: string;
  description?: string;

  scope: ScopeType;
  field: string;

  aggregate?: AggregateType;

  operator: OperatorType;
  value?: any;

  where?: RichSelection;

  includeTemporary?: boolean;
  includeDerived?: boolean;

  caseSensitive?: boolean;

  failText?: string;
  passText?: string;

  data?: Record<string, any>;
}
```

---

# Supported Scopes

```ts
type ScopeType =
  | "player"
  | "entity"
  | "entity_slot"
  | "team"
  | "team_member"
  | "inventory"
  | "currency_balance"
  | "item"
  | "location"
  | "building"
  | "room"
  | "job"
  | "mission"
  | "recipe"
  | "season"
  | "event"
  | "context";
```

---

# Supported Aggregates

```ts
type AggregateType =
  | "self"
  | "any"
  | "all"
  | "none"
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "distinct_count"
  | "ratio";
```

---

# Supported Operators

```ts
type OperatorType =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "between"
  | "starts_with"
  | "ends_with"
  | "regex";
```

---

# ConditionalEffect Schema

## Structure

```ts
interface ConditionalEffect {
  id?: string;

  label?: string;

  condition: RichSelection;

  effects: Effect[];

  priority?: number;

  stackingPolicy?:
    | "stack"
    | "highest_only"
    | "exclusive"
    | "replace";

  maxApplications?: number;

  data?: Record<string, any>;
}
```

---

# Example — Mission Requirements

```json
{
  "op": "AND",
  "rules": [
    {
      "scope": "team",
      "field": "entities",
      "aggregate": "count",
      "operator": "between",
      "value": [3, 5],
      "failText": "Requires 3-5 Birds."
    },
    {
      "scope": "team",
      "field": "traits.Ninja",
      "aggregate": "sum",
      "operator": "gte",
      "value": 2,
      "includeTemporary": true,
      "failText": "Requires 2+ Ninja traits."
    },
    {
      "scope": "team",
      "field": "stats.SPD",
      "aggregate": "sum",
      "operator": "gte",
      "value": 150,
      "includeDerived": true,
      "failText": "Team SPD must be at least 150."
    }
  ]
}
```

---

# Example — Synergy Bonus

```json
{
  "id": "ninja_magician_infiltration_bonus",
  "label": "Ninja + Magician Infiltration Bonus",
  "condition": {
    "op": "AND",
    "rules": [
      {
        "scope": "team",
        "field": "traits.Ninja",
        "aggregate": "sum",
        "operator": "gte",
        "value": 3,
        "includeTemporary": true
      },
      {
        "scope": "team",
        "field": "traits.Magician",
        "aggregate": "sum",
        "operator": "gte",
        "value": 2,
        "includeTemporary": true
      }
    ]
  },
  "effects": [
    {
      "type": "modifier",
      "target": "mission.duration",
      "operation": "multiply",
      "value": 0.9
    },
    {
      "type": "modifier",
      "target": "mission.power",
      "operation": "add_percent",
      "value": 10
    }
  ],
  "stackingPolicy": "exclusive"
}
```

---

# Recommended Database Strategy

## Storage Type

Use:

```sql
JSONB
```

For:

- Mission requirements
- Visibility requirements
- Seasonal modifiers
- Building conditions
- Relic passives
- Crafting qualification
- Dynamic event logic

---

# Recommended Engine Architecture

## Recommended Components

```text
SelectionResolver
SelectionEvaluator
AggregationEngine
ConditionCompiler
EffectResolver
```

---

# Recommended Aliases

```ts
type Requirements = RichSelection;
type VisibilityRequirements = RichSelection;
type SynergyCondition = RichSelection;
type BonusCondition = RichSelection;
type UnlockCondition = RichSelection;
```

---

# Final Design Principles

## Goals Achieved

### Unified

One recursive rule language powers all game systems.

### Extensible

New scopes, operators, and aggregates can be added safely.

### Admin-Friendly

Human-readable structure suitable for admin tooling.

### Server-Authoritative

Supports derived and temporary values safely.

### Seasonal-Compatible

Supports dynamic live-op modifications.

### Future-Proof

Can support:

- Guilds
- PvP
- Raids
- World modifiers
- Dynamic economies
- AI-generated events
- Procedural content

---

# End of Specification
