import { Logger } from '@nestjs/common';
import { GameRulesService } from './game-rules.service';

function makeService(): GameRulesService {
  const fakePrisma: any = { user: { findUnique: jest.fn() }, bundleDef: { findMany: jest.fn() } };
  const svc = new GameRulesService(fakePrisma);
  (svc as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() } as unknown as Logger;
  return svc;
}

describe('GameRulesService.expandBundleRefs', () => {
  it('inlines a bundle_ref using the def\'s defaults when no overrides are present', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['bundle.basic_starter', {
        id: 'bundle.basic_starter',
        enabled: true,
        bundle: [{ type: 'currency', key: 'soft_arcanium', min: 50, max: 100, odds: 100 }],
        odds: 80,
        pickMin: 1,
        pickMax: 2,
      }],
    ]);

    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'bundle.basic_starter' }], defs);

    expect(out).toEqual([{
      bundle: [{ type: 'currency', key: 'soft_arcanium', min: 50, max: 100, odds: 100 }],
      odds: 80,
      pickMin: 1,
      pickMax: 2,
    }]);
  });

  it('lets inline overrides win over the def defaults for odds/pickMin/pickMax/requirements', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['b1', { id: 'b1', enabled: true, bundle: [{ type: 'item', key: 'x', min: 1, max: 1 }], odds: 50, pickMin: 1, pickMax: 1 }],
    ]);
    const reqs = [{ type: 'level', op: '>=', value: 5 }];

    const out = svc.expandBundleRefs(
      [{ type: 'bundle_ref', bundleDefId: 'b1', odds: 99, pickMin: 2, pickMax: 3, requirements: reqs }],
      defs,
    );

    expect(out[0].odds).toBe(99);
    expect(out[0].pickMin).toBe(2);
    expect(out[0].pickMax).toBe(3);
    expect(out[0].requirements).toEqual(reqs);
    expect(out[0].bundle).toEqual([{ type: 'item', key: 'x', min: 1, max: 1 }]);
  });

  it('collapses a missing bundle_ref to an empty bundle', () => {
    const svc = makeService();
    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'does.not.exist' }], new Map());
    expect(out).toEqual([{ bundle: [], requirements: undefined }]);
  });

  it('collapses a disabled bundle_ref to an empty bundle', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['b.disabled', { id: 'b.disabled', enabled: false, bundle: [{ type: 'currency', key: 'x', min: 1, max: 1 }] }],
    ]);
    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'b.disabled' }], defs);
    expect(out).toEqual([{ bundle: [], requirements: undefined }]);
  });

  it('expands nested bundle_refs (a ref inside a def\'s bundle)', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['inner', { id: 'inner', enabled: true, bundle: [{ type: 'item', key: 'gem', min: 1, max: 1 }] }],
      ['outer', { id: 'outer', enabled: true, bundle: [
        { type: 'currency', key: 'gold', min: 10, max: 20 },
        { type: 'bundle_ref', bundleDefId: 'inner' },
      ] }],
    ]);

    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'outer' }], defs);

    expect(out[0].bundle).toHaveLength(2);
    expect(out[0].bundle[0]).toEqual({ type: 'currency', key: 'gold', min: 10, max: 20 });
    expect(out[0].bundle[1]).toEqual({ bundle: [{ type: 'item', key: 'gem', min: 1, max: 1 }] });
  });

  it('terminates on a self-referential cycle (a → a) by collapsing to an empty bundle', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['cycle.self', { id: 'cycle.self', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'cycle.self' }] }],
    ]);
    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'cycle.self' }], defs);
    expect(out[0].bundle).toEqual([{ bundle: [], requirements: undefined }]);
  });

  it('terminates on a mutual cycle (a → b → a)', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['a', { id: 'a', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'b' }] }],
      ['b', { id: 'b', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'a' }] }],
    ]);
    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'a' }], defs);
    // a expands to [bundle_ref:b], which expands to [bundle_ref:a (cycle)] → empty bundle
    expect(out[0].bundle[0].bundle[0]).toEqual({ bundle: [], requirements: undefined });
  });

  it('walks bundle_refs nested inside an inline bundle entry', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['gem_bundle', { id: 'gem_bundle', enabled: true, bundle: [{ type: 'item', key: 'gem', min: 1, max: 1 }] }],
    ]);
    const out = svc.expandBundleRefs([
      { bundle: [{ type: 'bundle_ref', bundleDefId: 'gem_bundle' }, { type: 'currency', key: 'gold', min: 5, max: 5 }] },
    ], defs);

    expect(out[0].bundle).toHaveLength(2);
    expect(out[0].bundle[0]).toEqual({ bundle: [{ type: 'item', key: 'gem', min: 1, max: 1 }] });
    expect(out[0].bundle[1]).toEqual({ type: 'currency', key: 'gold', min: 5, max: 5 });
  });

  it('leaves non-bundle_ref entries untouched', () => {
    const svc = makeService();
    const items = [
      { type: 'currency', key: 'gold', min: 1, max: 5, odds: 100 },
      { type: 'flag', operation: 'set', key: 'tutorial.done', value: true },
    ];
    const out = svc.expandBundleRefs(items, new Map());
    expect(out).toEqual(items);
  });

  it('coerces string-typed odds/pickMin/pickMax from the def to numbers', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['b.strings', {
        id: 'b.strings',
        enabled: true,
        bundle: [{ type: 'item', key: 'x', min: 1, max: 1 }],
        odds: '50',
        pickMin: '2',
        pickMax: '3',
      }],
    ]);

    const out = svc.expandBundleRefs([{ type: 'bundle_ref', bundleDefId: 'b.strings' }], defs);

    expect(out[0].odds).toBe(50);
    expect(out[0].pickMin).toBe(2);
    expect(out[0].pickMax).toBe(3);
    expect(typeof out[0].odds).toBe('number');
    expect(typeof out[0].pickMin).toBe('number');
    expect(typeof out[0].pickMax).toBe('number');
  });

  it('coerces string-typed inline overrides to numbers', () => {
    const svc = makeService();
    const defs = new Map<string, any>([
      ['b.x', { id: 'b.x', enabled: true, bundle: [{ type: 'item', key: 'x', min: 1, max: 1 }] }],
    ]);

    const out = svc.expandBundleRefs(
      [{ type: 'bundle_ref', bundleDefId: 'b.x', odds: '99', pickMin: '7', pickMax: '7' }],
      defs,
    );

    expect(out[0].odds).toBe(99);
    expect(out[0].pickMin).toBe(7);
    expect(out[0].pickMax).toBe(7);
  });
});

