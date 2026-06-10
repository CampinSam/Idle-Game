import { applyModifier, applyStatModifiers, emptyResolvedModifier, ResolvedModifier } from '@derp/shared';

// ─────────────────────────────────────────────────────────────────────────────
// applyModifier
// ─────────────────────────────────────────────────────────────────────────────

describe('applyModifier', () => {
  it('returns base value unchanged for the zero modifier', () => {
    const mod = emptyResolvedModifier();
    expect(applyModifier(100, mod)).toBe(100);
    expect(applyModifier(0, mod)).toBe(0);
  });

  it('adds flatAdd to base before applying percent and multiplier', () => {
    const mod = { ...emptyResolvedModifier(), flatAdd: 20 };
    expect(applyModifier(80, mod)).toBe(100); // (80+20) * 1 * 1 = 100
  });

  it('applies percentAdd as a percentage increase after flatAdd', () => {
    const mod = { ...emptyResolvedModifier(), percentAdd: 50 }; // +50%
    expect(applyModifier(100, mod)).toBeCloseTo(150); // 100 * 1.5
  });

  it('applies multiplier after flatAdd and percentAdd', () => {
    const mod = { ...emptyResolvedModifier(), multiplier: 2 };
    expect(applyModifier(100, mod)).toBeCloseTo(200);
  });

  it('combines all three in the correct order: (base + flat) * (1 + pct/100) * mult', () => {
    const mod: ResolvedModifier = {
      ...emptyResolvedModifier(),
      flatAdd: 10,    // base=100 → 110
      percentAdd: 10, // ×1.10 → 121
      multiplier: 2,  // ×2 → 242
    };
    expect(applyModifier(100, mod)).toBeCloseTo(242);
  });

  it('handles negative flatAdd', () => {
    const mod = { ...emptyResolvedModifier(), flatAdd: -30 };
    expect(applyModifier(100, mod)).toBe(70);
  });

  it('handles zero percentAdd correctly (no change from percent)', () => {
    const mod = { ...emptyResolvedModifier(), flatAdd: 5 };
    expect(applyModifier(10, mod)).toBeCloseTo(15);
  });

  it('handles fractional multiplier (dampening)', () => {
    const mod = { ...emptyResolvedModifier(), multiplier: 0.5 };
    expect(applyModifier(100, mod)).toBeCloseTo(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyStatModifiers
// ─────────────────────────────────────────────────────────────────────────────

describe('applyStatModifiers', () => {
  const BASE = { ATK: 10, DEF: 20, SPD: 15, FOC: 8, LCK: 12, VIT: 18 };

  it('returns the same stat values for the zero modifier', () => {
    const mod = emptyResolvedModifier();
    expect(applyStatModifiers(BASE, mod)).toEqual(BASE);
  });

  it('does not mutate the original stats object', () => {
    const original = { ...BASE };
    const mod = { ...emptyResolvedModifier(), statFlatAdds: { ATK: 5 } };
    applyStatModifiers(original, mod);
    expect(original.ATK).toBe(10);
  });

  it('adds statFlatAdds per key', () => {
    const mod = { ...emptyResolvedModifier(), statFlatAdds: { ATK: 5, DEF: 10 } };
    const result = applyStatModifiers(BASE, mod);
    expect(result.ATK).toBe(15);
    expect(result.DEF).toBe(30);
    expect(result.SPD).toBe(15); // unchanged
  });

  it('applies statPercentAdds as a percentage increase per key', () => {
    const mod = { ...emptyResolvedModifier(), statPercentAdds: { ATK: 100 } }; // +100% = ×2
    const result = applyStatModifiers(BASE, mod);
    expect(result.ATK).toBe(20); // 10 * 2 = 20
    expect(result.DEF).toBe(20); // unchanged
  });

  it('applies statMultipliers per key', () => {
    const mod = { ...emptyResolvedModifier(), statMultipliers: { VIT: 1.5 } };
    const result = applyStatModifiers(BASE, mod);
    expect(result.VIT).toBe(Math.round(18 * 1.5)); // 27
  });

  it('rounds the final per-stat value to an integer', () => {
    const mod = { ...emptyResolvedModifier(), statPercentAdds: { ATK: 50 } }; // 10 * 1.5 = 15.0 — exact
    const result = applyStatModifiers({ ATK: 7 }, mod);
    expect(Number.isInteger(result.ATK)).toBe(true);
    expect(result.ATK).toBe(Math.round(7 * 1.5)); // 11
  });

  it('applies the order: flat → percent → multiplier per stat', () => {
    const mod: ResolvedModifier = {
      ...emptyResolvedModifier(),
      statFlatAdds: { ATK: 10 },     // 10 + 10 = 20
      statPercentAdds: { ATK: 50 },  // 20 * 1.5 = 30
      statMultipliers: { ATK: 2 },   // 30 * 2 = 60
    };
    const result = applyStatModifiers({ ATK: 10 }, mod);
    expect(result.ATK).toBe(60);
  });

  it('ignores non-stat keys (e.g. scaling, compositRarity)', () => {
    const stats = { ...BASE, scaling: { ATK: 1 }, compositRarity: 1.2 };
    const mod = emptyResolvedModifier();
    const result = applyStatModifiers(stats as any, mod);
    expect(result.scaling).toEqual({ ATK: 1 });
    expect(result.compositRarity).toBeCloseTo(1.2);
  });

  it('skips keys absent from the stats object', () => {
    const mod = { ...emptyResolvedModifier(), statFlatAdds: { LCK: 100 } };
    const result = applyStatModifiers({ ATK: 10 }, mod);
    expect(result.LCK).toBeUndefined();
  });
});
