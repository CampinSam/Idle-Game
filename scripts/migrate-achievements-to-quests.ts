/**
 * ONE-TIME MIGRATION: Achievement → Quest unification (Task #601)
 *
 * STATUS: Already ran successfully on 2026-05-19. Kept for documentation
 * and for safe re-run against a production DB that still has the old tables.
 *
 * What it does:
 * - Copies all `achievement_defs` rows into `quest_defs` (category='achievement')
 * - Copies all `achievement_instances` rows into `quest_instances`
 *
 * Uses raw SQL so it works even after the Prisma models were dropped from
 * schema.prisma (Prisma client no longer has achievementDef/achievementInstance
 * delegates). It is fully idempotent — uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Run with:
 *   node_modules/.bin/tsx scripts/migrate-achievements-to-quests.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS "exists"
  `;
  return rows[0]?.exists ?? false;
}

async function main() {
  console.log('Starting achievement → quest migration...');

  const defsExist = await tableExists('achievement_defs');
  if (!defsExist) {
    console.log('achievement_defs table does not exist — migration already complete or fresh install.');
    return;
  }

  // Copy achievement defs → quest_defs with category='achievement'
  const defResult = await prisma.$executeRaw`
    INSERT INTO quest_defs (
      id, name, description, category, tier,
      objectives, "rewardSpec", "permanentEffectSpec",
      requirements, enabled, "sortOrder", "createdAt", "updatedAt"
    )
    SELECT
      id,
      name,
      description,
      'achievement' AS category,
      COALESCE(tier, 1),
      objectives,
      "rewardSpec",
      "permanentEffectSpec",
      requirements,
      enabled,
      "sortOrder",
      "createdAt",
      "updatedAt"
    FROM achievement_defs
    ON CONFLICT (id) DO NOTHING
  `;
  console.log(`Inserted ${defResult} quest_defs rows (skipped existing)`);

  // Copy achievement instances → quest_instances
  const instResult = await prisma.$executeRaw`
    INSERT INTO quest_instances (
      id, "userId", "questDefId", progress, status,
      "startedAt", "completedAt", "claimedAt"
    )
    SELECT
      id,
      "userId",
      "achievementDefId" AS "questDefId",
      progress,
      status,
      "startedAt",
      "completedAt",
      "claimedAt"
    FROM achievement_instances
    ON CONFLICT DO NOTHING
  `;
  console.log(`Inserted ${instResult} quest_instances rows (skipped existing)`);

  console.log('Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
