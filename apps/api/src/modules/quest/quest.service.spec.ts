import { QuestService } from './quest.service';
import { GameRulesService } from '../game-rules/game-rules.service';

function makeFakes(rewardSpec: any, status: 'completed' | 'active' | 'claimed' = 'completed') {
  const credited: Array<{ currencyId: string; amount: number }> = [];
  const items: Array<{ itemId: string; quantity: number }> = [];
  const updates: any[] = [];

  const instance = {
    id: 'qi-1',
    userId: 'user-1',
    status,
    questDef: { id: 'q1', name: 'Test Quest', rewardSpec, repeatable: false, objectives: [] },
  };

  const prisma: any = {
    questInstance: {
      findUnique: jest.fn(() => Promise.resolve(instance)),
      update: jest.fn((args: any) => { updates.push(args); return Promise.resolve(instance); }),
    },
    user: {
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    bundleDef: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
  const notification: any = { createNotification: jest.fn() };
  const telemetry: any = { registerSubscriber: jest.fn() };
  const currency: any = {
    creditTx: jest.fn((_db: any, args: any) => {
      credited.push({ currencyId: args.currencyId, amount: args.amount });
      return Promise.resolve();
    }),
  };
  const inventory: any = {
    addItemTx: jest.fn((_db: any, args: any) => {
      items.push({ itemId: args.itemId, quantity: args.quantity });
      return Promise.resolve();
    }),
  };
  const fakeSelectionResolver: any = { evaluate: jest.fn().mockReturnValue(true), evaluateAll: jest.fn().mockReturnValue(true) };
  const gameRules = new GameRulesService(prisma, fakeSelectionResolver);

  const svc = new QuestService(prisma, notification, telemetry, currency, inventory, gameRules, fakeSelectionResolver);
  return { svc, credited, items, updates };
}

describe('QuestService.claimReward — canonical reward shape via shared resolver', () => {
  beforeEach(() => { jest.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => jest.restoreAllMocks());

  it('grants currency from a single-entry canonical { type, key, min, max } spec', async () => {
    const f = makeFakes({ type: 'currency', key: 'arcanium', min: 25, max: 25 });
    const { grants } = await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'arcanium', amount: 25 }]);
    expect(grants).toEqual([{ type: 'currency', key: 'arcanium', amount: 25 }]);
  });

  it('rolls within min..max for an item via Math.random when no rng is wired in', async () => {
    (Math.random as jest.Mock).mockReturnValue(0.999);
    const f = makeFakes({ type: 'item', key: 'wood', min: 1, max: 5 });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.items).toEqual([{ itemId: 'wood', quantity: 5 }]);
  });

  it('grants every entry of a top-level { rewards: [...] } block', async () => {
    const f = makeFakes({
      rewards: [
        { type: 'currency', key: 'gold', min: 10, max: 10, odds: 100 },
        { type: 'currency', key: 'silver', min: 7, max: 7, odds: 100 },
        { type: 'item', key: 'gem', min: 2, max: 2, odds: 100 },
        { type: 'item', key: 'wood', min: 3, max: 3, odds: 100 },
      ],
    });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([
      { currencyId: 'gold', amount: 10 },
      { currencyId: 'silver', amount: 7 },
    ]);
    expect(f.items).toEqual([
      { itemId: 'gem', quantity: 2 },
      { itemId: 'wood', quantity: 3 },
    ]);
  });

  it('grants every entry of a top-level array spec', async () => {
    const f = makeFakes([
      { type: 'currency', key: 'gold', min: 5, max: 5, odds: 100 },
      { type: 'item', key: 'gem', min: 1, max: 1, odds: 100 },
    ]);
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 5 }]);
    expect(f.items).toEqual([{ itemId: 'gem', quantity: 1 }]);
  });

  it('defaults to a single grant of 1 when the spec omits min/max (canonical resolver default)', async () => {
    // The canonical resolver intentionally defaults `min`/`max` to 1 rather
    // than skipping. Quest claim inherits this so a malformed spec produces
    // a small grant rather than a silent no-op or NaN.
    const f = makeFakes({ type: 'currency', key: 'arcanium' });
    const { grants } = await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'arcanium', amount: 1 }]);
    expect(grants).toEqual([{ type: 'currency', key: 'arcanium', amount: 1 }]);
  });

  it('skips (no credit) when min/max resolve to 0', async () => {
    const f = makeFakes({ type: 'currency', key: 'arcanium', min: 0, max: 0 });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([]);
  });

  it('skips entries with a missing key instead of crashing', async () => {
    const f = makeFakes({
      rewards: [
        { type: 'currency', min: 5, max: 5, odds: 100 },               // missing key
        { type: 'item', min: 1, max: 1, odds: 100 },                   // missing key
        { type: 'currency', key: 'gold', min: 3, max: 3, odds: 100 },  // valid → granted
      ],
    });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 3 }]);
    expect(f.items).toEqual([]);
  });

  it('still marks the quest as claimed after granting', async () => {
    const f = makeFakes({ type: 'currency', key: 'arcanium', min: 1, max: 1 });
    await f.svc.claimReward('user-1', 'qi-1');
    const claimUpdate = f.updates.find((u) => u.data?.status === 'claimed');
    expect(claimUpdate).toBeDefined();
  });
});
