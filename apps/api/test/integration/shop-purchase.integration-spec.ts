/**
 * Real-DB integration test for ShopPurchaseHandler.
 *
 * Proves the end-to-end shop transaction:
 *   1. Cost is deducted from the user's currency balance (with a ledger row)
 *   2. Granted currency is credited (with a ledger row)
 *   3. Granted items are added to inventory
 * All inside the same outer $transaction the real /v1/commands pipeline uses,
 * and a downstream throw must roll EVERY write back.
 */
import { createTestHarness, TestHarness } from './db-harness';
import { ShopPurchaseHandler } from '../../src/modules/commands/handlers/shop-purchase.handler';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ShopPurchaseHandler [integration]', () => {
  let h: TestHarness;
  let handler: ShopPurchaseHandler;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await createTestHarness();
    handler = h.app.get(ShopPurchaseHandler);
    prisma = h.prisma;
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  beforeEach(async () => {
    await h.resetDb();
  });

  async function seed() {
    const user = await prisma.user.create({
      data: {
        username: `tester-${Math.random().toString(36).slice(2, 8)}`,
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'x',
        keeperLevel: 1,
        keeperXp: BigInt(0),
        flags: {},
      },
    });

    await prisma.currency.create({
      data: { id: 'GEMS', name: 'Gems', symbol: 'G', decimals: 0, isSpendable: true, type: 'HARD' },
    });
    await prisma.currency.create({
      data: { id: 'GOLD', name: 'Gold', symbol: 'g', decimals: 0, isSpendable: true, type: 'SOFT' },
    });

    // Pre-fund the user with GEMS so they can afford the purchase.
    await prisma.userCurrencyBalance.create({
      data: { userId: user.id, currencyId: 'GEMS', balance: BigInt(500) },
    });

    await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_potion',
        name: 'Test Potion',
        type: 'CONSUMABLE',
        stackable: true,
        maxStack: 99,
        data: {},
      },
    });

    const shopItem = await (prisma as any).shopItemDef.create({
      data: {
        name: 'Gold + Potion Bundle',
        tab: 'featured',
        cost: [{ type: 'currency', id: 'GEMS', amount: 100 }],
        contents: [
          { type: 'currency', id: 'GOLD', amount: 1000 },
          { type: 'item', id: 'item_potion', amount: 3 },
        ],
        enabled: true,
      },
    });

    return { user, shopItem };
  }

  it('debits cost, credits currency and grants items in one transaction', async () => {
    const { user, shopItem } = await seed();

    await prisma.$transaction(
      async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { shopItemDefId: shopItem.id },
        );
      },
      { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
    );

    // GEMS spent: 500 - 100 = 400
    const gems = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(Number(gems!.balance)).toBe(400);

    // GOLD granted: 0 + 1000
    const gold = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GOLD' } },
    });
    expect(Number(gold!.balance)).toBe(1000);

    // Item granted
    const items = await (prisma as any).itemInstance.findMany({
      where: { userId: user.id, definitionId: 'item_potion' },
    });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);

    // Ledger: one debit for GEMS, one credit for GOLD, both attributed to shop
    const ledger = await prisma.currencyLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger).toHaveLength(2);
    const gemRow = ledger.find((r) => r.currencyId === 'GEMS')!;
    const goldRow = ledger.find((r) => r.currencyId === 'GOLD')!;
    expect(Number(gemRow.delta)).toBe(-100);
    expect(gemRow.sourceType).toBe('shop');
    expect(Number(goldRow.delta)).toBe(1000);
    expect(goldRow.sourceType).toBe('shop');
  });

  it('rolls back the entire purchase if a downstream step throws', async () => {
    const { user, shopItem } = await seed();

    await expect(
      prisma.$transaction(async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { shopItemDefId: shopItem.id },
        );
        throw new Error('simulated post-handler failure');
      }),
    ).rejects.toThrow('simulated post-handler failure');

    // GEMS untouched
    const gems = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(Number(gems!.balance)).toBe(500);

    // GOLD never created
    const gold = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GOLD' } },
    });
    expect(gold).toBeNull();

    // No items
    const items = await (prisma as any).itemInstance.findMany({
      where: { userId: user.id, definitionId: 'item_potion' },
    });
    expect(items).toHaveLength(0);

    // No ledger rows
    const ledger = await prisma.currencyLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(0);
  });
});
