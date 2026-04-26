import { generateEntityData } from '../entity/entity-generator.util';
import type { GameRulesService, RequirementContext } from '../game-rules/game-rules.service';

function makeRng() {
  return {
    // Matches GameRulesService.rollOdds contract: `p` is a 0..1 fraction.
    chance: (p: number) => Math.random() < p,
    nextInt: (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min,
  };
}

async function grantOutcomeEntry(
  prisma: any,
  currencyService: any,
  inventoryService: any,
  userId: string,
  sourceId: string,
  entry: any,
  amount: number,
): Promise<any | null> {
  if (!entry?.type) return null;
  if (entry.type === 'currency') {
    await currencyService.creditTx(prisma, {
      userId, currencyId: entry.key, amount,
      reason: 'Reward', sourceType: 'reward', sourceId,
    });
    return { type: 'currency', currencyId: entry.key, amount };
  }
  if (entry.type === 'item') {
    await inventoryService.addItemTx(prisma, {
      userId, itemId: entry.key, quantity: amount,
      reason: 'Reward', sourceType: 'reward', sourceId,
    });
    return { type: 'item', itemDefId: entry.key, qty: amount };
  }
  if (entry.type === 'entity') {
    const definitionId = entry.definitionId ?? entry.key;
    const name = entry.name ?? 'New Entity';
    const data = await generateEntityData(prisma, userId, definitionId, name);
    const created = await prisma.entity.create({ data });
    return { type: 'entity', entityId: created.id, definitionId };
  }
  return null;
}

export async function resolveRewardSpec(
  prisma: any,
  currencyService: any,
  inventoryService: any,
  gameRules: GameRulesService,
  userId: string,
  spec: any,
  sourceId: string,
): Promise<any[]> {
  if (!spec || !spec.type) return [];

  const grants: any[] = [];

  switch (spec.type) {
    case 'currency': {
      await currencyService.creditTx(prisma, {
        userId,
        currencyId: spec.currencyId,
        amount: spec.amount,
        reason: 'Reward',
        sourceType: 'reward',
        sourceId,
      });
      grants.push({ type: 'currency', currencyId: spec.currencyId, amount: spec.amount });
      break;
    }

    case 'item': {
      await inventoryService.addItemTx(prisma, {
        userId,
        itemId: spec.itemDefId,
        quantity: spec.qty,
        reason: 'Reward',
        sourceType: 'reward',
        sourceId,
      });
      grants.push({ type: 'item', itemDefId: spec.itemDefId, qty: spec.qty });
      break;
    }

    case 'entity': {
      const name = spec.overrides?.name ?? 'New Entity';
      const entityData = await generateEntityData(prisma, userId, spec.definitionId, name);

      if (spec.overrides) {
        const overrides = spec.overrides;
        if (overrides.level != null) {
          entityData.progression = {
            ...(entityData.progression as any ?? {}),
            level: overrides.level,
            xp: 0,
          };
        }
        if (overrides.stats) {
          entityData.stats = { ...(entityData.stats as any ?? {}), ...overrides.stats };
        }
        if (overrides.traits && typeof overrides.traits === 'object') {
          entityData.traits = { ...(entityData.traits as any ?? {}), ...overrides.traits };
        }
      }

      const entity = await prisma.entity.create({ data: entityData });
      grants.push({ type: 'entity', entityId: entity.id, definitionId: spec.definitionId });
      break;
    }

    case 'bundle': {
      if (Array.isArray(spec.entries)) {
        for (const entry of spec.entries) {
          const subGrants = await resolveRewardSpec(
            prisma, currencyService, inventoryService, gameRules, userId, entry, sourceId,
          );
          grants.push(...subGrants);
        }
      }
      break;
    }

    case 'bundle_ref': {
      if (!gameRules || !spec.bundleDefId) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing' });
        break;
      }
      const refSpec: any = { type: 'bundle_ref', bundleDefId: spec.bundleDefId };
      if (spec.odds !== undefined) refSpec.odds = spec.odds;
      if (spec.pickMin !== undefined) refSpec.pickMin = spec.pickMin;
      if (spec.pickMax !== undefined) refSpec.pickMax = spec.pickMax;
      if (spec.requirements !== undefined) refSpec.requirements = spec.requirements;

      // Run expansion first so missing/disabled refs get the standard warn log
      // (uniform with every other reward path), then check the def for an
      // explicit structured status marker.
      const defs = await gameRules.loadBundleDefs([refSpec]);
      gameRules.expandBundleRefs([refSpec], defs);
      const def = defs.get(spec.bundleDefId);
      if (!def || def.enabled === false || !Array.isArray(def.bundle)) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing_or_disabled' });
        break;
      }

      // Use the canonical shared resolver with a real claim-time player context
      // so per-entry `requirements` (flags, keeper level, etc.) gate correctly.
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const reqContext: RequirementContext = user
        ? gameRules.buildRequirementContext(user as any)
        : { user: {}, userFlags: {} };
      const { resolved } = await gameRules.resolveOutcomesAsync([refSpec], reqContext, makeRng());

      for (const r of resolved) {
        const granted = await grantOutcomeEntry(
          prisma, currencyService, inventoryService, userId, sourceId,
          r.entry, r.amount ?? 0,
        );
        if (granted) grants.push(granted);
      }
      break;
    }

    case 'lootTable': {
      if (spec.lootboxDefId) {
        const qty = spec.qty ?? 1;
        await inventoryService.addItemTx(prisma, {
          userId,
          itemId: spec.lootboxDefId,
          quantity: qty,
          reason: 'Reward (lootbox)',
          sourceType: 'reward',
          sourceId,
        });
        grants.push({ type: 'lootTable', lootboxDefId: spec.lootboxDefId, qty });
      }
      break;
    }

    default:
      grants.push({ type: 'unknown', specType: spec.type, status: 'not_implemented' });
      break;
  }

  return grants;
}
