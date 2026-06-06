/**
 * seed-test-account.ts
 *
 * Populates a test account with a large mix of Derp Birds and Perps (varied
 * archetypes), powered entities covering every canonical power type and scope,
 * and generous stacks of materials, consumables, and lootbox items.
 *
 * Purpose: end-to-end testing of the effects and powers systems without
 * needing to manually configure things through the admin panel.
 *
 * Usage:
 *   cd apps/api && npx tsx src/seeds/seed-test-account.ts
 *   # Or from the repo root:
 *   pnpm seed:test-account
 *
 * Configuration: update TEST_USER_EMAIL at the top of this file.
 */

import { PrismaClient } from '@prisma/client';
import { generateEntityData } from '../modules/entity/entity-generator.util';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const TEST_USER_EMAIL = 'test@example.com';

const DERP_BIRD_COUNT = 15;
const PERP_COUNT = 10;

const MATERIAL_QTY = 50;
const CONSUMABLE_QTY = 30;
const LOOTBOX_QTY = 10;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const POWER_DEFS = [
  { powerDefId: 'global_tick_boost', name: 'Global Tick Boost', key: 'tick_speed_boost', scope: 'global' },
  { powerDefId: 'keeper_xp_boost', name: 'Keeper XP Boost', key: 'keeper_xp_boost', scope: 'player' },
  { powerDefId: 'entity_xp_boost', name: 'Entity XP Boost', key: 'entity_xp_boost', scope: 'entity' },
  { powerDefId: 'mission_power_boost', name: 'Mission Power Boost', key: 'mission_power_boost', scope: 'player' },
  { powerDefId: 'mission_duration_reduction', name: 'Mission Duration Reduction', key: 'mission_duration_reduction', scope: 'player' },
  { powerDefId: 'crafting_duration_reduction', name: 'Crafting Duration Reduction', key: 'crafting_duration_reduction', scope: 'player' },
  { powerDefId: 'building_build_duration_reduction', name: 'Building Construction Boost', key: 'building_build_duration_reduction', scope: 'player' },
  { powerDefId: 'building_upgrade_duration_reduction', name: 'Building Upgrade Boost', key: 'building_upgrade_duration_reduction', scope: 'player' },
  { powerDefId: 'injury_recovery_boost', name: 'Injury Recovery Boost', key: 'injury_recovery_boost', scope: 'player' },
] as const;

const POWERED_ENTITY_NAMES: Record<string, string> = {
  global_tick_boost: 'Chrono',
  keeper_xp_boost: 'Lorekeeper',
  entity_xp_boost: 'Sage',
  mission_power_boost: 'Vanguard',
  mission_duration_reduction: 'Swiftclaw',
  crafting_duration_reduction: 'Forgebound',
  building_build_duration_reduction: 'Stonepact',
  building_upgrade_duration_reduction: 'Ironwill',
  injury_recovery_boost: 'Mender',
};

const DERP_BIRD_NAMES = [
  'Sparky', 'Derpicus', 'Fluffbert', 'Squawks', 'Wobbles',
  'Blinky', 'Zigzag', 'Noodle', 'Chompy', 'Beaky',
  'Ruffles', 'Glimmer', 'Tater', 'Doodle', 'Bonkers',
];

const PERP_NAMES = [
  'Zyx', 'Krix', 'Vorp', 'Snark', 'Glitch',
  'Nexus', 'Void', 'Static', 'Pulse', 'Echo',
];