// A deterministic RNG that walks through a pre-set sequence of integers.
// `nextInt(min, max)` always returns `seq[i]` clamped to [min, max], advancing i
// each call. `chance(p)` always returns true so odds rolls don't filter entries.
function seqRng(seq: number[]) {
  let i = 0;
  return {
    chance: (_p: number) => true,
    nextInt: (min: number, max: number) => {
      const v = seq[i % seq.length];
      i += 1;
      return Math.max(min, Math.min(max, v));
    },
  };
}

const emptyReqContext = (): any => ({ user: { keeperLevel: 1 }, userFlags: {} });

describe('GameRulesService.resolveOutcomes — pick mode (with replacement)', () => {
  it('picks exactly pickMax entries even when pickMax > pool.length, allowing duplicates', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'currency', key: 'gold', min: 5, max: 5, odds: 100 },
      ],
      pickMin: 7,
      pickMax: 7,
    }];

    // Single-entry pool: every nextInt call resolves to that one entry.
    const rng = seqRng([0, 0, 0, 0, 0, 0, 0, 0]);
    const out = svc.resolveOutcomes(items, emptyReqContext(), rng);

    expect(out.resolved).toHaveLength(7);
    for (const r of out.resolved) {
      expect(r.entry.type).toBe('currency');
      expect(r.entry.key).toBe('gold');
      expect(r.amount).toBe(5);
    }
  });

  it('with a 3-entry pool and pickMax=7, produces 7 picks with duplicates', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'item', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'item', key: 'b', min: 1, max: 1, odds: 100 },
        { type: 'item', key: 'c', min: 1, max: 1, odds: 100 },
      ],
      pickMin: 7,
      pickMax: 7,
    }];

    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0, 1, 2, 0, 1, 2, 0]));

    expect(out.resolved).toHaveLength(7);
    const keys = out.resolved.map((r) => r.entry.key);
    // Must include duplicates (pool has 3 distinct entries, asked for 7).
    const uniq = new Set(keys);
    expect(keys.length).toBeGreaterThan(uniq.size);
  });

  it('regression: pickMax=1 from a multi-entry pool still produces a single weighted pick', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'currency', key: 'soft_arcanium', min: 100, max: 100, odds: 60 },
        { type: 'currency', key: 'soft_arcanium', min: 250, max: 250, odds: 30 },
        { type: 'currency', key: 'soft_arcanium', min: 1000, max: 1000, odds: 10 },
      ],
      pickMin: 1,
      pickMax: 1,
    }];

    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0]));

    expect(out.resolved).toHaveLength(1);
    expect(out.resolved[0].entry.key).toBe('soft_arcanium');
  });

  it('with pool.length=3 and pickMax=2 (count <= pool size), still produces exactly the requested count and allows duplicates', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'item', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'item', key: 'b', min: 1, max: 1, odds: 100 },
        { type: 'item', key: 'c', min: 1, max: 1, odds: 100 },
      ],
      pickMin: 2,
      pickMax: 2,
    }];

    // Seeded RNG returns idx 0 for both picks → with-replacement allows the
    // same entry to fire twice. Without-replacement (the old behaviour) would
    // have removed entry 0 after the first pick and produced a different key.
    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0, 0]));

    expect(out.resolved).toHaveLength(2);
    expect(out.resolved[0].entry.key).toBe('a');
    expect(out.resolved[1].entry.key).toBe('a');
  });

  it('honours requirements: ineligible entries are excluded from the pool before picking', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'item', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'item', key: 'b', min: 1, max: 1, odds: 100, requirements: [{ type: 'keeper_level', operator: 'gte', value: 999 }] },
      ],
      pickMin: 5,
      pickMax: 5,
    }];

    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0, 0, 0, 0, 0]));

    expect(out.resolved).toHaveLength(5);
    for (const r of out.resolved) {
      expect(r.entry.key).toBe('a');
    }
  });

  it('coerces string-typed pickMin/pickMax so the seeded RNG receives numbers', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'item', key: 'gem', min: 1, max: 1, odds: 100 },
      ],
      pickMin: '3',
      pickMax: '3',
    } as any];

    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0, 0, 0]));

    expect(out.resolved).toHaveLength(3);
    for (const r of out.resolved) {
      expect(r.entry.key).toBe('gem');
    }
  });

  it('wraps the rewards in an inner pick-bundle so the outer pickMax multiplies the whole recipe (Derpshire pattern)', () => {
    const svc = makeService();
    // BundleDef expanded shape: top-level is one wrapped recipe; outer pickMax=4
    // therefore picks the recipe 4 times. Each recipe roll grants Keeper XP +
    // Entity XP + 1-of-3 materials.
    const items = [{
      bundle: [{
        bundle: [
          { type: 'keeper_xp', min: 1, max: 5 },
          { type: 'entity_xp', min: 10, max: 20 },
          {
            bundle: [
              { type: 'item', key: 'mat_meadow_thread',  min: 1, max: 5, odds: 60 },
              { type: 'item', key: 'mat_shiny_rock',     min: 1, max: 3, odds: 30 },
              { type: 'item', key: 'mat_golden_hay_core',min: 1, max: 2, odds: 10 },
            ],
            pickMin: 1,
            pickMax: 1,
          },
        ],
      }],
      pickMin: 4,
      pickMax: 4,
    }];

    // Sequence consumed in order:
    //   outer pick: nextInt × 4 (one per recipe roll, all -> idx 0)
    //   per recipe roll: keeper_xp amount, entity_xp amount, inner pick idx, inner item amount
    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([
      0, 0, 0, 0,            // outer picks (4 copies of the wrapped recipe)
      3, 15, 0, 2,           // roll 1: keeper=3, entity=15, material idx=0, amount=2
      4, 18, 0, 1,           // roll 2
      2, 12, 0, 3,           // roll 3
      5, 20, 0, 4,           // roll 4
    ]));

    const keeperRolls = out.resolved.filter((r) => r.entry.type === 'keeper_xp');
    const entityRolls = out.resolved.filter((r) => r.entry.type === 'entity_xp');
    const itemRolls   = out.resolved.filter((r) => r.entry.type === 'item');

    expect(keeperRolls).toHaveLength(4);
    expect(entityRolls).toHaveLength(4);
    expect(itemRolls).toHaveLength(4);
  });

  it('returns no picks when the pool is empty after requirements filtering', () => {
    const svc = makeService();
    const items = [{
      bundle: [
        { type: 'item', key: 'gated', min: 1, max: 1, requirements: [{ type: 'keeper_level', operator: 'gte', value: 999 }] },
      ],
      pickMin: 5,
      pickMax: 5,
    }];

    const out = svc.resolveOutcomes(items, emptyReqContext(), seqRng([0]));
    expect(out.resolved).toHaveLength(0);
  });
});

