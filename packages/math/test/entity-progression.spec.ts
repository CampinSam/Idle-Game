import {
  STAT_KEYS,
  computeScaling,
  applyWeightedLevelUp,
  getPowerScore,
  POWER_SCORE_WEIGHTS,
} from '../src/entity-progression';

describe('STAT_KEYS', () => {
  it('contains the six combat stats in canonical order', () => {
    expect([...STAT_KEYS]).toEqual(['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT']);
  });
});

describe('computeScaling', () => {
  it('returns 1.0 for every stat when there are no contributions', () => {
    const scaling = computeScaling([]);
    for (const k of STAT_KEYS) expect(scaling[k]).toBeCloseTo(1.0, 10);
  });

  it('returns the geometric mean of stat scalings', () => {
    const scaling = computeScaling([
      { statScaling: { ATK: 2, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 }, rarityMultiplier: 1 },
      { statScaling: { ATK: 8, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 }, rarityMultiplier: 1 },
    ]);
    // geometric mean of (2, 8) = 4
    expect(scaling.ATK).toBeCloseTo(4, 5);
    for (const k of ['DEF', 'SPD', 'FOC', 'LCK', 'VIT']) {
      expect(scaling[k]).toBeCloseTo(1, 5);
    }
  });

  it('multiplies in the geometric mean of rarity multipliers', () => {
    const scaling = computeScaling([
      { statScaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 }, rarityMultiplier: 1 },
      { statScaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 }, rarityMultiplier: 4 },
    ]);
    // rarity geomean of (1, 4) = 2
    for (const k of STAT_KEYS) expect(scaling[k]).toBeCloseTo(2, 5);
  });

  it('treats non-positive or non-numeric scaling values as 1', () => {
    const scaling = computeScaling([
      { statScaling: { ATK: 0, DEF: -1, SPD: NaN as any }, rarityMultiplier: 1 },
    ]);
    expect(scaling.ATK).toBeCloseTo(1, 5);
    expect(scaling.DEF).toBeCloseTo(1, 5);
    expect(scaling.SPD).toBeCloseTo(1, 5);
  });
});

describe('applyWeightedLevelUp', () => {
  it('grants +1 to every stat plus exactly 14 weighted points', () => {
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    const { stats, gains } = applyWeightedLevelUp(start);
    const totalGain = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
    expect(totalGain).toBe(6 + 14);
    const totalStats = STAT_KEYS.reduce((s, k) => s + (stats[k] as number), 0);
    expect(totalStats).toBe(6 + 14);
    for (const k of STAT_KEYS) {
      expect(gains[k]).toBeGreaterThanOrEqual(1);
    }
  });

  it('biases gains toward higher-weighted stats over many trials', () => {
    const trials = 500;
    let atkGains = 0;
    let vitGains = 0;
    const scaling = { ATK: 5, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 };
    for (let i = 0; i < trials; i++) {
      const { gains } = applyWeightedLevelUp({ ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling });
      atkGains += gains.ATK;
      vitGains += gains.VIT;
    }
    expect(atkGains).toBeGreaterThan(vitGains * 1.5);
  });

  it('preserves the scaling object on the returned stats', () => {
    const scaling = { ATK: 2, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 };
    const { stats } = applyWeightedLevelUp({ ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling });
    expect(stats.scaling).toBe(scaling);
  });
});

describe('getPowerScore', () => {
  it('uses the documented stat weights', () => {
    expect(POWER_SCORE_WEIGHTS).toEqual({
      ATK: 0.40, DEF: 0.30, SPD: 0.20, FOC: 0.10, LCK: 0.05, VIT: 0.05,
    });
  });

  it('computes the weighted sum', () => {
    const score = getPowerScore({ ATK: 100, DEF: 50, SPD: 50, FOC: 50, LCK: 50, VIT: 50 });
    // 100*0.4 + 50*0.3 + 50*0.2 + 50*0.1 + 50*0.05 + 50*0.05 = 40 + 15 + 10 + 5 + 2.5 + 2.5 = 75
    expect(score).toBeCloseTo(75, 5);
  });

  it('treats missing or non-numeric stats as 0', () => {
    expect(getPowerScore({})).toBe(0);
    expect(getPowerScore({ ATK: 'oops' as any, DEF: 10 })).toBeCloseTo(3, 5);
  });
});
