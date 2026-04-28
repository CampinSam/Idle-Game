import { generateEntityData, levelUpEntityToLevel } from '../entity/entity-generator.util';
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
  if (!entry?.type || amount <= 0) return null;
  if (entry.type === 'currency') {
    if (!entry.key) return null;
    await currencyService.creditTx(prisma, {
      userId, currencyId: entry.key, amount,
      reason: 'Reward', sourceType: 'reward', sourceId,
    });
    return { type: 'currency', key: entry.key, amount };
  }
  if (entry.type === 'item') {
    if (!entry.key) return null;
    await inventoryService.addItemTx(prisma, {
      userId, itemId: entry.key, quantity: amount,
      reason: 'Reward', sourceType: 'reward', sourceId,
    });
    return { type: 'item', key: entry.key, amount };
  }
  if (entry.type === 'entity') {
    return resolveEntityGrant(prisma, userId, entry);
  }
  return null;
}

async function resolveEntityGrant(prisma: any, userId: string, spec: any): Promise<any> {
  const definitionId = spec.definitionId ?? spec.key;
  const name = spec.overrides?.name ?? spec.name ?? 'New Entity';
  const entityData = await generateEntityData(prisma, userId, definitionId, name);

  if (spec.overrides) {
    const overrides = spec.overrides;
    if (overrides.level != null && overrides.level > 1) {
      // Documented bypass of EntityService.addEntityXp:
      // we are seeding a freshly-created entity at a higher starting
      // level, not awarding XP. Run the canonical weighted level-up
      // helper (level - 1) times so the stat profile and levelHistory
      // match what an organically-leveled entity would have, keeping
      // backfill + downstream consumers consistent.
      const baseStats = (entityData.stats as any) ?? {};
      const { stats: leveledStats, levelHistory } = levelUpEntityToLevel(baseStats, overrides.level);
      entityData.stats = leveledStats;
      entityData.progression = {
        ...(entityData.progression as any ?? {}),
        level: overrides.level,
        xp: 0,
        levelHistory,
      };
    } else if (overrides.level === 1) {
      entityData.progression = {
        ...(entityData.progression as any ?? {}),
        level: 1,
        xp: 0,
        levelHistory: [],
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
  return { type: 'entity', entityId: entity.id, definitionId };
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

  // `entity` and `lootTable` have side effects outside the canonical outcome
  // resolver (entity creation / lootbox-item grant), so they stay as one-offs.
  if (spec.type === 'entity') {
    return [await resolveEntityGrant(prisma, userId, spec)];
  }
  if (spec.type === 'lootTable') {
    if (!spec.lootboxDefId) return [];
    const qty = spec.qty ?? 1;
    await inventoryService.addItemTx(prisma, {
      userId, itemId: spec.lootboxDefId, quantity: qty,
      reason: 'Reward (lootbox)', sourceType: 'reward', sourceId,
    });
    return [{ type: 'lootTable', lootboxDefId: spec.lootboxDefId, qty }];
  }

  // Pre-check bundle_ref so gift telemetry can record an explicit
  // "missing_or_disabled" status grant alongside the resolver's warn log.
  if (spec.type === 'bundle_ref') {
    if (!spec.bundleDefId) {
      return [{ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing' }];
    }
    const defs = await gameRules.loadBundleDefs([spec]);
    const def = defs.get(spec.bundleDefId);
    if (!def || def.enabled === false || !Array.isArray(def.bundle)) {
      return [{ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing_or_disabled' }];
    }
  }

  // Everything else (`currency`, `item`, `bundle`, `bundle_ref`) routes
  // through the canonical resolver so all reward paths share field names
  // (`key`, `bundle`), bundle/bundle_ref semantics, requirement gating,
  // and weighted/odds rolls.
  if (
    spec.type !== 'currency' &&
    spec.type !== 'item' &&
    spec.type !== 'bundle' &&
    spec.type !== 'bundle_ref'
  ) {
    return [{ type: 'unknown', specType: spec.type, status: 'not_implemented' }];
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const reqContext: RequirementContext = user
    ? gameRules.buildRequirementContext(user as any)
    : { user: {}, userFlags: {} };
  const { resolved } = await gameRules.resolveOutcomesAsync([spec], reqContext, makeRng());

  const grants: any[] = [];
  for (const r of resolved) {
    const granted = await grantOutcomeEntry(
      prisma, currencyService, inventoryService, userId, sourceId,
      r.entry, r.amount ?? 0,
    );
    if (granted) grants.push(granted);
  }
  return grants;
}
