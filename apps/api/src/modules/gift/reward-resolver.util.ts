import { generateEntityData } from '../entity/entity-generator.util';
import type { GameRulesService } from '../game-rules/game-rules.service';

function rollRange(min: any, max: any): number {
  const lo = Number(min ?? 0);
  const hi = Number(max ?? min ?? 0);
  if (!isFinite(lo) || !isFinite(hi)) return 0;
  if (hi <= lo) return Math.max(0, lo);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollOdds(odds: any): boolean {
  if (odds === undefined || odds === null) return true;
  const pct = Number(odds);
  if (!isFinite(pct) || pct >= 100) return true;
  if (pct <= 0) return false;
  return Math.random() * 100 < pct;
}

function pickWeighted(pool: any[], count: number): any[] {
  const remaining = [...pool];
  const picks: any[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum: number, e: any) => sum + Number(e?.odds ?? 100), 0);
    if (totalWeight <= 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      picks.push(remaining[idx]);
      remaining.splice(idx, 1);
      continue;
    }
    let r = Math.random() * totalWeight;
    let pickedIdx = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      r -= Number(remaining[j]?.odds ?? 100);
      if (r <= 0) { pickedIdx = j; break; }
    }
    picks.push(remaining[pickedIdx]);
    remaining.splice(pickedIdx, 1);
  }
  return picks;
}

function outcomeEntryToRewardSpec(entry: any): any | null {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.type === 'currency') {
    return { type: 'currency', currencyId: entry.key, amount: rollRange(entry.min, entry.max) };
  }
  if (entry.type === 'item') {
    return { type: 'item', itemDefId: entry.key, qty: rollRange(entry.min, entry.max) };
  }
  return null;
}

async function processOutcomeBundle(
  prisma: any,
  currencyService: any,
  inventoryService: any,
  gameRules: GameRulesService,
  userId: string,
  bundleEntry: any,
  sourceId: string,
): Promise<any[]> {
  const grants: any[] = [];
  if (!bundleEntry || !Array.isArray(bundleEntry.bundle)) return grants;
  if (!rollOdds(bundleEntry.odds)) return grants;

  const pickMin = bundleEntry.pickMin;
  const pickMax = bundleEntry.pickMax;

  let selected: any[];
  if (pickMin !== undefined || pickMax !== undefined) {
    const lo = Math.max(0, Number(pickMin ?? 1));
    const hi = Math.max(lo, Number(pickMax ?? pickMin ?? 1));
    const count = Math.min(
      bundleEntry.bundle.length,
      lo + (hi > lo ? Math.floor(Math.random() * (hi - lo + 1)) : 0),
    );
    selected = pickWeighted(bundleEntry.bundle, count);
  } else {
    selected = bundleEntry.bundle.filter((o: any) =>
      Array.isArray(o?.bundle) ? true : rollOdds(o?.odds),
    );
  }

  for (const o of selected) {
    if (Array.isArray(o?.bundle)) {
      const sub = await processOutcomeBundle(
        prisma, currencyService, inventoryService, gameRules, userId, o, sourceId,
      );
      grants.push(...sub);
      continue;
    }
    const reward = outcomeEntryToRewardSpec(o);
    if (!reward) continue;
    const sub = await resolveRewardSpec(
      prisma, currencyService, inventoryService, gameRules, userId, reward, sourceId,
    );
    grants.push(...sub);
  }
  return grants;
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

      const defs = await gameRules.loadBundleDefs([refSpec]);
      const def = defs.get(spec.bundleDefId);
      if (!def || def.enabled === false || !Array.isArray(def.bundle)) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing_or_disabled' });
        break;
      }
      const expandedArr = gameRules.expandBundleRefs([refSpec], defs);
      const expanded = Array.isArray(expandedArr) ? expandedArr[0] : null;
      if (!expanded || !Array.isArray(expanded.bundle)) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing_or_disabled' });
        break;
      }
      const subGrants = await processOutcomeBundle(
        prisma, currencyService, inventoryService, gameRules, userId, expanded, sourceId,
      );
      grants.push(...subGrants);
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
      break;
  }

  return grants;
}
