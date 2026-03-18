import { MissionDefinition } from '../types/mission';
import { DEFAULT_TIMER } from '../types/timer';

export const MISSION_DEFINITIONS: MissionDefinition[] = [
  {
    id: 'quick_egg_hunt',
    name: 'The Great Egg Hunt',
    description: 'Scramble around Derpshire looking for shiny eggs. Try not to sit on them.',
    difficulty: 50,
    timer: { ...DEFAULT_TIMER, duration: 30, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 5 }] },
    success: {
      rewards: [
        { type: 'entity_xp', min: 10, max: 25, odds: 100 },
        { type: 'keeper_xp', min: 5, max: 12, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 5, max: 15, odds: 100 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 3, max: 6, odds: 100 },
        { type: 'keeper_xp', min: 1, max: 3, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 1, operator: 'gte' }, { type: 'team_size', value: 1, operator: 'lte' }],
  },
  {
    id: 'quick_mushroom_patrol',
    name: 'Suspicious Mushroom Patrol',
    description: 'Those mushrooms are looking a bit too happy. Investigate immediately.',
    difficulty: 75,
    timer: { ...DEFAULT_TIMER, duration: 300, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 10 }] },
    success: {
      rewards: [
        { type: 'entity_xp', min: 15, max: 35, odds: 100 },
        { type: 'keeper_xp', min: 8, max: 18, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 8, max: 20, odds: 100 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 4, max: 9, odds: 100 },
        { type: 'keeper_xp', min: 2, max: 5, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 1, operator: 'gte' }, { type: 'team_size', value: 2, operator: 'lte' }],
  },
  {
    id: 'quick_mail_run',
    name: 'Derp Mail Express',
    description: 'Deliver very important letters. Contents: mostly doodles and snack requests.',
    difficulty: 40,
    timer: { ...DEFAULT_TIMER, duration: 180, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 8 }] },
    success: {
      rewards: [
        { type: 'entity_xp', min: 8, max: 18, odds: 100 },
        { type: 'keeper_xp', min: 4, max: 9, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 3, max: 10, odds: 100 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 2, max: 5, odds: 100 },
        { type: 'keeper_xp', min: 1, max: 2, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 1, operator: 'gte' }, { type: 'team_size', value: 1, operator: 'lte' }],
  },
  {
    id: 'standard_cave_explore',
    name: 'The Somewhat Scary Cave',
    description: 'A cave that is definitely not haunted. Probably. Send a team to find out.',
    difficulty: 120,
    timer: { ...DEFAULT_TIMER, duration: 1800, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 50 }], skip_type: 'scaling' },
    success: {
      rewards: [
        { type: 'entity_xp', min: 40, max: 80, odds: 100 },
        { type: 'keeper_xp', min: 20, max: 40, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 20, max: 50, odds: 100 },
        { type: 'item', key: 'mat_iron_ore', min: 1, max: 3, odds: 10 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 10, max: 20, odds: 100 },
        { type: 'keeper_xp', min: 5, max: 10, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 2, operator: 'gte' }, { type: 'team_size', value: 3, operator: 'lte' }, { type: 'keeper_level', value: 2 }],
  },
  {
    id: 'standard_bandit_camp',
    name: 'Bandit Camp Buffet Raid',
    description: 'The bandits stole the village snack supply. This cannot stand.',
    difficulty: 150,
    timer: { ...DEFAULT_TIMER, duration: 2700, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 75 }], skip_type: 'scaling' },
    success: {
      rewards: [
        { type: 'entity_xp', min: 60, max: 120, odds: 100 },
        { type: 'keeper_xp', min: 30, max: 60, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 30, max: 70, odds: 100 },
        { type: 'item', key: 'mat_mana_shard', min: 1, max: 2, odds: 15 },
        { type: 'flag', operation: 'set', key: 'completed_bandit_camp', value: true, odds: 100 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 15, max: 30, odds: 100 },
        { type: 'keeper_xp', min: 8, max: 15, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 2, operator: 'gte' }, { type: 'team_size', value: 3, operator: 'lte' }, { type: 'keeper_level', value: 3 }],
  },
  {
    id: 'standard_tower_climb',
    name: 'The Leaning Tower of Derp',
    description: 'Climb a suspiciously wobbly tower. Rumor has it there\'s treasure at the top. Also vertigo.',
    difficulty: 200,
    timer: { ...DEFAULT_TIMER, duration: 3600 },
    success: {
      rewards: [
        { type: 'entity_xp', min: 80, max: 160, odds: 100 },
        { type: 'keeper_xp', min: 40, max: 80, odds: 100 },
        { type: 'currency', key: 'soft_arcanium', min: 40, max: 100, odds: 100 },
        { type: 'item', key: 'mat_shadow_silk', min: 1, max: 2, odds: 20 },
        { type: 'item', key: 'mat_crystal_bloom', min: 1, max: 1, odds: 10 },
        { type: 'flag', operation: 'set', key: 'completed_tower_climb', value: true, odds: 100 },
        { type: 'text', message: 'Mission accomplished!', odds: 70 },
        { type: 'text', message: 'Flawless victory!', odds: 30 },
      ],
    },
    failure: {
      rewards: [
        { type: 'entity_xp', min: 20, max: 40, odds: 100 },
        { type: 'keeper_xp', min: 10, max: 20, odds: 100 },
        { type: 'text', message: 'Better luck next time...', odds: 60 },
        { type: 'text', message: 'That was embarrassing.', odds: 40 },
      ],
    },
    requirements: [{ type: 'team_size', value: 3, operator: 'gte' }, { type: 'team_size', value: 4, operator: 'lte' }, { type: 'keeper_level', value: 5 }],
  },
];
