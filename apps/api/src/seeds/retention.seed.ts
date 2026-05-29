import { Logger } from '@nestjs/common';

const logger = new Logger('RetentionSeed');

// Retention loops set #1: daily/weekly cadence quests + achievements with
// permanent bonuses on claim. Kept in TypeScript (not the giant
// definitions.json) so they're easy to edit at the design layer and so the
// `permanentEffectSpec` references to existing EffectDefs stay readable.
//
// All ids are namespaced (`q_daily_*`, `q_weekly_*`, `ach_*`) so they
// can't collide with the legacy story quest ids in definitions.json.
//
// Reward shapes match the existing GameRulesService outcome resolver:
// `{ type: 'currency'|'item', key: <id>, min, max }` (min=max for fixed).
// Permanent effects reference EffectDefs already seeded in
// `BootstrapService.seedEffectDefinitions`.

const DAILY_QUESTS = [
  {
    id: 'q_daily_complete_missions',
    name: 'Daily Hustle',
    description: 'Complete 3 missions today.',
    category: 'daily',
    cadence: 'daily',
    repeatable: true,
    objectives: [
      {
        eventType: 'mission_complete',
        target: 3,
        description: 'Complete 3 missions',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'soft_arcanium', min: 100, max: 100 },
    ],
    sortOrder: 10,
    enabled: true,
  },
  {
    id: 'q_daily_check_in',
    name: 'Show Up',
    description: 'Claim your daily check-in.',
    category: 'daily',
    cadence: 'daily',
    repeatable: true,
    objectives: [
      {
        eventType: 'checkin_completed',
        target: 1,
        description: 'Claim daily check-in',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'soft_arcanium', min: 50, max: 50 },
    ],
    sortOrder: 20,
    enabled: true,
  },
  {
    id: 'q_daily_craft_one',
    name: 'Workshop Warm-Up',
    description: 'Craft 1 item today.',
    category: 'daily',
    cadence: 'daily',
    repeatable: true,
    objectives: [
      {
        eventType: 'crafting_completed',
        target: 1,
        description: 'Craft 1 item',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'soft_arcanium', min: 75, max: 75 },
    ],
    sortOrder: 30,
    enabled: true,
  },
  // Demonstrates the selector field: only mission_complete events with
  // amount >= 1 increment this objective. The selector uses event.type eq
  // so it won't fire for crafting, check-in, or any other event type.
  {
    id: 'q_daily_swift_missions',
    name: 'Swift Missions',
    description: 'Complete 2 missions today using the selector filter.',
    category: 'daily',
    cadence: 'daily',
    repeatable: true,
    objectives: [
      {
        description: 'Complete 2 missions',
        target: 2,
        selector: {
          op: 'AND',
          rules: [
            {
              scope: 'event',
              field: 'type',
              operator: 'eq',
              value: 'mission_complete',
            },
          ],
        },
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'soft_arcanium', min: 80, max: 80 },
    ],
    sortOrder: 35,
    enabled: true,
  },
];

const WEEKLY_QUESTS = [
  {
    id: 'q_weekly_mission_marathon',
    name: 'Mission Marathon',
    description: 'Complete 25 missions this week.',
    category: 'weekly',
    cadence: 'weekly',
    repeatable: true,
    objectives: [
      {
        eventType: 'mission_complete',
        target: 25,
        description: 'Complete 25 missions',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'hard_essence', min: 50, max: 50 },
      { type: 'item', key: 'item_xp_boost_elixir', min: 2, max: 2 },
    ],
    sortOrder: 100,
    enabled: true,
  },
  {
    id: 'q_weekly_check_in_streak',
    name: 'Faithful Keeper',
    description: 'Claim 5 daily check-ins this week.',
    category: 'weekly',
    cadence: 'weekly',
    repeatable: true,
    objectives: [
      {
        eventType: 'checkin_completed',
        target: 5,
        description: 'Claim 5 daily check-ins',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'hard_essence', min: 30, max: 30 },
    ],
    sortOrder: 110,
    enabled: true,
  },
];

