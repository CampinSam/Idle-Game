import {
  normalizeOutcomeSpec,
  normalizeOutcomeFieldsForModel,
  OUTCOME_SPEC_FIELDS_BY_MODEL,
  pickSpecAmount,
} from './outcome-spec.util';

describe('normalizeOutcomeSpec', () => {
  it('converts a top-level array of legacy entries to min/max', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'currency', key: 'gold', amount: 25, odds: 100 },
      { type: 'item', key: 'wood', amount: 3 },
    ]);
    expect(changed).toBe(2);
    expect(value).toEqual([
      { type: 'currency', key: 'gold', min: 25, max: 25, odds: 100 },
      { type: 'item', key: 'wood', min: 3, max: 3 },
    ]);
    for (const entry of value) {
      expect('amount' in entry).toBe(false);
    }
  });

  it('handles wrapped { rewards: [] } shape', () => {
    const { value, changed } = normalizeOutcomeSpec({
      text: ['ok'],
      effects: [],
      rewards: [{ type: 'keeper_xp', amount: 5 }],
    });
    expect(changed).toBe(1);
    expect(value.rewards[0]).toEqual({ type: 'keeper_xp', min: 5, max: 5 });
    expect(value.text).toEqual(['ok']);
    expect(value.effects).toEqual([]);
  });

  it('recurses into nested bundle arrays and counts every rewrite', () => {
    const { value, changed } = normalizeOutcomeSpec([
      {
        bundle: [
          { type: 'currency', key: 'gold', amount: 10 },
          {
            bundle: [{ type: 'entity_xp', key: '', amount: 50 }],
            pickMin: 1,
            pickMax: 1,
          },
        ],
      },
    ]);
    expect(changed).toBe(2);
    expect(value[0].bundle[0]).toEqual({ type: 'currency', key: 'gold', min: 10, max: 10 });
    expect(value[0].bundle[1].bundle[0]).toEqual({
      type: 'entity_xp',
      key: '',
      min: 50,
      max: 50,
    });
  });

  it('leaves canonical min/max-only entries untouched (changed=0)', () => {
    const input = [
      { type: 'currency', key: 'gold', min: 5, max: 10, odds: 100 },
      { type: 'item', key: 'wood', min: 1, max: 3 },
    ];
    const { value, changed } = normalizeOutcomeSpec(input);
    expect(changed).toBe(0);
    expect(value).toEqual(input);
  });

  it('is idempotent — second pass over normalized data is a no-op', () => {
    const input = [{ type: 'currency', key: 'gold', amount: 25 }];
    const first = normalizeOutcomeSpec(input);
    const second = normalizeOutcomeSpec(first.value);
    expect(first.changed).toBe(1);
    expect(second.changed).toBe(0);
    expect(second.value).toEqual(first.value);
  });

  it('skips bundle / bundle_ref / flag / text / emitEvent entries even if amount is present', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'flag', key: 'visited', value: '1', amount: 99 },
      { type: 'text', message: 'hi', amount: 99 },
      { type: 'emitEvent', event: 'foo', amount: 99 },
      { type: 'bundle_ref', refId: 'b1', amount: 99 },
    ]);
    expect(changed).toBe(0);
    for (const e of value) expect(e.amount).toBe(99);
  });

  it('preserves explicit min/max when both amount and min/max are present (canonical wins)', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'currency', key: 'gold', amount: 25, min: 5, max: 10 },
    ]);
    expect(changed).toBe(1);
    expect(value[0]).toEqual({ type: 'currency', key: 'gold', min: 5, max: 10 });
    expect('amount' in value[0]).toBe(false);
  });

  it('maps amount=null to min=0/max=0 (so resolver skips, matching old null→0 semantics)', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'currency', key: 'gold', amount: null },
    ]);
    expect(changed).toBe(1);
    expect(value[0]).toEqual({ type: 'currency', key: 'gold', min: 0, max: 0 });
  });

  it('maps non-finite amount (NaN, "abc", Infinity) to min=0/max=0', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'currency', key: 'a', amount: NaN },
      { type: 'currency', key: 'b', amount: 'abc' },
      { type: 'currency', key: 'c', amount: Infinity },
    ]);
    expect(changed).toBe(3);
    expect(value[0]).toEqual({ type: 'currency', key: 'a', min: 0, max: 0 });
    expect(value[1]).toEqual({ type: 'currency', key: 'b', min: 0, max: 0 });
    expect(value[2]).toEqual({ type: 'currency', key: 'c', min: 0, max: 0 });
  });

  it('coerces string-typed numeric amount ("25") to numeric min/max', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'item', key: 'wood', amount: '25' },
    ]);
    expect(changed).toBe(1);
    expect(value[0]).toEqual({ type: 'item', key: 'wood', min: 25, max: 25 });
  });

  it('handles null / undefined / primitive value gracefully', () => {
    expect(normalizeOutcomeSpec(null)).toEqual({ value: null, changed: 0 });
    expect(normalizeOutcomeSpec(undefined)).toEqual({ value: undefined, changed: 0 });
    expect(normalizeOutcomeSpec('not-an-object')).toEqual({ value: 'not-an-object', changed: 0 });
  });
});

