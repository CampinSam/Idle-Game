import { CraftingRecipe } from '../types/crafting';
import { DEFAULT_TIMER } from '../types/timer';

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'health_potion',
    name: 'Sketchy Health Potion',
    description: 'Heals your entity. Side effects may include temporary feather loss.',
    cost: { soft_arcanium: 20 },
    timer: { ...DEFAULT_TIMER, duration: 600, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 15 }] },
    requiredKeeperLevel: 1,
  },
  {
    id: 'speed_potion',
    name: 'Turbo Juice',
    description: 'Makes entities go ZOOM. They may forget how to stop.',
    cost: { soft_arcanium: 30 },
    timer: { ...DEFAULT_TIMER, duration: 900, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 25 }] },
    requiredKeeperLevel: 5,
  },
  {
    id: 'luck_potion',
    name: 'Liquid Four-Leaf Clover',
    description: 'Statistically questionable, but entities love the taste.',
    cost: { soft_arcanium: 40 },
    timer: { ...DEFAULT_TIMER, duration: 1200, skipable: true, skip_cost: [{ type: 'currency', id: 'soft_arcanium', amount: 35 }], skip_type: 'scaling' },
    requiredKeeperLevel: 10,
  },
  {
    id: 'power_potion',
    name: 'Buff Bird Brew',
    description: 'Guaranteed to make your entity feel swole. Temporary gains only.',
    cost: { soft_arcanium: 50 },
    timer: { ...DEFAULT_TIMER, duration: 1500 },
    requiredKeeperLevel: 15,
  },
];
