import { calculateMP, calculateTeamMP, calculateInjuryChance, calculateInjuryRecoveryTicks, EntityForMP } from '../src/mission-power';
import { EntityStats } from '@derp/shared';

const makeStats = (overrides: Partial<EntityStats> = {}): EntityStats => ({
  ATK: 10,
  DEF: 10,
  SPD: 10,
  FOC: 10,
  LCK: 10,
  VIT: 10,
  ...overrides,
});

const makeTraits = (archetype: string = 'Dave'): Record<string, string> => ({
  head: archetype,
  ears: archetype,
  beak: archetype,
  eyes: archetype,
  body: archetype,
  back: archetype,
  tail: archetype,
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

  it('calculates team MP as a plain sum of individual MPs (synergy bonuses are applied by SynergyResolverService)', () => {
    const entities: EntityForMP[] = [
      { stats: makeStats(), traits: makeTraits('Dave') },
      { stats: makeStats(), traits: makeTraits('Dave') },
    ];
    const teamMP = calculateTeamMP(entities);
    expect(teamMP).toBeCloseTo(22, 5);
  });

  it('single entity team MP equals individual MP', () => {
    const entities: EntityForMP[] = [
      { stats: makeStats(), traits: makeTraits('Dave') },
    ];
    const teamMP = calculateTeamMP(entities);
    expect(teamMP).toBeCloseTo(11, 5);
  });

  it('empty team has MP of 0', () => {
    expect(calculateTeamMP([])).toBe(0);
  });
});

describe('calculateInjuryChance', () => {
  it('returns 0 when injuryRate is 0', () => {
    expect(calculateInjuryChance(100, 200, 0)).toBe(0);
  });

  it('returns 0 when difficulty and teamMP are both 0', () => {
    expect(calculateInjuryChance(0, 0, 1.0)).toBe(0);
  });

  it('scales with difficulty relative to team MP', () => {
    const lowDifficulty = calculateInjuryChance(10, 200, 1.0);
    const highDifficulty = calculateInjuryChance(200, 10, 1.0);
    expect(highDifficulty).toBeGreaterThan(lowDifficulty);
  });

  it('caps at injuryRate when difficulty >> teamMP', () => {
    const chance = calculateInjuryChance(100000, 1, 0.5);
    expect(chance).toBeCloseTo(0.5, 2);
  });

  it('equals exactly D/(TMP+D)*IR', () => {
    const D = 100, TMP = 200, IR = 0.8;
    const expected = (D / (TMP + D)) * IR;
    expect(calculateInjuryChance(D, TMP, IR)).toBeCloseTo(expected, 10);
  });
});

describe('calculateInjuryRecoveryTicks', () => {
  it('returns base ticks when VIT is 0', () => {
    expect(calculateInjuryRecoveryTicks(100, 0)).toBe(100);
  });

  it('reduces recovery ticks as VIT increases', () => {
    const lowVit = calculateInjuryRecoveryTicks(100, 10);
    const highVit = calculateInjuryRecoveryTicks(100, 100);
    expect(lowVit).toBeGreaterThan(highVit);
  });

  it('approaches 0 as VIT approaches infinity', () => {
    const highVit = calculateInjuryRecoveryTicks(100, 100000);
    expect(highVit).toBeLessThan(5);
  });

  it('rounds to nearest integer', () => {
    const result = calculateInjuryRecoveryTicks(100, 50);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('equals round(base*(1-VIT/(VIT+100)))', () => {
    const base = 200, vit = 75;
    const expected = Math.round(base * (1 - vit / (vit + 100)));
    expect(calculateInjuryRecoveryTicks(base, vit)).toBe(expected);
  });
});
