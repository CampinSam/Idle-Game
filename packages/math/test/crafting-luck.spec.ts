import { calculateCraftingLuck } from '../src/crafting-luck';
import { EntityStats } from '@derp/shared';

describe('CraftingLuck', () => {
  it('calculates from FOC and LCK', () => {
    const stats: EntityStats = { ATK: 10, DEF: 10, SPD: 10, FOC: 20, LCK: 20, VIT: 10 };
    const cl = calculateCraftingLuck(stats);
    // 20*0.5 + 20*0.3 = 16
    expect(cl).toBeCloseTo(16, 5);
  });

  it('includes bonuses', () => {
    const stats: EntityStats = { ATK: 10, DEF: 10, SPD: 10, FOC: 20, LCK: 20, VIT: 10 };
    const cl = calculateCraftingLuck(stats, { relic: 5, worker: 3, room: 2 });
    expect(cl).toBeCloseTo(26, 5);
  });

  it('hard caps at 150', () => {
    const stats: EntityStats = { ATK: 10, DEF: 10, SPD: 10, FOC: 200, LCK: 200, VIT: 10 };
    const cl = calculateCraftingLuck(stats, { relic: 50, worker: 50, room: 50 });
    expect(cl).toBe(150);
  });
});
