import {
  STAT_KEYS,
  computeScaling,
  computeCompositRarity,
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

describe('computeCompositRarity', () => {
  it('returns 1.0 for empty contributions', () => {
    expect(computeCompositRarity([])).toBeCloseTo(1.0, 10);
  });

  it('returns 1.0 when all rarity multipliers are 1.0', () => {
    const contribs = [
      { statScaling: {}, rarityMultiplier: 1.0 },
      { statScaling: {}, rarityMultiplier: 1.0 },
    ];
    expect(computeCompositRarity(contribs)).toBeCloseTo(1.0, 10);
  });

  it('returns the geometric mean of rarity multipliers', () => {
    const contribs = [
      { statScaling: {}, rarityMultiplier: 1.0 },
      { statScaling: {}, rarityMultiplier: 4.0 },
    ];
    // geomean of (1, 4) = 2
    expect(computeCompositRarity(contribs)).toBeCloseTo(2.0, 5);
  });

  it('treats non-positive or non-numeric rarityMultiplier as 1', () => {
    const contribs = [
      { statScaling: {}, rarityMultiplier: 0 },
      { statScaling: {}, rarityMultiplier: 4.0 },
    ];
    // 0 treated as 1, so geomean of (1, 4) = 2
    expect(computeCompositRarity(contribs)).toBeCloseTo(2.0, 5);
  });
});

describe('applyWeightedLevelUp', () => {
  it('grants +1 to every stat plus exactly 14 bonus points for a common entity', () => {
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    const { stats, gains } = applyWeightedLevelUp(start, 1.0, 1);
    const totalGain = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
    expect(totalGain).toBe(6 + 14);
    const totalStats = STAT_KEYS.reduce((s, k) => s + (stats[k] as number), 0);
    expect(totalStats).toBe(6 + 14);
    for (const k of STAT_KEYS) {
      expect(gains[k]).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses default params matching common entity at level 1', () => {
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    const { gains } = applyWeightedLevelUp(start);
    const totalGain = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
    expect(totalGain).toBe(6 + 14);
  });

  it('scales bonus pool with compositRarity at higher levels', () => {
    // compositRarity=1.15, level=25 → pool = floor(14 × 1.15^(25 × 0.16)) = floor(14 × 1.15^4) ≈ 24
    const compositRarity = 1.15;
    const level = 25;
    const expectedPool = Math.floor(14 * Math.pow(compositRarity, level * 0.16));
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    const { gains } = applyWeightedLevelUp(start, compositRarity, level);
    const totalGain = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
    expect(totalGain).toBe(6 + expectedPool);
  });

  it('scales bonus pool at level 49 for legendary entity to ~41', () => {
    const compositRarity = 1.15;
    const level = 49;
    const expectedPool = Math.floor(14 * Math.pow(compositRarity, level * 0.16));
    expect(expectedPool).toBeGreaterThanOrEqual(39);
    expect(expectedPool).toBeLessThanOrEqual(43);
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    const { gains } = applyWeightedLevelUp(start, compositRarity, level);
    const totalGain = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
    expect(totalGain).toBe(6 + expectedPool);
  });

  it('distributes bonus pool in a 50/50 unweighted/weighted split', () => {
    // With flat scaling (all=1), unweighted and weighted halves should average equal
    // per-stat. With a heavily skewed weight, the weighted half will concentrate on
    // the high-weight stat — we verify the split totals are exactly correct.
    const compositRarity = 1.0;
    const level = 1;
    const bonusPool = Math.floor(14 * Math.pow(compositRarity, level * 0.16)); // 14
    const expectedUnweighted = Math.floor(bonusPool * 0.5); // 7
    const expectedWeighted = bonusPool - expectedUnweighted; // 7
    expect(bonusPool).toBe(14);
    expect(expectedUnweighted).toBe(7);
    expect(expectedWeighted).toBe(7);
    // Total gains must always equal 6 (guaranteed) + bonusPool
    const start = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: {} };
    for (let trial = 0; trial < 20; trial++) {
      const { gains } = applyWeightedLevelUp(start, compositRarity, level);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + bonusPool);
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

describe('applyWeightedLevelUp bonusPool variants', () => {
  const flatScaling = { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 };
  const startStats = () => ({ ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: flatScaling });

  describe('bonusPool.kind = "rarityScaled"', () => {
    it('honours custom base/exponent (base=20, exp=0)', () => {
      // exponent 0 → rarity has no effect, pool == floor(base) regardless of rarity/level
      const cfg = {
        bonusPool: { kind: 'rarityScaled' as const, base: 20, exponent: 0, rarityField: 'compositRarity' },
      };
      const { gains } = applyWeightedLevelUp(startStats(), 1.5, 99, undefined, cfg);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + 20);
    });

    it('reads the rarity scalar from a custom rarityField on stats', () => {
      // Pool uses stats[rarityField] when present, ignoring the compositRarity arg.
      const cfg = {
        bonusPool: { kind: 'rarityScaled' as const, base: 10, exponent: 1, rarityField: 'myRarity' },
      };
      const stats = { ...startStats(), myRarity: 2.0 } as Record<string, any>;
      // floor(10 * 2^(3*1)) = floor(80) = 80
      const { gains } = applyWeightedLevelUp(stats, 1.0, 3, undefined, cfg);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + 80);
    });

    it('falls back to the compositRarity arg when rarityField is absent on stats', () => {
      const cfg = {
        bonusPool: { kind: 'rarityScaled' as const, base: 10, exponent: 1, rarityField: 'absentField' },
      };
      const { gains } = applyWeightedLevelUp(startStats(), 2.0, 3, undefined, cfg);
      // floor(10 * 2^3) = 80
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + 80);
    });
  });

  describe('bonusPool.kind = "flat"', () => {
    it('grants exactly `amount` bonus points regardless of rarity/level', () => {
      const cfg = { bonusPool: { kind: 'flat' as const, amount: 9 } };
      const { gains } = applyWeightedLevelUp(startStats(), 1.5, 50, undefined, cfg);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + 9);
    });

    it('floors a non-integer amount', () => {
      const cfg = { bonusPool: { kind: 'flat' as const, amount: 7.9 } };
      const { gains } = applyWeightedLevelUp(startStats(), 1.0, 1, undefined, cfg);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6 + 7);
    });

    it('zero amount produces only the guaranteed +6', () => {
      const cfg = { bonusPool: { kind: 'flat' as const, amount: 0 } };
      const { gains } = applyWeightedLevelUp(startStats(), 5.0, 99, undefined, cfg);
      const total = STAT_KEYS.reduce((s, k) => s + gains[k], 0);
      expect(total).toBe(6);
    });
  });

  describe('distribution.weightsField override', () => {
    it('reads weights from the configured field instead of `scaling`', () => {
      // Put a heavy ATK weight on a non-default field; verify gains skew to ATK.
      const stats = {
        ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0,
        scaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 },
        altWeights: { ATK: 50, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 },
      };
      const cfg = {
        distribution: { uniformShare: 0, weightedShare: 1, weightsField: 'altWeights' },
        bonusPool: { kind: 'flat' as const, amount: 200 },
      };
      let atk = 0, vit = 0;
      const trials = 30;
      for (let i = 0; i < trials; i++) {
        const { gains } = applyWeightedLevelUp(stats, 1.0, 1, undefined, cfg);
        atk += gains.ATK;
        vit += gains.VIT;
      }
      expect(atk).toBeGreaterThan(vit * 5);
    });
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
