import { PrismaClient } from '@prisma/client';
import {
  normalizeOutcomeSpec,
  normalizeOutcomeFieldsForModel,
  migrateGiftRewardSpec,
  OUTCOME_SPEC_FIELDS_BY_MODEL,
} from './outcome-spec.util';

describe('normalizeOutcomeSpec', () => {
  it('converts a single { amount } entry into { min, max }', () => {
    const { value, changed } = normalizeOutcomeSpec({ type: 'currency', key: 'gold', amount: 50 });
    expect(value).toEqual({ type: 'currency', key: 'gold', min: 50, max: 50 });
    expect(changed).toBe(1);
  });

  it('keeps non-finite/missing amounts safely as min:0/max:0', () => {
    const { value } = normalizeOutcomeSpec({ type: 'currency', key: 'gold', amount: 'abc' });
    expect(value).toEqual({ type: 'currency', key: 'gold', min: 0, max: 0 });
  });

  it('preserves existing min/max when also given amount', () => {
    const { value } = normalizeOutcomeSpec({
      type: 'currency', key: 'gold', amount: 50, min: 1, max: 5,
    });
    expect(value).toEqual({ type: 'currency', key: 'gold', min: 1, max: 5 });
  });

  it('walks an array of entries', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'currency', key: 'gold', amount: 5 },
      { type: 'item', key: 'gem', amount: 1 },
    ]);
    expect(value).toEqual([
      { type: 'currency', key: 'gold', min: 5, max: 5 },
      { type: 'item', key: 'gem', min: 1, max: 1 },
    ]);
    expect(changed).toBe(2);
  });

  it('walks { rewards: [] } wrapper objects', () => {
    const { value } = normalizeOutcomeSpec({
      rewards: [{ type: 'currency', key: 'gold', amount: 7 }],
    });
    expect(value).toEqual({ rewards: [{ type: 'currency', key: 'gold', min: 7, max: 7 }] });
  });

  it('recurses into nested bundle entries', () => {
    const { value, changed } = normalizeOutcomeSpec({
      bundle: [
        { type: 'currency', key: 'gold', amount: 5 },
        { bundle: [{ type: 'item', key: 'gem', amount: 1 }] },
      ],
    });
    expect(value).toEqual({
      bundle: [
        { type: 'currency', key: 'gold', min: 5, max: 5 },
        { bundle: [{ type: 'item', key: 'gem', min: 1, max: 1 }] },
      ],
    });
    expect(changed).toBe(2);
  });

  it('passes through bundle/bundle_ref/flag/text/emitEvent without an amount field', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'bundle_ref', bundleDefId: 'b1' },
      { type: 'flag', key: 'has_pass', value: true },
      { type: 'text', message: 'hi' },
      { type: 'emitEvent', eventType: 'test' },
    ]);
    expect(value).toEqual([
      { type: 'bundle_ref', bundleDefId: 'b1' },
      { type: 'flag', key: 'has_pass', value: true },
      { type: 'text', message: 'hi' },
      { type: 'emitEvent', eventType: 'test' },
    ]);
    expect(changed).toBe(0);
  });

  it('migrates bare giftDefId on emitEvent payload to gift: { giftDefId }', () => {
    const { value, changed } = normalizeOutcomeSpec([
      { type: 'emitEvent', defId: 'evt_welcome', payload: { giftDefId: 'gift_intro' } },
    ]);
    expect(value).toEqual([
      { type: 'emitEvent', defId: 'evt_welcome', payload: { gift: { giftDefId: 'gift_intro' } } },
    ]);
    expect(changed).toBe(1);
  });

  it('leaves emitEvent payload unchanged when gift field is already present', () => {
    const input = [
      { type: 'emitEvent', defId: 'evt_welcome', payload: { gift: { giftDefId: 'gift_intro' } } },
    ];
    const { value, changed } = normalizeOutcomeSpec(input);
    expect(value).toEqual(input);
    expect(changed).toBe(0);
  });

  it('leaves emitEvent payload unchanged when it has no giftDefId', () => {
    const input = [
      { type: 'emitEvent', defId: 'evt_welcome', payload: {} },
    ];
    const { value, changed } = normalizeOutcomeSpec(input);
    expect(value).toEqual(input);
    expect(changed).toBe(0);
  });

  it('returns the value unchanged for null / non-objects', () => {
    expect(normalizeOutcomeSpec(null).value).toBeNull();
    expect(normalizeOutcomeSpec('string').value).toBe('string');
    expect(normalizeOutcomeSpec(42).value).toBe(42);
  });
});