const LOOTBOX_ITEM_DEFS = [
  {
    id: 'item_lootbox_common',
    name: 'Common Chest',
    description: 'A common chest filled with useful materials and consumables.',
    rarity: 'COMMON',
    lootboxDefId: 'lootbox_common_chest',
  },
  {
    id: 'item_lootbox_rare',
    name: 'Rare Crate',
    description: 'A rare crate containing premium materials and hard-to-find items.',
    rarity: 'RARE',
    lootboxDefId: 'lootbox_rare_crate',
  },
] as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function grantStackableItem(
  prisma: PrismaClient,
  userId: string,
  itemDefId: string,
  targetQty: number,
  maxStack: number | null,
): Promise<{ granted: number; skipped: boolean }> {
  const existing = await (prisma as any).itemInstance.findFirst({
    where: { userId, definitionId: itemDefId },
  });
  const currentQty: number = existing?.quantity ?? 0;
  if (currentQty >= targetQty) return { granted: 0, skipped: true };

  const rawNewQty = targetQty;
  const cappedNewQty = maxStack !== null ? Math.min(rawNewQty, maxStack) : rawNewQty;
  const delta = cappedNewQty - currentQty;
  if (delta <= 0) return { granted: 0, skipped: true };

  await (prisma as any).$transaction(async (tx: any) => {
    if (existing) {
      await tx.itemInstance.update({
        where: { id: existing.id },
        data: { quantity: cappedNewQty },
      });
    } else {
      await tx.itemInstance.create({
        data: { userId, definitionId: itemDefId, quantity: cappedNewQty },
      });
    }
    await tx.itemLedger.create({
      data: {
        userId,
        itemId: itemDefId,
        delta: BigInt(delta),
        reason: 'Test account seed',
        sourceType: 'admin',
        sourceId: 'seed-test-account',
        metadata: {},
      },
    });
  });

  return { granted: delta, skipped: false };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function main() {
  // 1. Find test user
  const user = await (prisma as any).user.findFirst({ where: { email: TEST_USER_EMAIL } });
  if (!user) {
    throw new Error(
      `Test user "${TEST_USER_EMAIL}" not found.\n` +
      `Update TEST_USER_EMAIL at the top of apps/api/src/seeds/seed-test-account.ts.`,
    );
  }
  const userId: string = user.id;
  console.log(`\n  Account : ${user.email} (${userId})\n`);

  // ── 2. Unpowered entities ──────────────────────────────────────────────────
  const existingCount: number = await (prisma as any).entity.count({ where: { ownerUserId: userId } });
  let entitiesCreated = 0;

  if (existingCount > 20) {
    console.log(`[entities] Skipped — account already owns ${existingCount} entities (threshold: 20)\n`);
  } else {
    process.stdout.write('[entities] Creating Derp Birds');
    for (let i = 0; i < DERP_BIRD_COUNT; i++) {
      const name = DERP_BIRD_NAMES[i % DERP_BIRD_NAMES.length];
      const data = await generateEntityData(prisma as any, userId, 'derp_bird', name);
      await (prisma as any).entity.create({ data });
      process.stdout.write('.');
      entitiesCreated++;
    }

    process.stdout.write(`\n[entities] Creating Perps`);
    for (let i = 0; i < PERP_COUNT; i++) {
      const name = PERP_NAMES[i % PERP_NAMES.length];
      const data = await generateEntityData(prisma as any, userId, 'perp', name);
      await (prisma as any).entity.create({ data });
      process.stdout.write('.');
      entitiesCreated++;
    }
    console.log(`\n[entities] ✓ ${entitiesCreated} unpowered entities created\n`);
  }

  // ── 3. Powered entities ────────────────────────────────────────────────────
  console.log('[powered]  Creating powered entities (one per power type):');
  let poweredCreated = 0;
  let poweredSkipped = 0;

  for (let i = 0; i < POWER_DEFS.length; i++) {
    const pd = POWER_DEFS[i];
    const assetId = `TEST:seed_power_${pd.powerDefId}`;

    const existing = await (prisma as any).entity.findUnique({ where: { nftAssetId: assetId } });
    if (existing) {
      console.log(`[powered]  ⏭  ${pd.powerDefId} — entity already exists`);
      poweredSkipped++;
      continue;
    }

    const defId = i % 2 === 0 ? 'derp_bird' : 'perp';
    const displayName = POWERED_ENTITY_NAMES[pd.powerDefId] ?? pd.name;
    const entityData = await generateEntityData(prisma as any, userId, defId, displayName);

    await (prisma as any).entity.create({
      data: { ...entityData, nftAssetId: assetId },
    });

    // Merge test asset ID into entity definition's rules.uniques (non-destructive)
    const defRecord = await (prisma as any).entityDefinition.findUnique({
      where: { id: defId },
      select: { rules: true },
    });
    const currentRules = (defRecord?.rules as Record<string, unknown>) ?? {};
    const currentUniques = (currentRules.uniques as Record<string, unknown>) ?? {};
    const mergedUniques = {
      ...currentUniques,
      [assetId]: {
        powers: [{
          powerDefId: pd.powerDefId,
          name: pd.name,
          key: pd.key,
          value: 10,
          valueMode: 'percent_add',
          durationMinutes: 60,
          dailyLimit: 1,
        }],
      },
    };
    await (prisma as any).entityDefinition.update({
      where: { id: defId },
      data: { rules: { ...currentRules, uniques: mergedUniques } },
    });

    console.log(`[powered]  ✓ ${displayName} [${defId}] — ${pd.name} (scope: ${pd.scope})`);
    poweredCreated++;
  }
  console.log(`[powered]  ${poweredCreated} created, ${poweredSkipped} skipped\n`);

  // ── 4. Lootbox item definitions ────────────────────────────────────────────
  console.log('[lootboxes] Upserting lootbox item definitions:');
  for (const def of LOOTBOX_ITEM_DEFS) {
    const lbDef = await (prisma as any).lootboxDef.findUnique({ where: { id: def.lootboxDefId } });
    if (!lbDef) {
      console.log(`[lootboxes] ⚠  LootboxDef "${def.lootboxDefId}" not found in DB — run definition seed first`);
      continue;
    }
    await (prisma as any).itemDefinition.upsert({
      where: { id: def.id },
      update: { name: def.name, description: def.description },
      create: {
        id: def.id,
        type: 'LOOTBOX',
        rarity: def.rarity,
        name: def.name,
        description: def.description,
        iconKey: null,
        category: 'MISC',
        groups: [],
        tags: [],
        stackable: true,
        maxStack: 99,
        uniqueInstance: false,
        lootboxDefId: def.lootboxDefId,
      },
    });
    console.log(`[lootboxes] ✓ ${def.id} (${def.name})`);
  }
  console.log();

  // ── 5. Grant items ─────────────────────────────────────────────────────────
  console.log('[items]    Granting items (MATERIAL / CONSUMABLE / LOOTBOX):');

  const allItemDefs = await (prisma as any).itemDefinition.findMany({
    where: { type: { in: ['MATERIAL', 'CONSUMABLE', 'LOOTBOX'] } },
    orderBy: [{ type: 'asc' }, { id: 'asc' }],
  });

  let itemsGranted = 0;
  let itemsSkipped = 0;

  for (const itemDef of allItemDefs) {
    const targetQty =
      itemDef.type === 'MATERIAL' ? MATERIAL_QTY :
      itemDef.type === 'CONSUMABLE' ? CONSUMABLE_QTY :
      LOOTBOX_QTY;

    if (itemDef.stackable) {
      const { granted, skipped } = await grantStackableItem(
        prisma,
        userId,
        itemDef.id,
        targetQty,
        itemDef.maxStack,
      );
      if (skipped) {
        itemsSkipped++;
      } else {
        console.log(`[items]    ✓ +${granted} ${itemDef.name} (${itemDef.id})`);
        itemsGranted++;
      }
    } else {
      // Non-stackable LOOTBOX items would be unusual, but handle defensively
      const existingInstances: number = await (prisma as any).itemInstance.count({
        where: { userId, definitionId: itemDef.id },
      });
      const needed = targetQty - existingInstances;
      if (needed <= 0) {
        itemsSkipped++;
        continue;
      }
      await (prisma as any).$transaction(async (tx: any) => {
        for (let i = 0; i < needed; i++) {
          await tx.itemInstance.create({
            data: { userId, definitionId: itemDef.id, quantity: 1 },
          });
        }
        await tx.itemLedger.create({
          data: {
            userId,
            itemId: itemDef.id,
            delta: BigInt(needed),
            reason: 'Test account seed',
            sourceType: 'admin',
            sourceId: 'seed-test-account',
            metadata: {},
          },
        });
      });
      console.log(`[items]    ✓ +${needed} ${itemDef.name} (${itemDef.id}) [non-stackable]`);
      itemsGranted++;
    }
  }
  console.log(`[items]    ${itemsGranted} item types topped up, ${itemsSkipped} already at target\n`);

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  const totalEntities = entitiesCreated + poweredCreated;
  console.log('┌────────────────────────────────────────────────────┐');
  console.log('│         seed-test-account — complete               │');
  console.log('├────────────────────────────────────────────────────┤');
  console.log(`│  Unpowered entities created : ${String(entitiesCreated).padEnd(20)}│`);
  console.log(`│  Powered entities created   : ${String(poweredCreated).padEnd(20)}│`);
  console.log(`│  Total entities             : ${String(totalEntities).padEnd(20)}│`);
  console.log(`│  Item types granted         : ${String(itemsGranted).padEnd(20)}│`);
  console.log('└────────────────────────────────────────────────────┘');
}

main()
  .catch((err) => {
    console.error('\n[seed-test-account] FAILED:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
