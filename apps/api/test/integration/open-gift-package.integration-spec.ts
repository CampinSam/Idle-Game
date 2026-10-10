/**
 * Real-DB integration test for OpenGiftPackageHandler.
 *
 * Proves the end-to-end "open a gift package" flow:
 *   1. The GIFT_PACKAGE ItemInstance is consumed
 *   2. Currencies/items declared in state.rewardSpec are granted
 *   3. A downstream throw rolls every write back
 */
import { createTestHarness, TestHarness } from './db-harness';
import { OpenGiftPackageHandler } from '../../src/modules/commands/handlers/open-gift-package.handler';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('OpenGiftPackageHandler [integration]', () => {
  let h: TestHarness;
  let handler: OpenGiftPackageHandler;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await createTestHarness();
    handler = h.app.get(OpenGiftPackageHandler);
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

    const packageDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'item_gift_package',
        name: 'Mystery Gift',
        type: 'GIFT_PACKAGE',
        stackable: false,
        maxStack: 1,
        data: {},
      },
    });

    const instance = await (prisma as any).itemInstance.create({
      data: {
        userId: user.id,
        definitionId: packageDef.id,
        quantity: 1,
        // rewardSpec is stored as an array of canonical outcome entries.
        // 100% odds + identical min/max means we deterministically grant 50 GEMS.
        state: {
          rewardSpec: [{ type: 'currency', key: 'GEMS', min: 50, max: 50, odds: 100 }],
        },
      },
    });

    return { user, packageDef, instance };
  }

  it('consumes the gift package and grants the rewardSpec contents in one transaction', async () => {
    const { user, instance } = await seed();

    await prisma.$transaction(
      async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { itemInstanceId: instance.id },
        );
      },
      { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
    );

    // Package was deleted
    const remaining = await (prisma as any).itemInstance.findUnique({
      where: { id: instance.id },
    });
    expect(remaining).toBeNull();

    // Currency was credited
    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(bal).not.toBeNull();
    expect(Number(bal!.balance)).toBe(50);

    // Ledger attribution
    const ledger = await prisma.currencyLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].delta)).toBe(50);
  });

  it('rolls back if a downstream step throws — gift package is not consumed and rewards are not granted', async () => {
    const { user, instance } = await seed();

    await expect(
      prisma.$transaction(async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { itemInstanceId: instance.id },
        );
        throw new Error('simulated post-handler failure');
      }),
    ).rejects.toThrow('simulated post-handler failure');

    const stillThere = await (prisma as any).itemInstance.findUnique({
      where: { id: instance.id },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere.quantity).toBe(1);

    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(bal).toBeNull();

    const ledger = await prisma.currencyLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(0);
  });
});
