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
    user: {
      findUnique: jest.fn(() => Promise.resolve(null)),
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

  const fakeSelectionResolver: any = { evaluate: jest.fn().mockReturnValue(true) };
  const gameRules = new GameRulesService(prisma, fakeSelectionResolver);

  return { prisma, currencyService, inventoryService, gameRules, bundleDefs, credited, items };
}

describe('resolveRewardSpec — top-level currency / item (canonical key/min/max)', () => {
  beforeEach(() => { jest.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => jest.restoreAllMocks());

  it('grants currency from a {type:"currency", key, min, max} spec', async () => {
    const f = makeFakes();
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'currency', key: 'soft_arcanium', min: 100, max: 100 }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'soft_arcanium', amount: 100 }]);
    expect(grants).toEqual([{ type: 'currency', key: 'soft_arcanium', amount: 100 }]);
  });

  it('grants an item from a {type:"item", key, min, max} spec', async () => {
    const f = makeFakes();
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'item', key: 'gem', min: 3, max: 3 }, 'gift-1',
    );
    expect(f.items).toEqual([{ itemId: 'gem', quantity: 3 }]);
    expect(grants).toEqual([{ type: 'item', key: 'gem', amount: 3 }]);
  });

  it('defaults to a grant of 1 when min/max is omitted (canonical resolver default)', async () => {
    const f = makeFakes();
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'currency', key: 'gold' }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 1 }]);
  });

  it('rolls within min..max via Math.random when no rng is wired in', async () => {
    const f = makeFakes();
    (Math.random as jest.Mock).mockReturnValue(0.999);
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'currency', key: 'gold', min: 5, max: 10 }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 10 }]);
  });

  it('skips an entry with a missing key instead of crashing', async () => {
    const f = makeFakes();
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'currency', min: 5, max: 5 }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
  });
});

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

  it('grants nothing for a missing BundleDef (GameRulesService collapses it to empty bundle)', async () => {
    const f = makeFakes();
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'nope' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([]);
  });

  it('grants nothing for a disabled BundleDef (GameRulesService collapses it to empty bundle)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.x', { id: 'b.x', enabled: false, bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1 }] });
    const grants = await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.x' }, 'gift-1',
    );
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([]);
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

  it('honors a 50% inline odds override deterministically (pass when random < 0.5, fail when ≥ 0.5)', async () => {
    const f1 = makeFakes();
    f1.bundleDefs.set('b50', { id: 'b50', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1, odds: 100 }] });
    (Math.random as jest.Mock).mockReturnValue(0.4);
    await resolveRewardSpec(
      f1.prisma, f1.currencyService, f1.inventoryService, f1.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b50', odds: 50 }, 'gift-1',
    );
    expect(f1.credited).toEqual([{ currencyId: 'gold', amount: 1 }]);

    const f2 = makeFakes();
    f2.bundleDefs.set('b50', { id: 'b50', enabled: true,
      bundle: [{ type: 'currency', key: 'gold', min: 1, max: 1, odds: 100 }] });
    (Math.random as jest.Mock).mockReturnValue(0.6);
    await resolveRewardSpec(
      f2.prisma, f2.currencyService, f2.inventoryService, f2.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b50', odds: 50 }, 'gift-1',
    );
    expect(f2.credited).toEqual([]);
  });

  it('gates entries with requirements out of gift claims (empty user/flags context)', async () => {
    const f = makeFakes();
    f.bundleDefs.set('b.gated', {
      id: 'b.gated', enabled: true,
      bundle: [
        { type: 'currency', key: 'free', min: 1, max: 1, odds: 100 },
        {
          type: 'currency', key: 'gated', min: 1, max: 1, odds: 100,
          requirements: [{ type: 'flag', key: 'has_pass', value: true }],
        },
      ],
    });
    await resolveRewardSpec(
      f.prisma, f.currencyService, f.inventoryService, f.gameRules, 'user-1',
      { type: 'bundle_ref', bundleDefId: 'b.gated' }, 'gift-1',
    );
    expect(f.credited).toEqual([{ currencyId: 'free', amount: 1 }]);
  });
});
