/**
 * Real-DB integration test for ClaimGiftHandler.
 *
 * Proves the end-to-end gift-claim flow:
 *   1. Reward grants from snapshot.rewardSpec are credited
 *   2. The GiftInstance flips UNCLAIMED → CLAIMED with a claimTxId
 *   3. A GiftClaimTx row records the grants for audit
 *   4. A downstream throw rolls EVERY write back
 */
import { createTestHarness, TestHarness } from './db-harness';
import { ClaimGiftHandler } from '../../src/modules/commands/handlers/claim-gift.handler';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ClaimGiftHandler [integration]', () => {
  let h: TestHarness;
  let handler: ClaimGiftHandler;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await createTestHarness();
    handler = h.app.get(ClaimGiftHandler);
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

    const giftDef = await (prisma as any).giftDef.create({
      data: {
        id: 'gift_test',
        name: 'Test Gift',
        instant: true,
        enabled: true,
        rewardSpec: { type: 'currency', key: 'GEMS', min: 25, max: 25, odds: 100 },
      },
    });

    const gift = await (prisma as any).giftInstance.create({
      data: {
        userId: user.id,
        giftDefId: giftDef.id,
        giftDefVersion: 1,
        status: 'UNCLAIMED',
        // ClaimGiftHandler → GiftService.claimGift reads snapshot.rewardSpec
        // and snapshot.instant. Single outcome entry shape (see
        // reward-resolver.util.ts), 100% odds for deterministic 25 GEMS.
        snapshot: {
          instant: true,
          rewardSpec: { type: 'currency', key: 'GEMS', min: 25, max: 25, odds: 100 },
          presentation: { title: 'A Gift!' },
        },
      },
    });

    return { user, giftDef, gift };
  }

  it('credits the gift rewards, marks the gift CLAIMED and writes a GiftClaimTx — all atomically', async () => {
    const { user, gift } = await seed();

    await prisma.$transaction(
      async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { giftId: gift.id },
        );
      },
      { maxWait: 10000, timeout: 60000, isolationLevel: 'ReadCommitted' },
    );

    // Gift status flipped + claimTxId set
    const updatedGift = await (prisma as any).giftInstance.findUnique({
      where: { id: gift.id },
    });
    expect(updatedGift.status).toBe('CLAIMED');
    expect(updatedGift.claimTxId).not.toBeNull();

    // GiftClaimTx row exists
    const claimTx = await (prisma as any).giftClaimTx.findUnique({
      where: { giftId: gift.id },
    });
    expect(claimTx).not.toBeNull();
    expect(claimTx.status).toBe('completed');

    // Currency credited
    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(Number(bal!.balance)).toBe(25);

    const ledger = await prisma.currencyLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].delta)).toBe(25);
  });

  it('rolls back if a downstream step throws — gift stays UNCLAIMED and rewards are not granted', async () => {
    const { user, gift } = await seed();

    await expect(
      prisma.$transaction(async (tx) => {
        await handler.execute(
          { userId: user.id, tx: tx as any },
          { giftId: gift.id },
        );
        throw new Error('simulated post-handler failure');
      }),
    ).rejects.toThrow('simulated post-handler failure');

    const stillUnclaimed = await (prisma as any).giftInstance.findUnique({
      where: { id: gift.id },
    });
    expect(stillUnclaimed.status).toBe('UNCLAIMED');
    expect(stillUnclaimed.claimTxId).toBeNull();

    const claimTx = await (prisma as any).giftClaimTx.findUnique({
      where: { giftId: gift.id },
    });
    expect(claimTx).toBeNull();

    const bal = await prisma.userCurrencyBalance.findUnique({
      where: { userId_currencyId: { userId: user.id, currencyId: 'GEMS' } },
    });
    expect(bal).toBeNull();

    const ledger = await prisma.currencyLedger.findMany({ where: { userId: user.id } });
    expect(ledger).toHaveLength(0);
  });
});
