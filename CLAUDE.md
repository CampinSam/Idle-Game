# CLAUDE.md — Derp Universe Development Guide

> **Project**: Derp Universe - Season-based Idle Strategy RPG
> **Platform**: Cross-platform (Web, Mobile, Desktop)
> **Blockchain**: Cardano-native with optional NFT integration
> **Phase**: MVP Development

---

## 🎯 Project Overview

Derp Universe is a casual-friendly idle RPG where players manage Outposts, send Birds on missions, craft relics, and participate in seasonal events. The game is fully playable without NFTs or blockchain interaction.

### Core Loop
```
Check Outposts → Send Missions → Craft Items → Collect Rewards → Repeat
```

### Design Litmus Tests
Before implementing any feature, verify:
1. **Is it Derpy?** — Has personality and humor
2. **Is it fair?** — Free players enjoy it equally
3. **Is it engaging?** — Respects player time
4. **Is it sustainable?** — Works for years, not months
5. **Is it balanced?** — No unfair whale advantages

---

## 🏗️ Architecture Principles

### Non-Negotiables
- **Server authoritative** — Client sends intent, server calculates everything
- **Off-chain gameplay, on-chain ownership** — PostgreSQL for gameplay, Cardano for NFTs
- **Deterministic math, stochastic outcomes** — RNG never affects validation, only outcomes
- **Feature-gated systems** — Gates enforced server-side, client receives visibility hints
- **Horizontal scalability first** — Monolith → Modular → Microservices

### Security Rules
- Client NEVER calculates Mission Power (MP)
- Client NEVER determines success/failure
- Client NEVER generates rewards
- All rolls are server-seeded and replayable for audit

---

## 🛠️ Technology Stack

### Backend
| Component | Technology | Notes |
|-----------|------------|-------|
| API Framework | NestJS (TypeScript) | Modular architecture |
| Runtime | Node.js 20+ | LTS version |
| Database | PostgreSQL 15+ | Primary data store |
| Cache | Redis 7+ | Session, rate limiting |
| Message Queue | RabbitMQ | Async job processing |
| File Storage | AWS S3 / MinIO | Assets, exports |

### Frontend
| Platform | Technology |
|----------|------------|
| Web | React 18+ (TypeScript) |
| Mobile | React Native or Unity |
| State | Redux Toolkit |

### Blockchain
| Component | Technology |
|-----------|------------|
| Network | Cardano |
| Indexer | Koios / Maestro / Blockfrost |
| Wallet | CIP-30 (Nami, Eternl, Lace, Flint, Typhon) |

---

## 📁 Recommended Project Structure

```
derp-universe/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── player/     # Player profiles, keeper progression
│   │   │   │   ├── bird/       # Birds, stats, traits, archetypes
│   │   │   │   ├── mission/    # Mission definitions, resolution
│   │   │   │   ├── outpost/    # Outposts, buildings, workers
│   │   │   │   ├── crafting/   # Recipes, jobs, results
│   │   │   │   ├── economy/    # Currencies, resources, sinks
│   │   │   │   ├── relic/      # Relics, effects, leveling
│   │   │   │   ├── season/     # Seasons, events, battle pass
│   │   │   │   └── synergy/    # Synergy engine (pure functions)
│   │   │   ├── common/
│   │   │   │   ├── guards/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   └── interceptors/
│   │   │   └── config/
│   │   └── test/
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   ├── services/
│       │   ├── store/
│       │   └── utils/
│       └── public/
├── packages/
│   ├── shared/                 # Shared types, constants, utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   └── utils/
│   └── math/                   # Deterministic math library
│       ├── src/
│       │   ├── mission-power.ts
│       │   ├── synergy.ts
│       │   ├── crafting-luck.ts
│       │   └── success-probability.ts
│       └── test/
├── prisma/                     # Database schema
│   └── schema.prisma
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile
└── docs/
    ├── api/
    └── design/
```

---

## 🎮 Core Game Systems

### 1. Birds (Primary Characters)

**Stats**: ATK, DEF, SPD, FOC, LCK, VIT

**Archetypes** (14 total):
Dave, Astro, Magician, Ninja, Redneck, Stoner, DJ, Viking, Monk, Corpo, Cyborg, Buff, Mad Scientist, Deity