describe('GameRulesService.processEffectsWithBundles — pick mode (with replacement)', () => {
  it('processes flag effects pickMax times from a single-entry pool (parity with resolveOutcomes)', async () => {
    const svc = makeService();
    (svc as any).prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', keeperLevel: 1, flags: {} });
    const applyFlag = jest.spyOn(svc as any, 'applyFlagEffect').mockResolvedValue(undefined);

    const effects = [{
      bundle: [
        { type: 'flag', operation: 'set', key: 'rolled', value: true, odds: 100 },
      ],
      pickMin: 5,
      pickMax: 5,
    }];

    await svc.processEffectsWithBundles('u1', effects);

    expect(applyFlag).toHaveBeenCalledTimes(5);
  });

  it('returns no picks when the pool is empty after requirements filtering (parity with seeded path)', async () => {
    const svc = makeService();
    (svc as any).prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', keeperLevel: 1, flags: {} });
    const applyFlag = jest.spyOn(svc as any, 'applyFlagEffect').mockResolvedValue(undefined);

    const effects = [{
      bundle: [
        { type: 'flag', operation: 'set', key: 'gated', value: true, odds: 100, requirements: [{ type: 'keeper_level', operator: 'gte', value: 999 }] },
      ],
      pickMin: 5,
      pickMax: 5,
    }];

    await svc.processEffectsWithBundles('u1', effects);

    expect(applyFlag).not.toHaveBeenCalled();
  });

  it('parity with resolveOutcomes: same bundle + matching draw stream produces the same number of picks of the same entry', async () => {
    // Both paths get a deterministic "always pick the first pool entry" stream.
    // resolveOutcomes uses the injected rng; processEffectsWithBundles uses
    // Math.random — stub it to 0 so the weighted walk lands on idx 0 for every
    // pick. Same pool, same pickMin/pickMax → same count, same single key.
    const svc = makeService();
    (svc as any).prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', keeperLevel: 1, flags: {} });
    const applyFlag = jest.spyOn(svc as any, 'applyFlagEffect').mockResolvedValue(undefined);

    const pool = [
      { type: 'flag', operation: 'set', key: 'a', value: true, odds: 100 },
      { type: 'flag', operation: 'set', key: 'b', value: true, odds: 100 },
      { type: 'flag', operation: 'set', key: 'c', value: true, odds: 100 },
    ];
    const N = 5;

    const seededOut = svc.resolveOutcomes(
      [{ bundle: pool, pickMin: N, pickMax: N }],
      emptyReqContext(),
      seqRng([0, 0, 0, 0, 0]),
    );

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await svc.processEffectsWithBundles('u1', [{ bundle: pool, pickMin: N, pickMax: N }]);
    } finally {
      randomSpy.mockRestore();
    }

    // Both paths should end up applying the same number of operations from
    // the same pool entry (idx 0 → key 'a'). Note: flag entries land in
    // `flags[]` on the resolveOutcomes side (resolved[] is for rewards), and
    // are routed to applyFlagEffect on the processEffectsWithBundles side.
    expect(seededOut.flags).toHaveLength(N);
    expect(seededOut.flags.every((r) => (r.entry as any).key === 'a')).toBe(true);
    expect(applyFlag).toHaveBeenCalledTimes(N);
    for (const call of applyFlag.mock.calls) {
      // applyFlagEffect(userId, effect) — effect is the second argument.
      const effect = call[1] as any;
      expect(effect.key).toBe('a');
    }
  });

  it('coerces string-typed pickMin/pickMax in the non-seeded path', async () => {
    const svc = makeService();
    (svc as any).prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', keeperLevel: 1, flags: {} });
    const applyFlag = jest.spyOn(svc as any, 'applyFlagEffect').mockResolvedValue(undefined);

    const effects = [{
      bundle: [{ type: 'flag', operation: 'set', key: 'k', value: true, odds: 100 }],
      pickMin: '4',
      pickMax: '4',
    } as any];

    await svc.processEffectsWithBundles('u1', effects);

    expect(applyFlag).toHaveBeenCalledTimes(4);
  });
});