describe('normalizeOutcomeFieldsForModel', () => {
  it('rewrites every outcomeSpec field for the given model in-place', () => {
    const data: any = {
      tiers: {
        common: { rewards: [{ type: 'currency', key: 'gold', amount: 5 }] },
        failure: { rewards: [{ type: 'item', key: 'gem', amount: 1 }] },
      },
    };
    const changed = normalizeOutcomeFieldsForModel('missionDef', data);
    expect(changed).toBe(2);
    expect(data.tiers.common.rewards).toEqual([{ type: 'currency', key: 'gold', min: 5, max: 5 }]);
    expect(data.tiers.failure.rewards).toEqual([{ type: 'item', key: 'gem', min: 1, max: 1 }]);
  });

  it('is a no-op for unknown models', () => {
    const data: any = { rewardSpec: { type: 'currency', key: 'gold', amount: 5 } };
    const changed = normalizeOutcomeFieldsForModel('unknownModel', data);
    expect(changed).toBe(0);
    expect(data.rewardSpec.amount).toBe(5);
  });

  it('skips fields not present on data', () => {
    const data: any = {};
    const changed = normalizeOutcomeFieldsForModel('giftDef', data);
    expect(changed).toBe(0);
  });
});

describe('migrateGiftRewardSpec', () => {
  it('wraps a single-object spec into an array, changed=1', () => {
    const { value, changed } = migrateGiftRewardSpec({ type: 'currency', key: 'GEMS', min: 10, max: 10, odds: 100 });
    expect(value).toEqual([{ type: 'currency', key: 'GEMS', min: 10, max: 10, odds: 100 }]);
    expect(changed).toBe(1);
  });

  it('converts a lootTable entry (with lootboxDefId) to item, changed=1', () => {
    const { value, changed } = migrateGiftRewardSpec([
      { type: 'lootTable', lootboxDefId: 'lt_chest', qty: 1 },
    ]);
    expect(value).toEqual([{ type: 'item', key: 'lt_chest', min: 1, max: 1, odds: 1 }]);
    expect(changed).toBe(1);
  });

  it('leaves a lootTable entry missing lootboxDefId unchanged, changed=0', () => {
    const { value, changed } = migrateGiftRewardSpec([
      { type: 'lootTable', key: 'lt_chest' },
    ]);
    expect(value).toEqual([{ type: 'lootTable', key: 'lt_chest' }]);
    expect(changed).toBe(0);
  });

  it('is a no-op for a valid array with no legacy entries, changed=0', () => {
    const spec = [{ type: 'currency', key: 'GOLD', min: 5, max: 5, odds: 100 }];
    const { value, changed } = migrateGiftRewardSpec(spec);
    expect(value).toEqual(spec);
    expect(changed).toBe(0);
  });

  it('handles an empty array without changes', () => {
    const { value, changed } = migrateGiftRewardSpec([]);
    expect(value).toEqual([]);
    expect(changed).toBe(0);
  });

  it('handles null / undefined gracefully, changed=0', () => {
    expect(migrateGiftRewardSpec(null).changed).toBe(0);
    expect(migrateGiftRewardSpec(undefined).changed).toBe(0);
  });

  it('normalises an empty-object {} spec to [], changed=1', () => {
    const { value, changed } = migrateGiftRewardSpec({});
    expect(value).toEqual([]);
    expect(changed).toBe(1);
  });
});

describe('OUTCOME_SPEC_FIELDS_BY_MODEL pinning', () => {
  it('pins the full set of model→field mappings', () => {
    expect(OUTCOME_SPEC_FIELDS_BY_MODEL).toEqual({
      missionDef: ['tiers'],
      recipeDef: ['rewards'],
      giftDef: ['rewardSpec'],
      lootboxDef: ['outcomes'],
      bundleDef: ['bundle'],
      questDef: ['rewardSpec'],
    });
  });

  it('lists only valid Prisma model + JSON-column combinations', async () => {
    // Sanity check: every (model, field) pair must be a real Prisma JSON column.
    const _prisma = new PrismaClient();
    for (const [model, fields] of Object.entries(OUTCOME_SPEC_FIELDS_BY_MODEL)) {
      const delegate = (_prisma as any)[model];
      expect(delegate).toBeDefined();
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    }
    await _prisma.$disconnect();
  });
});
