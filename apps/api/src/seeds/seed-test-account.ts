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
  { powerDefId: 'global_tick_boost',                  name: 'Global Tick Boost',           key: 'tick_speed_boost',                    scope: 'global'   },
  { powerDefId: 'keeper_xp_boost',                    name: 'Keeper XP Boost',             key: 'keeper_xp_boost',                     scope: 'player'   },
  { powerDefId: 'entity_xp_boost',                    name: 'Entity XP Boost',             key: 'entity_xp_boost',                     scope: 'entity'   },
  { powerDefId: 'mission_power_boost',                name: 'Mission Power Boost',          key: 'mission_power_boost',                 scope: 'player'   },
  { powerDefId: 'mission_duration_reduction',         name: 'Mission Duration Reduction',   key: 'mission_duration_reduction',          scope: 'player'   },
  { powerDefId: 'crafting_duration_reduction',        name: 'Crafting Duration Reduction',  key: 'crafting_duration_reduction',         scope: 'player'   },
  { powerDefId: 'building_build_duration_reduction',  name: 'Building Construction Boost',  key: 'building_build_duration_reduction',   scope: 'player'   },
  { powerDefId: 'building_upgrade_duration_reduction',name: 'Building Upgrade Boost',       key: 'building_upgrade_duration_reduction', scope: 'player'   },
  { powerDefId: 'injury_recovery_boost',              name: 'Injury Recovery Boost',        key: 'injury_recovery_boost',               scope: 'player'   },
  // Extra entry with scope 'location' so all four scopes (global/player/entity/location) are exercised.
  // Reuses the entity_xp_boost powerDef but overrides scope to 'location' via PowerRef.scope.
  { powerDefId: 'entity_xp_boost',                   name: 'Location XP Boost (test)',     key: 'entity_xp_boost_location_test',       scope: 'location' },
] as const;

// Keyed by `${powerDefId}:${scope}` for powered entities with duplicate powerDefId
const POWERED_ENTITY_NAMES: Record<string, string> = {
  'global_tick_boost:global': 'Chrono',
  'keeper_xp_boost:player': 'Lorekeeper',
  'entity_xp_boost:entity': 'Sage',
  'mission_power_boost:player': 'Vanguard',
  'mission_duration_reduction:player': 'Swiftclaw',
  'crafting_duration_reduction:player': 'Forgebound',
  'building_build_duration_reduction:player': 'Stonepact',
  'building_upgrade_duration_reduction:player': 'Ironwill',
  'injury_recovery_boost:player': 'Mender',
  'entity_xp_boost:location': 'Geomancer',
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

const LOOTBOX_ITEM_DEF_IDS = [
  'item_lootbox_common',
  'item_lootbox_rare',
] as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function grantStackableItem(
  prisma: PrismaClient,
  userId: string,
  itemDefId: string,
  targetQty: number,
  maxStack: number | null,
): Promise<{ granted: number; skipped: boolean }> {
  // Collect ALL existing stacks so we handle items where maxStack < targetQty
  const allInstances: Array<{ id: string; quantity: number }> = await (prisma as any).itemInstance.findMany({
    where: { userId, definitionId: itemDefId },
  });
  const totalCurrentQty = allInstances.reduce((sum, inst) => sum + inst.quantity, 0);
  if (totalCurrentQty >= targetQty) return { granted: 0, skipped: true };

  const delta = targetQty - totalCurrentQty;
  let remaining = delta;

  // Phase 1: top up existing stacks that aren't full
  const stackUpdates: Array<{ id: string; newQty: number }> = [];
  for (const inst of allInstances) {
    if (remaining <= 0) break;
    const capacity = maxStack !== null ? maxStack - inst.quantity : Infinity;
    if (capacity > 0) {
      const add = Math.min(remaining, capacity);
      stackUpdates.push({ id: inst.id, newQty: inst.quantity + add });
      remaining -= add;
    }
  }

  // Phase 2: create new stacks for any remainder
  const newStackQtys: number[] = [];
  while (remaining > 0) {
    const stackQty = maxStack !== null ? Math.min(remaining, maxStack) : remaining;
    newStackQtys.push(stackQty);
    remaining -= stackQty;
  }

  await (prisma as any).$transaction(async (tx: any) => {
    for (const u of stackUpdates) {
      await tx.itemInstance.update({ where: { id: u.id }, data: { quantity: u.newQty } });
    }
    for (const qty of newStackQtys) {
      await tx.itemInstance.create({ data: { userId, definitionId: itemDefId, quantity: qty } });
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

  const REDUCTION_POWER_DEFS = new Set([
    'mission_duration_reduction',
    'crafting_duration_reduction',
    'building_build_duration_reduction',
    'building_upgrade_duration_reduction',
  ]);

  for (let i = 0; i < POWER_DEFS.length; i++) {
    const pd = POWER_DEFS[i];
    // Include scope in the asset ID so entries with the same powerDefId but
    // different scopes (e.g. entity_xp_boost:entity vs entity_xp_boost:location)
    // are stored as distinct entity + uniques records.
    const assetId = `TEST:seed_power_${pd.powerDefId}_${pd.scope}`;

    const defId = i % 2 === 0 ? 'derp_bird' : 'perp';
    const nameKey = `${pd.powerDefId}:${pd.scope}`;
    const displayName = POWERED_ENTITY_NAMES[nameKey] ?? pd.name;

    const existing = await (prisma as any).entity.findUnique({ where: { nftAssetId: assetId } });
    if (existing) {
      console.log(`[powered]  ⏭  ${nameKey} — entity already exists, reconciling uniques...`);
      poweredSkipped++;
    } else {
      const entityData = await generateEntityData(prisma as any, userId, defId, displayName);
      await (prisma as any).entity.create({
        data: { ...entityData, nftAssetId: assetId },
      });
      poweredCreated++;
    }

    // Always reconcile: ensure this asset ID + explicit scope override is
    // present in entityDefinition.rules.uniques (runs whether entity was just
    // created or already existed from a prior run).
    const defRecord = await (prisma as any).entityDefinition.findUnique({
      where: { id: defId },
      select: { rules: true },
    });
    const currentRules = (defRecord?.rules as Record<string, unknown>) ?? {};
    const currentUniques = (currentRules.uniques as Record<string, unknown>) ?? {};
    const powerValue = REDUCTION_POWER_DEFS.has(pd.powerDefId) ? -10 : 10;
    const mergedUniques = {
      ...currentUniques,
      [assetId]: {
        powers: [{
          powerDefId: pd.powerDefId,
          name: pd.name,
          key: pd.key,
          scope: pd.scope,   // explicit override — never rely on PowerDef.defaultScope
          value: powerValue,
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
  }
  console.log(`[powered]  ${poweredCreated} created, ${poweredSkipped} reconciled (already existed)\n`);

  // ── 4. Verify lootbox item definitions ────────────────────────────────────
  // These definitions live in item-defs.json and are seeded by the canonical
  // definition seed (seedDefinitions). We only verify they are present so a
  // missing definition seed is caught early rather than silently skipped.
  console.log('[lootboxes] Verifying lootbox item definitions exist:');
  for (const id of LOOTBOX_ITEM_DEF_IDS) {
    const existing = await (prisma as any).itemDefinition.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(
        `ItemDefinition "${id}" not found. Run the definition seed first (pnpm prisma db seed).`,
      );
    }
    console.log(`[lootboxes] ✓ ${id} exists`);
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
