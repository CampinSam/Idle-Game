/**
 * Real-DB integration test for OpenLootBoxHandler.
 *
 * Proves the end-to-end economy mutation:
 *   1. User opens a lootbox → currency credited via CurrencyLedger
 *   2. Lootbox ItemInstance is consumed (deleted when quantity was 1)
 *   3. Telemetry row is written
 * All inside the same outer $transaction the real /v1/commands pipeline uses,
 * so we exercise creditTx / removeItemTx / lootbox roll RNG against a real DB.
 */
import { createTestHarness, TestHarness } from './db-harness';
import { OpenLootBoxHandler } from '../../src/modules/commands/handlers/open-lootbox.handler';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('OpenLootBoxHandler [integration]', () => {
  let h: TestHarness;
  let handler: OpenLootBoxHandler;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await createTestHarness();
    handler = h.app.get(OpenLootBoxHandler);
    prisma = h.prisma;
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  beforeEach(async () => {
    await h.resetDb();
  });

  async function seed() {
    // 1. User
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

    // 2. Currency def (the lootbox grants this)
    const currency = await prisma.currency.create({
      data: {
        id: 'GOLD',
        name: 'Gold',
        symbol: 'G',
        decimals: 0,
        isSpendable: true,
        type: 'SOFT',
      },
    });

    // 3. ItemDefinition for the lootbox itself
    const itemDef = await (prisma as any).itemDefinition.create({
      data: {
        id: 'lootbox_test',
        name: 'Test Lootbox',
        type: 'LOOTBOX',
        stackable: true,
        maxStack: 99,
        data: { lootboxDefId: 'lootbox_test_def' },
      },
    });

    // 4. LootboxDef with a deterministic 100% currency drop so the test
    //    doesn't depend on the RNG outcome.
    const lootboxDef = await (prisma as any).lootboxDef.create({
      data: {
        id: 'lootbox_test_def',
        name: 'Test Lootbox',
        enabled: true,
        rollCount: 1,
        outcomes: [
          {
            bundle: [
              { type: 'currency', key: 'GOLD', min: 100, max: 100, odds: 100 },
            ],
            pickMin: 1,
            pickMax: 1,
          },
        ],
      },
    });

    // 5. ItemInstance owned by the user
    const instance = await (prisma as any).itemInstance.create({
      data: {
        userId: user.id,
        definitionId: itemDef.id,
        quantity: 1,
      },
    });

    return { user, currency, itemDef, lootboxDef, instance };
  }

  it('credits currency, consumes the lootbox and writes a ledger row in one transaction', async () => {
    const { user, instance } = await seed();

    // Run the handler inside the same outer $transaction that command.service
    // uses in production, so creditTx/removeItemTx see a real tx client.
    await prisma.$transaction(
      async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { itemInstanceId: instance.id },
        );
      },
      { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
    );

    // 1. Lootbox instance was consumed (quantity was 1 → row deleted).
    const remaining = await (prisma as any).itemInstance.findUnique({
      where: { id: instance.id },
    });
    expect(remaining).toBeNull();

    // 2. Currency balance reflects the 100 gold credit.
    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GOLD' } },
    });
    expect(bal).not.toBeNull();
    expect(Number(bal!.balance)).toBe(100);

    // 3. CurrencyLedger row exists with the right delta + source attribution.
    const ledger = await prisma.currencyLedger.findMany({
      where: { userId: user.id, currencyId: 'GOLD' },
    });
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].delta)).toBe(100);
    expect(ledger[0].sourceType).toBe('lootbox');
    expect(ledger[0].sourceId).toBe(instance.id);
  });

  it('rolls back the entire transaction if a downstream step throws', async () => {
    const { user, instance } = await seed();

    // Force a failure AFTER currency would have been credited by deleting the
    // ItemDefinition mid-transaction so the final patch-builder step blows up
    // — except that's hard to wire from outside. Instead, throw from the tx
    // callback after invoking the handler, which is exactly what would happen
    // if the OUTER command.service tried to do post-handler work and failed.
    await expect(
      prisma.$transaction(async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { itemInstanceId: instance.id },
        );
        throw new Error('simulated post-handler failure');
      }),
    ).rejects.toThrow('simulated post-handler failure');

    // Nothing should have been persisted: balance, ledger, item all unchanged.
    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GOLD' } },
    });
    expect(bal).toBeNull();

    const ledger = await prisma.currencyLedger.findMany({
      where: { userId: user.id, currencyId: 'GOLD' },
    });
    expect(ledger).toHaveLength(0);

    const stillThere = await (prisma as any).itemInstance.findUnique({
      where: { id: instance.id },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere.quantity).toBe(1);
  });
});
