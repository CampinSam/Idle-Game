import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await (prisma as any).itemDefinition.findMany({
    where: { dustingData: { not: null } },
    select: { id: true, dustingData: true },
  });

  console.log(`Found ${rows.length} ItemDefinition row(s) with dustingData.`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const data = row.dustingData as any;
    if (!data) continue;

    if (data.timer && typeof data.timer === 'object' && typeof data.timer.duration === 'number') {
      skipped++;
      continue;
    }

    const legacyDuration: number = typeof data.durationTicks === 'number' ? data.durationTicks : 0;
    const legacyScaling: string = data.quantityScaling ?? 'ALL_AT_ONCE';
    const legacySkipCost = data.skipCost ?? null;

    const timer: Record<string, any> = {
      duration: legacyDuration,
      boostable: true,
      skipable: !!legacySkipCost,
      skip_cost: [],
      skip_type: 'absolute',
    };

    if (legacySkipCost && legacySkipCost.type && legacySkipCost.id && legacySkipCost.amount) {
      timer.skip_cost = [
        {
          type: legacySkipCost.type,
          id: legacySkipCost.id,
          amount: legacySkipCost.amount,
        },
      ];
    }

    const timerScaling = legacyScaling === 'LINEAR' ? 'per_unit' : 'flat';

    const next: Record<string, any> = { ...data, timer, timerScaling };
    delete next.durationTicks;
    delete next.quantityScaling;
    delete next.skipCost;

    await (prisma as any).itemDefinition.update({
      where: { id: row.id },
      data: { dustingData: next },
    });

    migrated++;
    console.log(`  Migrated ${row.id}: duration=${legacyDuration}, timerScaling=${timerScaling}, skipable=${timer.skipable}`);
  }

  console.log(`\nDone — migrated: ${migrated}, already up-to-date (skipped): ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