**Progression Chain**:
```
Leveling (1-50) → Ascension (T1-T5) → Mastery → Prestige (optional reset)
```

**Perfect Specimen**: All 7 traits share same archetype = +10% stats, +5% synergy, +20% Crafting Luck

### 2. Mission Power Formula

```typescript
// Base MP (all server-side)
const calculateMP = (stats: BirdStats): number => {
  return (stats.ATK * 0.40) +
         (stats.DEF * 0.30) +
         (stats.SPD * 0.20) +
         (stats.FOC * 0.10) +
         (stats.LCK * 0.05) +
         (stats.VIT * 0.05);
};

// Team MP with synergy
const calculateTeamMP = (birds: Bird[]): number => {
  const individualMPs = birds.map(b => calculateMP(b.stats));
  const synergyBonus = calculateSynergyBonus(birds); // Max +30%
  return individualMPs.reduce((a, b) => a + b, 0) * (1 + synergyBonus);
};

// Success probability
const calculateSuccessChance = (mp: number, difficulty: number): number => {
  return Math.min(Math.max(mp / (mp + difficulty), 0.05), 0.95);
};
```

### 3. Synergy System

| Synergy Score | MP Bonus |
|---------------|----------|
| 0-5 | +0% |
| 6-10 | +5% |
| 11-15 | +10% |
| 16-20 | +15% |
| 21-25 | +20% |
| 26-30 | +25% |
| 31+ | +30% (CAPPED) |

### 4. Crafting Luck Formula

```typescript
const calculateCraftingLuck = (bird: Bird, bonuses: Bonuses): number => {
  const cl = (bird.stats.FOC * 0.5) +
             (bird.stats.LCK * 0.3) +
             bonuses.relic +
             bonuses.worker +
             bonuses.room;
  return Math.min(cl, 150); // Hard cap at 150
};
```

### 5. Outpost System

**Regions** (7 fungible): Derpshire Valley, Chillartica Drifts, Sandcrypt Badlands, Chillvine Jungle, Pinnacle Perch, Baldo's Bog, LavaLode Peaks

**Unique 1-of-1 Outposts** (7): Farmland Hatchery, Deity Temple, Tree of Death, Moon Base, Mothership, Pred Cave, The Mega Crystal

**Worker Slots by Level**:
| Level | Slots |
|-------|-------|
| 1-9 | 2 |
| 10-19 | 3 |
| 20-29 | 4 |
| 30-39 | 5 |
| 40-49 | 6 |
| 50 | 7 |

---

## 🚫 Anti-Whale Mechanisms

Implement ALL of these constraints:

```typescript
const ANTI_WHALE_CAPS = {
  // Progression caps
  maxActiveOutposts: (keeperLevel: number) => Math.floor(keeperLevel / 20) + 1, // Max 6
  maxActiveMissions: (keeperLevel: number) => Math.floor(keeperLevel / 20) + 2, // Max 6
  
  // Stat caps
  mpEffectivenessCap: 500,        // Diminishing returns above this
  synergyStackingCap: 0.30,       // Max +30% from synergy
  craftingLuckCap: 150,           // Max CL
  
  // Daily caps
  dailyPotionCap: (keeperLevel: number) => 15 + (keeperLevel * 0.5),
  
  // Threat scaling
  threatScaling: (outpostCount: number) => outpostCount * 0.1, // More outposts = more threat
};
```

---

## 💾 Database Schema (Prisma)

