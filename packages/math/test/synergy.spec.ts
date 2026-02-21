import { calculateSynergyScore, calculateSynergyBonus } from '../src/synergy';
import { EntityTraits } from '@derp/shared';

const makeTraits = (archetype: string): EntityTraits => ({
  head: archetype as any,
  ears: archetype as any,
  beak: archetype as any,
  eyes: archetype as any,
  body: archetype as any,
  back: archetype as any,
  tail: archetype as any,
});

describe('Synergy', () => {
  it('returns 0 for single entity', () => {
    expect(calculateSynergyScore([makeTraits('Dave')])).toBe(0);
  });

  it('scores matching archetypes across entities', () => {
    const team = [makeTraits('Dave'), makeTraits('Dave')];
    const score = calculateSynergyScore(team);
    // 7 slots, each has 2 matching = 7 points
    expect(score).toBe(7);
  });

  it('scores higher for 3 matching entities', () => {
    const team = [makeTraits('Ninja'), makeTraits('Ninja'), makeTraits('Ninja')];
    const score = calculateSynergyScore(team);
    // 7 slots * (3-1) = 14
    expect(score).toBe(14);
  });

  it('gives no bonus for mixed traits below threshold', () => {
    const team = [makeTraits('Dave'), makeTraits('Ninja')];
    expect(calculateSynergyScore(team)).toBe(0);
    expect(calculateSynergyBonus(team)).toBe(0);
  });

  it('caps synergy bonus at 30%', () => {
    const team = Array(10).fill(null).map(() => makeTraits('Viking'));
    const bonus = calculateSynergyBonus(team);
    expect(bonus).toBeLessThanOrEqual(0.30);
  });
});
