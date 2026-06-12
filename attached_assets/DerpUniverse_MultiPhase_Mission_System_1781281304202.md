# Derp Universe - Multi-Phase Mission System

## Overview

This document defines the Multi-Phase Mission System for Derp Universe.

The goal is to support expedition-style missions where:
- A single team is committed for the entire mission.
- Injuries and penalties persist between phases.
- Team power is recalculated between phases.
- Mission outcomes can branch based on prior results.
- The mission occupies a single mission slot.
- The player experiences the entire sequence as one mission rather than multiple independent jobs.

## Design Goals

### Desired Behavior

Example mission:

**Recover the Lost Frost Relic**

Phase 1: Cross the frozen wastes  
Phase 2: Locate the relic chamber  
Phase 3: Escape with the relic

If a Bird becomes injured during Phase 1:
- The injury remains active
- Phase 2 uses reduced stats
- Phase 3 uses reduced stats

The mission should feel like one continuous adventure.

---

# High-Level Architecture

## Mission Definition

```ts
MissionDefinition {
  id: string
  name: string
  mode: "single" | "multi_phase"
  phases?: MissionPhaseDefinition[]
  launchRequirements: Requirement[]
  teamRules: TeamRules
  rewardsMode: "per_phase" | "final_bundle" | "hybrid"
}
```

## Mission Phase Definition

```ts
MissionPhaseDefinition {
  id: string
  order: number
  name: string
  description: string
  duration: number
  difficulty: number
  requirements?: Requirement[]
  modifiers?: Modifier[]
  successOutcome?: Outcome[]
  failureOutcome?: Outcome[]
  continueRules: ContinueRules
}
```

# Runtime Job Model

```ts
MissionJob {
  id: string
  missionDefinitionId: string
  mode: "single" | "multi_phase"
  teamEntityIds: string[]
  currentPhaseIndex: number
  phaseResults: PhaseResult[]
  accumulatedState: MissionState
  status:
    | "active"
    | "phase_ready"
    | "completed"
    | "failed"
    | "abandoned"
}
```

## Mission State

```ts
MissionState {
  injuries: InjuryState[]
  fatigue: FatigueState[]
  temporaryBonuses: ActiveEffect[]
  temporaryPenalties: ActiveEffect[]
  rewardMultipliers: Modifier[]
  narrativeFlags: string[]
}
```

## Phase Result

```ts
PhaseResult {
  phaseId: string
  successChance: number
  roll: number
  outcome:
    | "success"
    | "partial_success"
    | "failure"
    | "critical_failure"
  rewards: Reward[]
  injuriesApplied: InjuryState[]
  modifiersApplied: Modifier[]
}
```

## Continue Rules

```ts
ContinueRules {
  onSuccess:
    | "next_phase"
    | "complete"

  onPartialSuccess:
    | "next_phase"
    | "next_phase_with_penalty"
    | "complete"

  onFailure:
    | "next_phase_with_penalty"
    | "end_job"

  onCriticalFailure:
    | "end_job"
}
```

# Recommended Rules

- Team is locked when the mission starts.
- Injuries persist between phases.
- Mission occupies a single mission slot.
- Team power is recalculated at every phase.
- Rewards should generally use a hybrid model:
  - Small rewards per phase
  - Larger completion reward at the end
- Multi-phase missions should be represented as a single mission definition containing phases.
- Separate mission chaining should still exist for story campaigns and questlines, but not for expedition-style missions.

# Benefits

- Simpler UX
- Cleaner backend state management
- Better support for injury persistence
- Better support for fatigue systems
- Easier future expansion into branching paths, boss encounters, and expedition content
- Prevents team-swapping exploits between phases

# Future Expansion

Potential additions:

- Branching phases
- Optional side objectives
- Checkpoint systems
- Recovery phases
- Pred ambush phases
- Narrative decision phases
- Multi-day expeditions