```prisma
// Core entities - expand as needed

model User {
  id              String    @id @default(uuid())
  username        String    @unique
  email           String?   @unique
  walletAddress   String?
  keeperLevel     Int       @default(1)
  keeperXp        BigInt    @default(0)
  prestigeTokens  Int       @default(0)
  createdAt       DateTime  @default(now())
  
  birds           Bird[]
  outposts        Outpost[]
  missions        Mission[]
}

model Bird {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  nftAssetId      String?   @unique
  
  level           Int       @default(1)
  xp              BigInt    @default(0)
  ascensionTier   Int       @default(0)
  
  stats           Json      // { ATK, DEF, SPD, FOC, LCK, VIT }
  traits          Json      // { head, ears, beak, eyes, body, back, tail }
  mastery         Json?
  relics          Json      @default("[]")
  
  status          String    @default("idle") // idle, mission, working, injured
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Outpost {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  nftAssetId      String?   @unique
  
  region          String
  isUnique        Boolean   @default(false)
  level           Int       @default(1)
  
  threatLevel     Float     @default(0)
  corruptionLevel Float     @default(0)
  
  buildings       Json      @default("[]")
  rooms           Json      @default("[]")
  workers         Json      @default("[]")
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Mission {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  
  missionType     String
  difficulty      Int
  team            Json      // Bird IDs
  
  status          String    @default("active") // active, completed, failed
  startedAt       DateTime  @default(now())
  completesAt     DateTime
  
  result          Json?     // Populated on completion
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

---

## 🎨 UI/UX Guidelines

### Visual Identity (from Art Bible)
- **Lines**: Thick, bold outlines with consistent stroke weight
- **Shapes**: Rounded, chunky silhouettes
- **Colors**: Flat, high-saturation digital colors (max 2 shadow tones)
- **Characters**: Oversized heads, compact bodies, short limbs, large eyes

### Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Derp Blue | #3A7BD5 | Primary actions, headers |
| Derp Purple | #8B5CF6 | Secondary actions |
| Success Green | #10B981 | Confirmations |
| Warning Orange | #F59E0B | Alerts |
| Error Red | #EF4444 | Errors |

### Faction Colors
| Faction | Colors |
|---------|--------|
| Derps | Cyan/Teal |
| Vamps | Purple/Magenta |
| Preds | Red/Orange |

### Design Rules
- Mobile-first: Large tap targets (min 44×44 pts)
- Dark-mode native
- Chunky arcade-style UI
- All key actions within 2 taps
- Accessible: Color-blind modes, text scaling, screen reader support

### Tone
```
✅ DO: Comedic mission names, silly flavor text, self-aware humor
❌ DON'T: Generic "Quest 47", corporate jargon, taking itself seriously
```

---

## 🧪 Testing Strategy

```typescript
// Required test coverage

// 1. Unit tests for math (packages/math/)
describe('MissionPower', () => {
  it('calculates base MP correctly');
  it('applies synergy bonus with cap');
  it('enforces anti-whale caps');
});

// 2. Snapshot tests for missions
describe('MissionResolution', () => {
  it('produces deterministic results from same seed');
  it('respects success probability bounds (5%-95%)');
});

// 3. Economy simulations
describe('Economy', () => {
  it('maintains sink/source balance');
  it('prevents currency inflation');
});

// 4. Integration tests
describe('MissionFlow', () => {
  it('validates team ownership server-side');
  it('rejects client-calculated MP');
});
```

---

## 📋 MVP Scope (Phase 1)

### Include
- [ ] Player registration (email + optional wallet)
- [ ] 1 starter Bird per player
- [ ] 1 starter Outpost (Derpshire Valley)
- [ ] Basic missions (Quick, Standard)
- [ ] Core stats and leveling (1-50)
- [ ] Basic crafting (potions)
- [ ] Arcanium economy
- [ ] Basic UI (Home, Outposts, Missions, Birds)

### Exclude for MVP
- Ascension system
- Mastery trees
- Prestige system
- Seasonal content
- Battle Pass
- NFT integration
- $DERP token
- Dark Forge
- Unique 1-of-1 Outposts

---

## ⚠️ Critical DON'Ts

```
❌ Do NOT client-calculate Mission Power
❌ Do NOT expose raw formulas to client early
❌ Do NOT allow currency minting without sinks
❌ Do NOT entangle blockchain with gameplay loops
❌ Do NOT allow client-trusted timers
❌ Do NOT create any P2W mechanics
❌ Do NOT use NFTs for power (only capacity)
```

---

## 🔗 Reference Documents

- `Derp_Universe_GDD_Consolidated.md` — Complete game design
- `TECH_FULL.md` — Full technical architecture
- `Derp_IP_Art_Bible_v1_1.pdf` — Visual design guidelines

---

## 💡 Development Commands

```bash
# Start development
pnpm dev

# Run tests
pnpm test
pnpm test:e2e

# Database
pnpm prisma:migrate
pnpm prisma:generate
pnpm prisma:studio

# Build
pnpm build

# Lint
pnpm lint
pnpm lint:fix
```

---

*"Check in. Send missions. Craft chaos. Repeat."*
