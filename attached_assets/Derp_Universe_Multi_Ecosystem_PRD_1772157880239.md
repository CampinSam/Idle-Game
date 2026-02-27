# 🌌 Derp Universe --- Multi-Ecosystem Product Requirements Document (PRD)

## Executive Vision

Derp Universe is a multi-ecosystem idle RPG framework capable of hosting
multiple NFT ecosystems inside a shared progression engine or powering
standalone games using the same backend infrastructure.

Long-term goal:

> Build a scalable idle-RPG infrastructure where different ecosystems
> plug into a shared progression, mission, and economy engine ---
> without breaking balance or pay-to-win guarantees.

------------------------------------------------------------------------

# Terminology Abstraction

  Derp Term      Generic Term
  -------------- ------------------------
  Bird           Entity
  Outpost        Location
  Derpling       Sub-Entity / Companion
  Ape            Chaos Modifier Entity
  Pred           Dark Modifier Entity
  Keeper Level   Account Level

Derps become one ecosystem implementation within a broader modular
platform.

------------------------------------------------------------------------

# Platform Philosophy

## Core Principles

1.  Ecosystems integrate without redesigning core systems.
2.  Zero pay-to-win is preserved globally.
3.  Sweat equity mechanics remain intact.
4.  Game is fully playable without NFTs.
5.  Backend remains server-authoritative.

------------------------------------------------------------------------

# Ecosystem Integration Models

## 1. Native Ecosystem

Fully integrated into core progression with dedicated regions and
seasonal content.

## 2. Guest Ecosystem

-   Characters map to EntityDefinitions.
-   Land maps to LocationDefinitions.
-   Uses shared missions and economy.
-   Can have ecosystem-specific seasonal content.

## 3. Standalone Mode

-   Uses same backend architecture.
-   Uses same progression and mission systems.
-   Can override content definitions.
-   Shares technology but not economy.

------------------------------------------------------------------------

# ENTITIES (Generic Character System)

An Entity represents any playable unit:

-   NFT character
-   Non-NFT starter unit
-   Seasonal limited character
-   Boss unit

All Entities share:

-   Core Stats (ATK, DEF, SPD, FOC, LCK, VIT)
-   Trait/Archetype matrix
-   Level 1--50 progression
-   Tier Advancement (T1--T5)
-   Mastery trees
-   Prestige eligibility

## Progression Pipeline

LEVELING → TIER ADVANCEMENT → MASTERY → PRESTIGE

## Mission Power Formula

MP = (ATK × 0.40) + (DEF × 0.30) + (SPD × 0.20) + (FOC × 0.10) + (LCK ×
0.05) + (VIT × 0.05)

------------------------------------------------------------------------

# LOCATIONS (Generic Idle Base System)

A Location is any idle production base:

-   Outpost
-   Colony
-   Castle
-   Space Station

Locations:

-   Generate currency and materials
-   Host worker Entities
-   Contain buildings and rooms
-   Scale via level-based rules
-   Support threat/corruption mechanics

------------------------------------------------------------------------

# Mission Engine (Shared Across Ecosystems)

Mission Types:

-   Quick
-   Standard
-   Scavenging
-   Rescue
-   Location
-   Seasonal
-   Boss

Success Formula:

Success = MP / (MP + Difficulty)

Clamped between 5% and 95%.

------------------------------------------------------------------------

# Unified Economy Layer

Core resource categories:

-   Soft Currency
-   Materials (Tiered)
-   Essence (Time Gate)
-   Seasonal Currency
-   Prestige Tokens
-   Blueprint Fragments
-   Mission Tickets
-   Corruption Fragments

Currencies are partitioned as: - Global - Ecosystem-specific - Seasonal

Prevents inflation exploits and cross-game imbalance.

------------------------------------------------------------------------

# Seasonal Framework

Two layers:

## Global Season

-   Shared boss
-   Shared leaderboard
-   Cross-ecosystem theme

## Ecosystem-Specific Season

-   Custom missions
-   Custom boss
-   Custom materials
-   Ecosystem leaderboard

60-day seasonal cycles.

------------------------------------------------------------------------

# Web3 Philosophy

NFTs unlock capacity, not power.

  NFT Role        Generic Function
  --------------- -----------------------
  Character NFT   Unlocks Entity Slot
  Land NFT        Unlocks Location Slot
  Companion NFT   Unlocks Modifier Slot

NFTs do not: - Increase stat ceilings - Bypass time gates - Increase
mission caps

------------------------------------------------------------------------

# Backend Architecture

-   NestJS + PostgreSQL
-   Server-authoritative mission resolution
-   Ecosystem tagging across tables
-   Horizontal scalability

All content is data-driven via: - EntityDefinition -
LocationDefinition - MissionDef - RecipeDef - EventDefinition

------------------------------------------------------------------------

# Anti-Whale Constraints

-   Synergy cap (+30%)
-   Potion limits per mission
-   MP diminishing returns
-   Location slot caps tied to account level
-   Crafting luck caps

Applies platform-wide across ecosystems.

------------------------------------------------------------------------

# Long-Term Strategy

Phase 1: Single ecosystem stabilization\
Phase 2: External ecosystem onboarding\
Phase 3: Platform licensing & standalone deployments

------------------------------------------------------------------------

# Final Summary

Derp Universe evolves from a game into a modular idle-RPG platform where
multiple NFT ecosystems can map their characters to Entities and their
land to Locations while maintaining economic stability, competitive
fairness, and zero pay-to-win integrity.