const ACHIEVEMENTS = [
  {
    id: 'ach_mission_novice',
    name: 'Mission Novice',
    description: 'Complete 10 missions.',
    category: 'missions',
    tier: 1,
    objectives: [
      {
        eventType: 'mission_complete',
        target: 10,
        description: 'Complete 10 missions',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'soft_arcanium', min: 250, max: 250 },
    ],
    permanentEffectSpec: null,
    sortOrder: 10,
    enabled: true,
  },
  {
    id: 'ach_mission_veteran',
    name: 'Mission Veteran',
    description: 'Complete 100 missions. Earn a permanent +5% XP boost on missions.',
    category: 'missions',
    tier: 3,
    objectives: [
      {
        eventType: 'mission_complete',
        target: 100,
        description: 'Complete 100 missions',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'hard_essence', min: 25, max: 25 },
    ],
    // Permanent +5% XP. Reuses the existing `eff_xp_boost_timed` EffectDef
    // template but overrides `value` to 5 — and crucially the claim path
    // sets `expiresAt: null` so the bonus never wears off.
    permanentEffectSpec: {
      effectDefId: 'eff_xp_boost_timed',
      targetType: 'player',
      value: 5,
    },
    sortOrder: 20,
    enabled: true,
  },
  {
    id: 'ach_first_craft',
    name: 'First Craft',
    description: 'Craft your first item.',
    category: 'crafting',
    tier: 1,
    objectives: [
      {
        eventType: 'crafting_completed',
        target: 1,
        description: 'Craft 1 item',
      },
    ],
    rewardSpec: [
      { type: 'item', key: 'item_xp_potion_small', min: 3, max: 3 },
    ],
    permanentEffectSpec: null,
    sortOrder: 30,
    enabled: true,
  },
  {
    id: 'ach_master_crafter',
    name: 'Master Crafter',
    description: 'Craft 50 items. Earn a permanent +10% reward boost.',
    category: 'crafting',
    tier: 3,
    objectives: [
      {
        eventType: 'crafting_completed',
        target: 50,
        description: 'Craft 50 items',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'hard_essence', min: 50, max: 50 },
    ],
    permanentEffectSpec: {
      effectDefId: 'eff_reward_boost',
      targetType: 'player',
      value: 10,
    },
    sortOrder: 40,
    enabled: true,
  },
  {
    id: 'ach_login_devotee',
    name: 'Devoted Keeper',
    description: 'Claim 30 daily check-ins. Earn a permanent +5% currency boost.',
    category: 'login',
    tier: 4,
    objectives: [
      {
        eventType: 'checkin_completed',
        target: 30,
        description: 'Claim 30 daily check-ins',
      },
    ],
    rewardSpec: [
      { type: 'currency', key: 'premium_gems', min: 10, max: 10 },
    ],
    permanentEffectSpec: {
      effectDefId: 'eff_currency_boost',
      targetType: 'player',
      value: 5,
    },
    sortOrder: 50,
    enabled: true,
  },
];

export async function seedRetention(prisma: any) {
  let questCount = 0;
  for (const q of [...DAILY_QUESTS, ...WEEKLY_QUESTS]) {
    const { id, ...data } = q;
    // Use `update: rest` so designers can tweak quest text/targets in this
    // file and the next boot picks it up — same pattern as
    // `upsertManyForce` in definitions.seed.ts.
    const before = await prisma.questDef.findUnique({ where: { id } });
    await prisma.questDef.upsert({ where: { id }, update: data, create: q });
    if (!before) questCount += 1;
  }
  if (questCount > 0) {
    logger.log(`Seeded ${questCount} new daily/weekly quest defs`);
  }

  let achCount = 0;
  for (const a of ACHIEVEMENTS) {
    const { id, ...rest } = a;
    // Achievement defs are unified with QuestDef using category='achievement'.
    // The sub-category stored on the ACHIEVEMENTS entries (missions/crafting/etc.)
    // is replaced with the canonical 'achievement' category so the frontend
    // can reliably filter them from regular quests.
    const data = { ...rest, category: 'achievement' };
    const before = await prisma.questDef.findUnique({ where: { id } });
    await prisma.questDef.upsert({ where: { id }, update: data, create: { id, ...data } });
    if (!before) achCount += 1;
  }
  if (achCount > 0) {
    logger.log(`Seeded ${achCount} new achievement defs`);
  }
}