describe('normalizeOutcomeFieldsForModel', () => {
  it('normalizes every outcomeSpec field for missionDef in-place', () => {
    const data: any = {
      id: 'm1',
      success: { rewards: [{ type: 'currency', key: 'gold', amount: 5 }] },
      failure: [{ type: 'item', key: 'wood', amount: 1 }],
      unrelated: 'untouched',
    };
    const changed = normalizeOutcomeFieldsForModel('missionDef', data);
    expect(changed).toBe(2);
    expect(data.success.rewards[0]).toEqual({ type: 'currency', key: 'gold', min: 5, max: 5 });
    expect(data.failure[0]).toEqual({ type: 'item', key: 'wood', min: 1, max: 1 });
    expect(data.unrelated).toBe('untouched');
  });

  it('returns 0 and skips for unmapped models (e.g. checkInDef has no outcomeSpec)', () => {
    const data: any = { id: 'c1', rewards: [{ day: 1, giftDefId: 'g1' }] };
    expect(normalizeOutcomeFieldsForModel('checkInDef', data)).toBe(0);
    expect(data.rewards).toEqual([{ day: 1, giftDefId: 'g1' }]);
  });

  it('covers every model with the expected outcomeSpec fields', () => {
    expect(OUTCOME_SPEC_FIELDS_BY_MODEL).toEqual({
      missionDef: ['success', 'failure'],
      recipeDef: ['rewards'],
      giftDef: ['rewardSpec'],
      lootboxDef: ['outcomes'],
      bundleDef: ['bundle'],
      questDef: ['rewardSpec'],
    });
  });
});

describe('pickSpecAmount', () => {
  const fixedRng = (n: number) => ({ nextInt: (_lo: number, _hi: number) => n });

  it('returns the legacy `amount` field when present and positive', () => {
    expect(pickSpecAmount({ amount: 7 })).toBe(7);
    expect(pickSpecAmount({ amount: '12' })).toBe(12);
  });

  it('falls back to legacy `qty` field for items', () => {
    expect(pickSpecAmount({ qty: 3 })).toBe(3);
  });

  it('rolls min..max via rng when both are present (canonical shape)', () => {
    expect(pickSpecAmount({ min: 5, max: 10 }, fixedRng(8))).toBe(8);
  });

  it('returns min when min === max (no roll needed)', () => {
    expect(pickSpecAmount({ min: 4, max: 4 })).toBe(4);
  });

  it('uses Math.random() when no rng is supplied and rolls within range', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(pickSpecAmount({ min: 5, max: 10 })).toBe(5);
    } finally {
      (Math.random as jest.Mock).mockRestore();
    }
  });

  it('treats only-max as a fixed value and only-min likewise (one-sided range)', () => {
    expect(pickSpecAmount({ max: 9 })).toBe(9);
    expect(pickSpecAmount({ min: 9 })).toBe(9);
  });

  it('returns 0 for null / undefined / non-object specs', () => {
    expect(pickSpecAmount(null)).toBe(0);
    expect(pickSpecAmount(undefined)).toBe(0);
    expect(pickSpecAmount({} as any)).toBe(0);
  });

  it('returns 0 for non-finite or non-positive amounts (skip-equivalent)', () => {
    expect(pickSpecAmount({ amount: 0 })).toBe(0);
    expect(pickSpecAmount({ amount: -3 })).toBe(0);
    expect(pickSpecAmount({ amount: NaN })).toBe(0);
    expect(pickSpecAmount({ amount: 'abc' })).toBe(0);
    expect(pickSpecAmount({ amount: null })).toBe(0);
    expect(pickSpecAmount({ min: 0, max: 0 })).toBe(0);
    expect(pickSpecAmount({ min: -5, max: -1 })).toBe(0);
  });

  it('prefers legacy `amount` over min/max when both are present (backfill safety)', () => {
    // Mixed-shape entries should still grant the legacy intent until backfilled.
    expect(pickSpecAmount({ amount: 99, min: 1, max: 1 })).toBe(99);
  });

  it('clamps a negative `min` upward when paired with a positive `max`', () => {
    expect(pickSpecAmount({ min: -5, max: 10 }, fixedRng(0))).toBe(0);
  });
});
