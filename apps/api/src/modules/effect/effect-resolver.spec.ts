import { EffectCategory, EffectValueMode } from '@derp/shared';
import { resolveEffects, matchesSelection, ActiveEffectRow } from './effect-resolver';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ActiveEffectRow> = {}): ActiveEffectRow {
  return {
    effectDefId: 'def-1',
    category: EffectCategory.STAT_BOOST,
    valueMode: EffectValueMode.FLAT_ADD,
    value: 10,
    currentStacks: 1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — value modes
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — FLAT_ADD', () => {
  it('accumulates value into flatAdd with 1 stack', () => {
    const mod = resolveEffects([makeRow({ value: 15 })], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(15);
    expect(mod.percentAdd).toBe(0);
    expect(mod.multiplier).toBe(1);
  });

  it('multiplies value by currentStacks', () => {
    const mod = resolveEffects([makeRow({ value: 10, currentStacks: 3 })], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(30);
  });

  it('sums multiple FLAT_ADD effects', () => {
    const rows = [
      makeRow({ value: 5 }),
      makeRow({ effectDefId: 'def-2', value: 8 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(13);
  });

  it('populates statFlatAdds when stats map is present', () => {
    const row = makeRow({ value: 0, stats: { ATK: 4, DEF: 2 } });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.statFlatAdds.ATK).toBe(4);
    expect(mod.statFlatAdds.DEF).toBe(2);
    expect(mod.statFlatAdds.SPD).toBeUndefined();
  });

  it('scales statFlatAdds by stacks', () => {
    const row = makeRow({ value: 0, stats: { ATK: 5 }, currentStacks: 2 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.statFlatAdds.ATK).toBe(10);
  });
});

describe('resolveEffects — PERCENT_ADD', () => {
  it('accumulates value into percentAdd', () => {
    const row = makeRow({ valueMode: EffectValueMode.PERCENT_ADD, value: 20 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.percentAdd).toBe(20);
    expect(mod.flatAdd).toBe(0);
  });

  it('scales percentAdd by stacks', () => {
    const row = makeRow({ valueMode: EffectValueMode.PERCENT_ADD, value: 10, currentStacks: 3 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.percentAdd).toBe(30);
  });

  it('accumulates multiple PERCENT_ADD rows additively', () => {
    const rows = [
      makeRow({ valueMode: EffectValueMode.PERCENT_ADD, value: 20 }),
      makeRow({ effectDefId: 'def-2', valueMode: EffectValueMode.PERCENT_ADD, value: 15 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.percentAdd).toBe(35);
  });

  it('populates statPercentAdds when stats map is present', () => {
    const row = makeRow({ valueMode: EffectValueMode.PERCENT_ADD, value: 0, stats: { SPD: 10, LCK: 5 } });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.statPercentAdds.SPD).toBe(10);
    expect(mod.statPercentAdds.LCK).toBe(5);
  });
});

describe('resolveEffects — MULTIPLIER', () => {
  it('compounds value into multiplier', () => {
    const row = makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 1.5 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.multiplier).toBeCloseTo(1.5);
  });

  it('applies Math.pow(value, stacks) for stacked multipliers', () => {
    const row = makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 1.2, currentStacks: 3 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.multiplier).toBeCloseTo(Math.pow(1.2, 3));
  });

  it('compounds multiple MULTIPLIER rows (product)', () => {
    const rows = [
      makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 1.5 }),
      makeRow({ effectDefId: 'def-2', valueMode: EffectValueMode.MULTIPLIER, value: 2.0 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.multiplier).toBeCloseTo(3.0);
  });

  it('treats value 0 as 1 for multiplier (no zeroing)', () => {
    const row = makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 0 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.multiplier).toBe(1);
  });

  it('populates statMultipliers when stats map is present', () => {
    const row = makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 1, stats: { ATK: 1.25 } });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.statMultipliers.ATK).toBeCloseTo(1.25);
  });

  it('stacks statMultipliers via Math.pow(s, stacks)', () => {
    const row = makeRow({ valueMode: EffectValueMode.MULTIPLIER, value: 1, stats: { DEF: 1.1 }, currentStacks: 2 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.statMultipliers.DEF).toBeCloseTo(Math.pow(1.1, 2));
  });
});

describe('resolveEffects — BPS', () => {
  it('converts basis points to percent (value / 100) added to percentAdd', () => {
    const row = makeRow({ valueMode: EffectValueMode.BPS, value: 500 }); // 500 bps = 5%
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.percentAdd).toBeCloseTo(5);
  });

  it('scales BPS by stacks before converting', () => {
    const row = makeRow({ valueMode: EffectValueMode.BPS, value: 200, currentStacks: 3 }); // 200*3=600 bps = 6%
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.percentAdd).toBeCloseTo(6);
  });
});

describe('resolveEffects — FLAT_SET', () => {
  it('overrides flatAdd to value * stacks', () => {
    const row = makeRow({ valueMode: EffectValueMode.FLAT_SET, value: 42 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(42);
  });

  it('scales flatAdd by stacks (value * currentStacks)', () => {
    const row = makeRow({ valueMode: EffectValueMode.FLAT_SET, value: 42, currentStacks: 3 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(126); // 42 * 3
  });

  it('last FLAT_SET wins when multiple rows present', () => {
    const rows = [
      makeRow({ valueMode: EffectValueMode.FLAT_SET, value: 10 }),
      makeRow({ effectDefId: 'def-2', valueMode: EffectValueMode.FLAT_SET, value: 99 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(99);
  });
});

describe('resolveEffects — FLAT_GRANT', () => {
  it('pushes a grant entry with correct type, id, and amount', () => {
    const row = makeRow({ effectDefId: 'grant-def', valueMode: EffectValueMode.FLAT_GRANT, value: 5 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.grants).toHaveLength(1);
    expect(mod.grants[0]).toEqual({ type: EffectCategory.STAT_BOOST, id: 'grant-def', amount: 5 });
  });

  it('scales grant amount by stacks', () => {
    const row = makeRow({ effectDefId: 'grant-def', valueMode: EffectValueMode.FLAT_GRANT, value: 3, currentStacks: 4 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.grants[0].amount).toBe(12);
  });
});

describe('resolveEffects — RANDOM_RANGE', () => {
  it('adds value to flatAdd (treated same as FLAT_ADD post-resolution)', () => {
    const row = makeRow({ valueMode: EffectValueMode.RANDOM_RANGE, value: 7 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(7);
  });

  it('scales by stacks', () => {
    const row = makeRow({ valueMode: EffectValueMode.RANDOM_RANGE, value: 4, currentStacks: 3 });
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — category isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — category filtering', () => {
  it('ignores effects belonging to a different category', () => {
    const rows = [
      makeRow({ category: EffectCategory.XP_MULTIPLIER, value: 50 }),
      makeRow({ effectDefId: 'def-2', category: EffectCategory.STAT_BOOST, value: 10 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(10);
  });

  it('returns empty modifier when no rows match the category', () => {
    const rows = [makeRow({ category: EffectCategory.XP_MULTIPLIER, value: 50 })];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(0);
    expect(mod.percentAdd).toBe(0);
    expect(mod.multiplier).toBe(1);
    expect(mod.grants).toHaveLength(0);
    expect(mod.traits).toHaveLength(0);
  });

  it('returns empty modifier for empty input', () => {
    const mod = resolveEffects([], EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(0);
    expect(mod.multiplier).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — traits
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — trait collection', () => {
  it('collects trait strings from matching effects', () => {
    const rows = [
      makeRow({ trait: 'fire' }),
      makeRow({ effectDefId: 'def-2', trait: 'ice' }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.traits).toEqual(['fire', 'ice']);
  });

  it('ignores null/undefined trait fields', () => {
    const rows = [makeRow({ trait: null }), makeRow({ effectDefId: 'def-2', trait: undefined })];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.traits).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — cap enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — cap enforcement', () => {
  it('caps flatAdd at the specified cap', () => {
    const rows = [makeRow({ value: 100 })];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST, 25);
    expect(mod.flatAdd).toBe(25);
  });

  it('caps percentAdd at the specified cap', () => {
    const rows = [makeRow({ valueMode: EffectValueMode.PERCENT_ADD, value: 80 })];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST, 50);
    expect(mod.percentAdd).toBe(50);
  });

  it('does not cap when value is below the cap', () => {
    const rows = [makeRow({ value: 10 })];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST, 100);
    expect(mod.flatAdd).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — sources tracking
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — sources tracking', () => {
  it('pushes source entries for rows that have an id', () => {
    const rows = [
      makeRow({ id: 'active-1', effectDefId: 'def-a' }),
      makeRow({ id: 'active-2', effectDefId: 'def-b' }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.sources).toHaveLength(2);
    expect(mod.sources[0]).toEqual({ effectDefId: 'def-a', activeEffectId: 'active-1' });
    expect(mod.sources[1]).toEqual({ effectDefId: 'def-b', activeEffectId: 'active-2' });
  });

  it('skips sources for rows without an id', () => {
    const row = makeRow(); // no id
    const mod = resolveEffects([row], EffectCategory.STAT_BOOST);
    expect(mod.sources).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEffects — combined accumulation
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEffects — combined multi-effect accumulation', () => {
  it('accumulates FLAT_ADD + PERCENT_ADD + MULTIPLIER across three rows', () => {
    const rows = [
      makeRow({ valueMode: EffectValueMode.FLAT_ADD, value: 20 }),
      makeRow({ effectDefId: 'def-2', valueMode: EffectValueMode.PERCENT_ADD, value: 30 }),
      makeRow({ effectDefId: 'def-3', valueMode: EffectValueMode.MULTIPLIER, value: 1.5 }),
    ];
    const mod = resolveEffects(rows, EffectCategory.STAT_BOOST);
    expect(mod.flatAdd).toBe(20);
    expect(mod.percentAdd).toBe(30);
    expect(mod.multiplier).toBeCloseTo(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesSelection — null / undefined selection
// ─────────────────────────────────────────────────────────────────────────────

describe('matchesSelection — null / undefined', () => {
  it('returns true for null selection (backward compat)', () => {
    expect(matchesSelection(null, 'u1', null)).toBe(true);
  });

  it('returns true for undefined selection', () => {
    expect(matchesSelection(undefined, 'u1', null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesSelection — scope
// ─────────────────────────────────────────────────────────────────────────────

describe('matchesSelection — scope', () => {
  it('scope global matches any targetType', () => {
    const sel = { scope: 'global' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, 'entity')).toBe(true);
    expect(matchesSelection(sel, 'u1', null, undefined, 'player')).toBe(true);
    expect(matchesSelection(sel, 'u1', null, undefined, 'location')).toBe(true);
  });

  it('scope entity passes for entity targetType', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, 'entity')).toBe(true);
  });

  it('scope entity fails for player targetType', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, 'player')).toBe(false);
  });

  it('scope player passes for player targetType', () => {
    const sel = { scope: 'player' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, 'player')).toBe(true);
  });

  it('scope location passes for location targetType', () => {
    const sel = { scope: 'location' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, 'location')).toBe(true);
  });

  it('scope check is skipped when targetType is not provided', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const };
    expect(matchesSelection(sel, 'u1', null, undefined, undefined)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesSelection — agg: self
// ─────────────────────────────────────────────────────────────────────────────

describe('matchesSelection — agg: self', () => {
  const sel = { scope: 'global' as const, agg: 'self' as const };

  it('matches when userId equals triggeredByUserId', () => {
    expect(matchesSelection(sel, 'u1', 'u1')).toBe(true);
  });

  it('fails when userId differs from triggeredByUserId', () => {
    expect(matchesSelection(sel, 'u1', 'u2')).toBe(false);
  });

  it('skips agg check when triggeredByUserId is null (admin-created power)', () => {
    expect(matchesSelection(sel, 'u1', null)).toBe(true);
  });

  it('skips agg check when triggeredByUserId is undefined', () => {
    expect(matchesSelection(sel, 'u1', undefined)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesSelection — filter predicates
// ─────────────────────────────────────────────────────────────────────────────

describe('matchesSelection — filter.userId', () => {
  it('matches when filter.userId equals resolution userId', () => {
    const sel = { scope: 'global' as const, agg: 'any' as const, filter: { userId: 'u1' } };
    expect(matchesSelection(sel, 'u1', null)).toBe(true);
  });

  it('fails when filter.userId differs from resolution userId', () => {
    const sel = { scope: 'global' as const, agg: 'any' as const, filter: { userId: 'u2' } };
    expect(matchesSelection(sel, 'u1', null)).toBe(false);
  });
});

describe('matchesSelection — filter.entityId', () => {
  const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { entityId: 'ent-5' } };

  it('matches when context.entityId equals filter.entityId', () => {
    expect(matchesSelection(sel, 'u1', null, { entityId: 'ent-5' })).toBe(true);
  });

  it('fails when context.entityId differs', () => {
    expect(matchesSelection(sel, 'u1', null, { entityId: 'ent-9' })).toBe(false);
  });

  it('skips check (safe default) when no context is provided', () => {
    expect(matchesSelection(sel, 'u1', null, undefined)).toBe(true);
  });
});

describe('matchesSelection — filter.locationId', () => {
  const sel = { scope: 'location' as const, agg: 'any' as const, filter: { locationId: 'loc-3' } };

  it('matches when context.locationId equals filter.locationId', () => {
    expect(matchesSelection(sel, 'u1', null, { locationId: 'loc-3' })).toBe(true);
  });

  it('fails when context.locationId differs', () => {
    expect(matchesSelection(sel, 'u1', null, { locationId: 'loc-99' })).toBe(false);
  });
});

describe('matchesSelection — filter.archetype', () => {
  const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { archetype: 'derp_bird' } };

  it('matches when context.archetype matches', () => {
    expect(matchesSelection(sel, 'u1', null, { archetype: 'derp_bird' })).toBe(true);
  });

  it('fails when context.archetype differs', () => {
    expect(matchesSelection(sel, 'u1', null, { archetype: 'dragon' })).toBe(false);
  });
});

describe('matchesSelection — filter.rarity', () => {
  it('matches rarity as a string', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { rarity: 'rare' } };
    expect(matchesSelection(sel, 'u1', null, { rarity: 'rare' })).toBe(true);
    expect(matchesSelection(sel, 'u1', null, { rarity: 'common' })).toBe(false);
  });

  it('matches rarity as an array (any match)', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { rarity: ['rare', 'epic'] } };
    expect(matchesSelection(sel, 'u1', null, { rarity: 'epic' })).toBe(true);
    expect(matchesSelection(sel, 'u1', null, { rarity: 'rare' })).toBe(true);
    expect(matchesSelection(sel, 'u1', null, { rarity: 'common' })).toBe(false);
  });

  it('skips rarity check when context.rarity is null/undefined', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { rarity: 'rare' } };
    expect(matchesSelection(sel, 'u1', null, { rarity: undefined })).toBe(true);
  });
});

describe('matchesSelection — filter.traits', () => {
  it('matches when context has all required traits', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { traits: ['fire', 'swift'] } };
    expect(matchesSelection(sel, 'u1', null, { traits: ['fire', 'swift', 'brave'] })).toBe(true);
  });

  it('fails when context is missing at least one required trait', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { traits: ['fire', 'swift'] } };
    expect(matchesSelection(sel, 'u1', null, { traits: ['fire'] })).toBe(false);
  });

  it('skips check when filter.traits is empty', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { traits: [] } };
    expect(matchesSelection(sel, 'u1', null, { traits: [] })).toBe(true);
  });

  it('skips check when context.traits is absent', () => {
    const sel = { scope: 'entity' as const, agg: 'any' as const, filter: { traits: ['fire'] } };
    expect(matchesSelection(sel, 'u1', null, {})).toBe(true);
  });
});

describe('matchesSelection — filter level range', () => {
  const makeSel = (minLevel?: number, maxLevel?: number) => ({
    scope: 'entity' as const,
    agg: 'any' as const,
    filter: { ...(minLevel !== undefined ? { minLevel } : {}), ...(maxLevel !== undefined ? { maxLevel } : {}) },
  });

  it('minLevel: passes when context.level >= minLevel', () => {
    expect(matchesSelection(makeSel(5), 'u1', null, { level: 5 })).toBe(true);
    expect(matchesSelection(makeSel(5), 'u1', null, { level: 10 })).toBe(true);
  });

  it('minLevel: fails when context.level < minLevel', () => {
    expect(matchesSelection(makeSel(5), 'u1', null, { level: 4 })).toBe(false);
  });

  it('maxLevel: passes when context.level <= maxLevel', () => {
    expect(matchesSelection(makeSel(undefined, 10), 'u1', null, { level: 10 })).toBe(true);
    expect(matchesSelection(makeSel(undefined, 10), 'u1', null, { level: 1 })).toBe(true);
  });

  it('maxLevel: fails when context.level > maxLevel', () => {
    expect(matchesSelection(makeSel(undefined, 10), 'u1', null, { level: 11 })).toBe(false);
  });

  it('passes when level is absent from context (check skipped)', () => {
    expect(matchesSelection(makeSel(5, 10), 'u1', null, {})).toBe(true);
  });

  it('combined minLevel + maxLevel passes for in-range level', () => {
    expect(matchesSelection(makeSel(5, 10), 'u1', null, { level: 7 })).toBe(true);
  });

  it('combined minLevel + maxLevel fails for out-of-range level', () => {
    expect(matchesSelection(makeSel(5, 10), 'u1', null, { level: 11 })).toBe(false);
    expect(matchesSelection(makeSel(5, 10), 'u1', null, { level: 4 })).toBe(false);
  });
});
