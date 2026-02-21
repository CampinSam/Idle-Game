import { calculateMP, calculateTeamMP, EntityForMP } from '../src/mission-power';
import { EntityStats, EntityTraits } from '@derp/shared';

const makeStats = (overrides: Partial<EntityStats> = {}): EntityStats => ({
  ATK: 10,
  DEF: 10,
  SPD: 10,
  FOC: 10,
  LCK: 10,
  VIT: 10,
  ...overrides,
});

const makeTraits = (archetype: string = 'Dave'): EntityTraits => ({
  head: archetype as any,
  ears: archetype as any,
  beak: archetype as any,
  eyes: archetype as any,
  body: archetype as any,
  back: archetype as any,
  tail: archetype as any,
});

describe('MissionPower', () => {
  it('calculates base MP correctly for uniform stats', () => {
    const stats = makeStats();
    const mp = calculateMP(stats);
    // 10*0.40 + 10*0.30 + 10*0.20 + 10*0.10 + 10*0.05 + 10*0.05 = 11
    expect(mp).toBeCloseTo(11, 5);
  });

  it('weights ATK highest', () => {
    const atkHeavy = calculateMP(makeStats({ ATK: 50, DEF: 10, SPD: 10, FOC: 10, LCK: 10, VIT: 10 }));
    const defHeavy = calculateMP(makeStats({ ATK: 10, DEF: 50, SPD: 10, FOC: 10, LCK: 10, VIT: 10 }));
    expect(atkHeavy).toBeGreaterThan(defHeavy);
  });

  it('calculates team MP with synergy bonus', () => {
    const entities: EntityForMP[] = [
      { stats: makeStats(), traits: makeTraits('Dave') },
      { stats: makeStats(), traits: makeTraits('Dave') },
    ];
    const teamMP = calculateTeamMP(entities);
    // Two identical-archetype entities should get synergy bonus
    expect(teamMP).toBeGreaterThan(22); // > 2 * 11 base
  });

  it('single entity team has no synergy', () => {
    const entities: EntityForMP[] = [
      { stats: makeStats(), traits: makeTraits('Dave') },
    ];
    const teamMP = calculateTeamMP(entities);
    expect(teamMP).toBeCloseTo(11, 5);
  });
});
