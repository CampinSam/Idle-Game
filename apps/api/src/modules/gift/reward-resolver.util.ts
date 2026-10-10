import { BadRequestException } from '@nestjs/common';
import { generateEntityData, levelUpEntityToLevel } from '../entity/entity-generator.util';
import type { GameRulesService, RequirementContext } from '../game-rules/game-rules.service';
import { validateEntityTraitsShape } from '@derp/shared';

function makeRng() {
  return {
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
  if (!spec.definitionId) {
    throw new BadRequestException(
      'Entity reward spec is missing required field "definitionId"',
    );
  }
  const name = spec.overrides?.name ?? 'New Entity';
  const entityData = await generateEntityData(prisma, userId, spec.definitionId, name);

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
    if (overrides.traits !== undefined) {
      const traitError = validateEntityTraitsShape(overrides.traits);
      if (traitError !== null) {
        throw new BadRequestException(`Invalid entity reward trait override — ${traitError}`);
      }
      entityData.traits = { ...(entityData.traits as any ?? {}), ...(overrides.traits as Record<string, unknown>) };
    }
  }

  const entity = await prisma.entity.create({ data: entityData });
  return { type: 'entity', entityId: entity.id, definitionId: spec.definitionId };
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
  // Normalise: accept an array of entries (canonical) or a bare single-object
  // (legacy stored format — wrapped for backward compat with existing snapshots
  // that were saved before the array migration ran). New GiftDef records and
  // all records processed by the write-boundary migration will always be arrays.
  let entries: any[];
  if (Array.isArray(spec)) {
    entries = spec;
  } else if (spec && typeof spec === 'object' && spec.type) {
    entries = [spec];
  } else {
    return [];
  }

  if (entries.length === 0) return [];

  const grants: any[] = [];

  // Entity grants create entity instances — this is outside the canonical
  // resolveOutcomes pipeline which only knows about currencies, items,
  // XP, flags, unlocks, and bundles. All other types route through the pipeline.
  const entityEntries = entries.filter((e: any) => e?.type === 'entity');
  const outcomeEntries = entries.filter((e: any) => e?.type !== 'entity');

  for (const entry of entityEntries) {
    const grant = await resolveEntityGrant(prisma, userId, entry);
    if (grant) grants.push(grant);
  }

  if (outcomeEntries.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const reqContext: RequirementContext = user
      ? gameRules.buildRequirementContext(user as any)
      : { user: {}, userFlags: {} };
    const { resolved, unlocks: resolvedUnlocks } = await gameRules.resolveOutcomes(outcomeEntries, reqContext, makeRng());

    for (const r of resolved) {
      const granted = await grantOutcomeEntry(
        prisma, currencyService, inventoryService, userId, sourceId,
        r.entry, r.amount ?? 0,
      );
      if (granted) grants.push(granted);
    }
    for (const { key } of resolvedUnlocks) {
      await (prisma as any).userUnlock.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, source: 'gift' },
        update: {},
      });
    }
  }

  return grants;
}
