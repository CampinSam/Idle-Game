/**
 * Unit tests for the gift reward resolver — specifically the `bundle_ref` code
 * path that delegates expansion to GameRulesService.expandBundleRefs (the
 * single shared expansion path) and then locally executes side effects per
 * resulting outcome entry.
 */
import { resolveRewardSpec } from './reward-resolver.util';
import { GameRulesService } from '../game-rules/game-rules.service';

function makeFakes() {
  const bundleDefs = new Map<string, any>();
  const credited: Array<{ currencyId: string; amount: number }> = [];
  const items: Array<{ itemId: string; quantity: number }> = [];

  const prisma: any = {
    bundleDef: {
      findMany: jest.fn(({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return Promise.resolve(ids.map(id => bundleDefs.get(id)).filter(Boolean));
      }),
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

  const gameRules = new GameRulesService(prisma);

  return { prisma, currencyService, inventoryService, gameRules, bundleDefs, credited, items };
}

describe('resolveRewardSpec — bundle_ref (consolidated via GameRulesService)', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockImplementation(() => 0);
  });
  afterEach(() => jest.restoreAllMocks());

  it('grants real currency + items by expanding the BundleDef and executing side effects', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.starter', {
      id: 'b.starter', enabled: true,
      bundle: [
        { type: 'currency', key: 'soft_arcanium', min: 50, max: 50, odds: 100 },
        { type: 'item', key: 'consumable_xp_potion_small', min: 2, max: 2, odds: 100 },
      ],
    });

    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.starter' }, 'gift-1',
    );

    expect(f.credited).toEqual([{ currencyId: 'soft_arcanium', amount: 50 }]);
    expect(f.items).toEqual([{ itemId: 'consumable_xp_potion_small', quantity: 2 }]);
    expect(grants.length).toBeGreaterThan(0);
  });

  it('records "missing_or_disabled" (and grants nothing) for a missing BundleDef', async () => {
    const f = makeFakes();
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'nope' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([{ type: 'bundle_ref', bundleDefId: 'nope', status: 'missing_or_disabled' }]);
  });

  it('records "missing_or_disabled" for a disabled BundleDef', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.x', { id: 'b.x', enabled: false, bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1 }] });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.x' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants[0].status).toBe('missing_or_disabled');
  });

  it('handles a self-cycle safely (no infinite recursion, no grants)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.cycle', {
      id: 'b.cycle', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'b.cycle' }],
    });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.cycle' }, 'gift-1',
    );
    // expandBundleRefs collapses the cycled inner ref to an empty bundle (with a warning log);
    // processOutcomeBundle then iterates that empty bundle → zero grants.
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([]);
  });

  it('handles a mutual cycle a → b → a safely', async () => {
    const f = makeFakes();
    f.bundleDefs.set('a', { id: 'a', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'b' }] });
    f.bundleDefs.set('b', { id: 'b', enabled: true, bundle: [{ type: 'bundle_ref', bundleDefId: 'a' }] });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'a' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([]);
  });

  it('skips the entire bundle when the inline odds override rolls below threshold (odds=0)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.gated', {
      id: 'b.gated', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1, odds: 100 }],
    });
    (Math.random as jest.Mock).mockReturnValue(0.99);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
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
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.pick' }, 'gift-1',
    );
    expect(f.credited.length).toBe(1);
  });

  it("lets inline pickMax override the def's default", async () => {
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
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
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
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 5 }]);
  });

  it('preserves inline overrides on nested bundle_refs (inner ref with odds:0 grants nothing)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('inner', { id: 'inner', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 5, max: 5, odds: 100 }] });
    f.bundleDefs.set('outer', { id: 'outer', enabled: true,
      bundle: [{ type: 'bundle_ref', bundleDefId: 'inner', odds: 0 }] });
    (Math.random as jest.Mock).mockReturnValue(0.99);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
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
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'outer' }, 'gift-1',
    );
    expect(f.credited.length).toBe(1);
  });

  it('still grants legacy {type:"bundle", entries:[]} specs unchanged', async () => {
    const f = makeFakes();
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle', entries: [
        { type: 'currency', currencyId: 'gold', amount: 7 },
        { type: 'item', itemDefId: 'gem', qty: 1 },
      ] }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 7 }]);
    expect(f.items).toEqual([{ itemId: 'gem', quantity: 1 }]);
  });
});
