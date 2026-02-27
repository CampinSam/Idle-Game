# 🌌 Derp Universe --- Multi‑Ecosystem Architecture

## Overview

This document defines the recommended production architecture for Derp
Universe as a multi‑ecosystem, server‑authoritative idle RPG platform.

The architecture is optimized for:

-   Deterministic mission resolution
-   Ledger-backed economic integrity
-   Multi-ecosystem isolation
-   Hot-swappable content packs
-   Long-term live service scalability
-   Operational clarity and observability

------------------------------------------------------------------------

# 🧱 Technology Stack

## Backend API & Admin

-   Language: TypeScript
-   Purpose: Game API, Admin Panel, Content Compiler, Live Ops endpoints
-   Reasoning: Fast iteration, strong typing, large hiring pool,
    excellent tooling

## High-Throughput Workers

-   Language: Go
-   Purpose: Job resolution, scheduled tasks, seasonal transitions,
    ingestion workers
-   Reasoning: Concurrency efficiency, predictable performance, simple
    deployments

## Shared Rules Engine

-   Start in TypeScript
-   Port high-performance resolution loops to Go if needed

## Client Options

-   Unity (C#) for game-first experiences
-   React Native (TypeScript) for UI-heavy mobile apps
-   Web Admin: React (TypeScript)

## Infrastructure as Code

-   Terraform

## Data & Scripting

-   Python (analytics, anomaly detection, internal tooling)

------------------------------------------------------------------------

# 🗄 Database Architecture

## Primary Transactional Database

PostgreSQL

Used for: - Users & Ecosystem Membership - Entities (instances) -
Locations (instances) - Inventory & Ledger - Jobs - Gifts &
Notifications - Seasons & Progress

### Critical Design Patterns

-   Ledger-backed economy (ledger_tx + ledger_entry)
-   Idempotency keys on all reward flows
-   Outbox table for reliable event publishing
-   Partial indexes for job resolution
-   Future partitioning by ecosystem_id + timestamp

------------------------------------------------------------------------

## Cache Layer

Redis

Used for: - Dashboard caching (short TTL) - Leaderboards (sorted sets) -
Session caching - Rate limiting - Feature flag caching

Redis is never authoritative.

------------------------------------------------------------------------

## Analytics & Telemetry

ClickHouse (recommended)\
Alternative: BigQuery (managed)

Used for: - Economy generation vs sink analysis - Retention funnels -
Mission success distributions - Cheat signal detection - Seasonal
performance tracking

------------------------------------------------------------------------

## Content Storage

### Content Packs Model

Definitions stored in DB and compiled into versioned artifacts.

-   Author/edit via Admin Panel
-   Publish → compile → validate → generate checksum
-   Store compiled pack in object storage
-   Activate via content_activation table

Ensures reproducibility and safe hotfixes.

------------------------------------------------------------------------

# 🧠 Core Runtime Model

## Unified Job System

All timed gameplay is represented as a Job:

-   Mission runs
-   Crafting jobs
-   Building upgrades
-   Event timers
-   Gift windows

Job lifecycle: queued → active → resolvable → resolved → claimed

Jobs store: - Inputs snapshot - Content version references -
Deterministic seed - Resolution result

------------------------------------------------------------------------

## Ledger-Based Economy

All currency/item changes go through:

-   ledger_tx (transaction header)
-   ledger_entry (individual deltas)

Guarantees: - Auditability - Idempotency - Replayability - Dispute
resolution

------------------------------------------------------------------------

## Lazy Location Accrual

Locations store last_accrual_at.

On collect: - Calculate delta time - Apply modifiers & caps - Write
ledger transaction - Update timestamp

Avoids constant ticking writes.

------------------------------------------------------------------------

# 🏗 Service Module Boundaries

Modular Monolith design with strict domain separation:

-   identity
-   ecosystems
-   content
-   entities
-   locations
-   inventory
-   missions
-   crafting
-   jobs
-   events
-   liveops
-   integrations
-   admin
-   analytics

Modules communicate via application services, not direct table access.

------------------------------------------------------------------------

# 🔄 Scaling Strategy

## Phase 1 -- MVP

-   Single Postgres instance
-   Background job workers
-   Redis caching
-   Read replicas optional

## Phase 2 -- Growth

-   Partition hot tables (ledger_entry, job_log)
-   Introduce read replicas
-   Move analytics to ClickHouse

## Phase 3 -- Large Scale

-   Split services:
    -   Jobs/Resolution service
    -   Ledger/Inventory service
    -   Content service
-   Dedicated leaderboard system if needed

------------------------------------------------------------------------

# 🔐 Multi‑Ecosystem Isolation

All major tables include:

-   ecosystem_id
-   user_id

Allows: - Shared deployment across ecosystems - Isolated economies -
Parallel seasons - Safe cross-ecosystem events

------------------------------------------------------------------------

# 🧪 Observability & Operations

Required capabilities:

-   Deterministic job replay
-   Economy dashboards
-   Cheat anomaly detection
-   Feature flag controls
-   Outbox event monitoring
-   Seasonal activation tooling

------------------------------------------------------------------------

# 🏁 Summary

Recommended Architecture Stack:

Backend API: TypeScript\
Workers: Go\
Primary DB: PostgreSQL\
Cache: Redis\
Analytics: ClickHouse\
Content Artifacts: Object Storage\
IaC: Terraform

This architecture provides:

-   High iteration velocity
-   Deterministic, replayable gameplay resolution
-   Economic safety via ledger
-   Multi-ecosystem scalability
-   Clean path to service decomposition later
