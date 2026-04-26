/**
 * Unit tests for the gift reward resolver — specifically the new `bundle_ref`
 * code path that loads a BundleDef from prisma, honors odds + pickMin/pickMax,
 * and is cycle-safe.
 *
 * Uses a hand-rolled fake prisma + currency/inventory services (no NestJS
 * test module). Each test stubs only the surface area it needs.
 */
import { resolveRewardSpec } from './reward-resolver.util';

type Stub = jest.Mock<any, any>;

function makeFakes() {
  const bundleDefs = new Map<string, any>();
  const credited: Array<{ currencyId: string; amount: number }> = [];
  const items: Array<{ itemId: string; quantity: number }> = [];

  const prisma: any = {
    bundleDef: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(bundleDefs.get(where.id) ?? null)),
    },
  };
  const currencyService: any = {
    creditTx: jest.fn((_db: any, args: any) => {
      credited.push({ currencyId: args.currencyId, amount: args.amount });
      return Promise.resolve();
    }),
  };
  const inventoryService: any = {
    addItemTx: jest.fn((_db: any, args: any) => {
      items.push({ itemId: args.itemId, quantity: args.quantity });
      return Promise.resolve();
    }),
  };

  return { prisma, currencyService, inventoryService, bundleDefs, credited, items };
}

describe('resolveRewardSpec — bundle_ref', () => {
  beforeEach(() => {
    // Force every odds roll to fire and pick the first option (sequence: 0.0, 0.0, ...)
    // Tests that rely on randomness should override per-call.
    jest.spyOn(Math, 'random').mockImplementation(() => 0);
  });
  afterEach(() => jest.restoreAllMocks());

  it('grants real currency + items by inlining the BundleDef and converting outcome shapes', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.starter', {
      id: 'b.starter', enabled: true,
      bundle: [
        { type: 'currency', key: 'soft_arcanium', min: 50, max: 50, odds: 100 },
        { type: 'item', key: 'consumable_xp_potion_small', min: 2, max: 2, odds: 100 },
      ],
    });

    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.starter' }, 'gift-1',
    );

    expect(f.credited).toEqual([{ currencyId: 'soft_arcanium', amount: 50 }]);
    expect(f.items).toEqual([{ itemId: 'consumable_xp_potion_small', quantity: 2 }]);
    expect(grants.length).toBeGreaterThan(0);
  });

  it('records a "missing_or_disabled" status (and grants nothing) for a missing BundleDef', async () => {
    const f = makeFakes();
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'nope' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(f.items).toEqual([]);
    expect(grants).toEqual([{ type: 'bundle_ref', bundleDefId: 'nope', status: 'missing_or_disabled' }]);
  });

  it('records a "missing_or_disabled" status for a disabled BundleDef', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.x', { id: 'b.x', enabled: false, bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1 }] });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.x' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants[0].status).toBe('missing_or_disabled');
  });

  it('detects a self-cycle and records "cycle_detected" instead of recursing forever', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.cycle', {
      id: 'b.cycle', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'b.cycle' }],
    });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.cycle' }, 'gift-1',
    );
    // The outer call expands once; the recursive child sees b.cycle on the stack and aborts.
    const cycleGrant = grants.find(g => g?.status === 'cycle_detected');
    expect(cycleGrant).toBeDefined();
    expect(cycleGrant.bundleDefId).toBe('b.cycle');
  });

  it('detects a mutual cycle (a → b → a)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('a', { id: 'a', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'b' }] });
    f.bundleDefs.set('b', { id: 'b', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'a' }] });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'a' }, 'gift-1',
    );
    const cycleGrant = grants.find(g => g?.status === 'cycle_detected');
    expect(cycleGrant).toBeDefined();
  });

  it('skips the entire bundle when the inline odds override rolls below threshold (odds=0)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.gated', {
      id: 'b.gated', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1, odds: 100 }],
    });
    // Math.random returns 0 by default -> would normally pass any odds. Force a high value.
    (Math.random as jest.Mock).mockReturnValue(0.99);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.gated', odds: 0 }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
  });

  it('honors pickMin/pickMax — granting only the requested number of entries', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.pick', {
      id: 'b.pick', enabled: true, pickMin: 1, pickMax: 1,
      bundle: [
        { type: 'currency', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'b', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'c', min: 1, max: 1, odds: 100 },
      ],
    });
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.pick' }, 'gift-1',
    );
    expect(f.credited.length).toBe(1);
  });

  it('lets inline pickMax override the def\'s default', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.pick', {
      id: 'b.pick', enabled: true, pickMin: 1, pickMax: 1,
      bundle: [
        { type: 'currency', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'b', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'c', min: 1, max: 1, odds: 100 },
      ],
    });
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.pick', pickMin: 3, pickMax: 3 }, 'gift-1',
    );
    expect(f.credited.length).toBe(3);
  });

  it('grants a nested bundle_ref (def whose bundle contains another bundle_ref)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('inner', { id: 'inner', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 5, max: 5, odds: 100 }] });
    f.bundleDefs.set('outer', { id: 'outer', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'inner' }] });

    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 5 }]);
  });

  it('preserves inline overrides on nested bundle_refs (e.g. an inner ref with odds:0 grants nothing)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('inner', { id: 'inner', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 5, max: 5, odds: 100 }] });
    // outer's bundle has a NESTED bundle_ref with odds:0 → the inner grant should be skipped
    f.bundleDefs.set('outer', { id: 'outer', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'inner', odds: 0 }] });
    // Force Math.random to a high value so any odds < 100 fails the roll.
    (Math.random as jest.Mock).mockReturnValue(0.99);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    // Inner ref's odds:0 override propagates → no currency credited.
    expect(f.credited).toEqual([]);
  });

  it('applies nested bundle_ref odds exactly once (no double-roll across nesting)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('inner', { id: 'inner', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1, odds: 100 }] });
    // Outer wraps inner with nested odds:50.
    f.bundleDefs.set('outer', { id: 'outer', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'inner', odds: 50 }] });
    // Random sequence: 0.4 then 0.99.
    //   Single-roll (correct): only the inner bundle-level roll consumes 0.4 (40<50 → pass) → grants gold.
    //   Double-roll (bug): parent per-entry roll 40<50 → pass; inner bundle roll 99<50 → fail → no grant.
    (Math.random as jest.Mock)
      .mockReturnValueOnce(0.4)
      .mockReturnValue(0.99);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 1 }]);
  });

  it('preserves inline pickMax on nested bundle_refs', async () => {
    const f = makeFakes();
    f.bundleDefs.set('three', { id: 'three', enabled: true,
      bundle: [
        { type: 'currency', key: 'a', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'b', min: 1, max: 1, odds: 100 },
        { type: 'currency', key: 'c', min: 1, max: 1, odds: 100 },
      ] });
    f.bundleDefs.set('outer', { id: 'outer', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'three', pickMin: 1, pickMax: 1 }] });
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited.length).toBe(1);
  });

  it('still grants legacy {type:"bundle", entries:[]} specs unchanged', async () => {
    const f = makeFakes();
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, 'user-1',
      { type: 'bundle', entries: [
        { type: 'currency', currencyId: 'gold', amount: 7 },
        { type: 'item', itemDefId: 'gem', qty: 1 },
      ] }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 7 }]);
    expect(f.items).toEqual([{ itemId: 'gem', quantity: 1 }]);
  });
});
