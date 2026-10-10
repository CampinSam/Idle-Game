import {
  getProgressionRules,
  xpForNextLevel,
  MissingProgressionRulesError,
} from './entity-progression-rules.util';

describe('getProgressionRules', () => {
  it('throws if maxLevel is missing or non-positive', () => {
    expect(() => getProgressionRules({ progression: {} }, 'd')).toThrow(MissingProgressionRulesError);
    expect(() => getProgressionRules({ progression: { maxLevel: 0, xpCurve: { kind: 'geometric', base: 1, ratio: 1 } } }, 'd')).toThrow(
      MissingProgressionRulesError,
    );
  });

  it('throws if xpCurve is missing', () => {
    expect(() => getProgressionRules({ progression: { maxLevel: 10 } }, 'd')).toThrow(MissingProgressionRulesError);
  });

  it('returns the progression block when valid', () => {
    const p = { maxLevel: 50, xpCurve: { kind: 'geometric' as const, base: 100, ratio: 1.15 } };
    expect(getProgressionRules({ progression: p }, 'd')).toBe(p);
  });
});

describe('xpForNextLevel', () => {
  describe('xpCurve.kind = "geometric"', () => {
    const rules = { xpCurve: { kind: 'geometric' as const, base: 100, ratio: 1.15 } };

    it('returns base at level 1', () => {
      expect(xpForNextLevel(rules, 1)).toBe(100);
    });

    it('grows by ratio per level (floored)', () => {
      // floor(100 * 1.15^(L-1)), with float precision: 1.15 ≈ 1.14999... → 114, 132
      expect(xpForNextLevel(rules, 2)).toBe(Math.floor(100 * Math.pow(1.15, 1)));
      expect(xpForNextLevel(rules, 3)).toBe(Math.floor(100 * Math.pow(1.15, 2)));
      // Strictly increasing
      expect(xpForNextLevel(rules, 3)).toBeGreaterThan(xpForNextLevel(rules, 2));
      expect(xpForNextLevel(rules, 4)).toBeGreaterThan(xpForNextLevel(rules, 3));
    });

    it('handles ratio = 1 (constant XP per level)', () => {
      const flat = { xpCurve: { kind: 'geometric' as const, base: 50, ratio: 1 } };
      expect(xpForNextLevel(flat, 1)).toBe(50);
      expect(xpForNextLevel(flat, 25)).toBe(50);
    });
  });

  describe('xpCurve.kind = "table"', () => {
    const rules = { xpCurve: { kind: 'table' as const, perLevel: [10, 25, 50, 100] } };

    it('returns the table entry for currentLevel (1-indexed)', () => {
      expect(xpForNextLevel(rules, 1)).toBe(10);
      expect(xpForNextLevel(rules, 2)).toBe(25);
      expect(xpForNextLevel(rules, 4)).toBe(100);
    });

    it('floors fractional table values', () => {
      const fr = { xpCurve: { kind: 'table' as const, perLevel: [10.9] } };
      expect(xpForNextLevel(fr, 1)).toBe(10);
    });

    it('throws when the table is missing the requested level', () => {
      expect(() => xpForNextLevel(rules, 99)).toThrow(/missing entry for level 99/);
    });
  });

  it('throws on an unknown xpCurve kind', () => {
    expect(() => xpForNextLevel({ xpCurve: { kind: 'bogus' } as any }, 1)).toThrow(/Unknown xpCurve kind/);
  });
});
