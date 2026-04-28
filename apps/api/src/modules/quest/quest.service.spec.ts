import { QuestService } from './quest.service';

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

  const svc = new QuestService(prisma, notification, telemetry, currency, inventory);
  return { svc, credited, items, updates };
}

describe('QuestService.claimReward — currency / item grants (post amount→min/max migration)', () => {
  beforeEach(() => { jest.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => jest.restoreAllMocks());

  it('grants currency from canonical {type:"currency", min, max}', async () => {
    const f = makeFakes({ type: 'currency', currencyId: 'arcanium', min: 25, max: 25 });
    const { grants } = await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'arcanium', amount: 25 }]);
    expect(grants).toEqual([{ type: 'currency', currencyId: 'arcanium', amount: 25 }]);
  });

  it('still grants currency from a legacy {type:"currency", amount} spec', async () => {
    const f = makeFakes({ type: 'currency', currencyId: 'arcanium', amount: 50 });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'arcanium', amount: 50 }]);
  });

  it('rolls within min..max for an item via Math.random when no rng is wired in', async () => {
    (Math.random as jest.Mock).mockReturnValue(0.999);
    const f = makeFakes({ type: 'item', itemDefId: 'wood', min: 1, max: 5 });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.items).toEqual([{ itemId: 'wood', quantity: 5 }]);
  });

  it('grants every entry of a bundle reward, supporting both shapes side-by-side', async () => {
    const f = makeFakes({
      type: 'bundle',
      entries: [
        { type: 'currency', currencyId: 'gold', min: 10, max: 10 },     // canonical
        { type: 'currency', currencyId: 'silver', amount: 7 },          // legacy
        { type: 'item', itemDefId: 'gem', min: 2, max: 2 },             // canonical
        { type: 'item', itemDefId: 'wood', qty: 3 },                    // legacy
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

  it('skips (no credit) when the spec has neither amount nor min/max — never grants 0/NaN', async () => {
    const f = makeFakes({ type: 'currency', currencyId: 'arcanium' });
    const { grants } = await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([]);
    expect(grants).toEqual([]);
  });

  it('skips (no credit) when min/max resolve to 0 (preserves the old "skip empty" behavior)', async () => {
    const f = makeFakes({ type: 'currency', currencyId: 'arcanium', min: 0, max: 0 });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([]);
  });

  it('skips bundle entries with a missing key (currencyId / itemDefId) instead of crashing', async () => {
    const f = makeFakes({
      type: 'bundle',
      entries: [
        { type: 'currency', min: 5, max: 5 },                       // missing currencyId
        { type: 'item', min: 1, max: 1 },                           // missing itemDefId
        { type: 'currency', currencyId: 'gold', min: 3, max: 3 },   // valid → granted
      ],
    });
    await f.svc.claimReward('user-1', 'qi-1');
    expect(f.credited).toEqual([{ currencyId: 'gold', amount: 3 }]);
    expect(f.items).toEqual([]);
  });

  it('still marks the quest as claimed after granting', async () => {
    const f = makeFakes({ type: 'currency', currencyId: 'arcanium', min: 1, max: 1 });
    await f.svc.claimReward('user-1', 'qi-1');
    const claimUpdate = f.updates.find((u) => u.data?.status === 'claimed');
    expect(claimUpdate).toBeDefined();
  });
});
