import { Logger } from '@nestjs/common';

/**
 * Unit tests for the BundleDef resolution layer (`expandBundleRefs` + helpers)
 * in GameRulesService. Exercises the synchronous expansion logic in isolation:
 * a fresh service instance is constructed with stubbed dependencies, then its
 * private `expandBundleRefs` method is invoked directly with a hand-built
 * `defs` map. This avoids needing a database while still pinning down the
 * contract that callers (mission, lootbox, recipe, gift, effects) rely on.
 */

import { GameRulesService } from './game-rules.service';

function makeService(): GameRulesService {
  const fakePrisma: any = { user: { findUnique: jest.fn() }, bundleDef: { findMany: jest.fn() } };
  const svc = new GameRulesService(fakePrisma);
  // Silence the warn() calls from missing/disabled refs and cycle detection.
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
});
