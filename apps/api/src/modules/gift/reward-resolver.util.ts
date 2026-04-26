import { generateEntityData } from '../entity/entity-generator.util';

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

function pickWeightedFlat(pool: any[], count: number): any[] {
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

/**
 * Convert an outcome-shaped entry (as found in BundleDef.bundle / mission outcomes:
 *   { type: 'currency'|'item', key, min, max, odds? } or nested bundles)
 * into a RewardSpec entry that gift's resolveRewardSpec understands.
 * Returns null for unsupported entry shapes.
 */
function outcomeEntryToRewardSpec(entry: any): any | null {
  if (!entry) return null;
  if (entry.type === 'bundle_ref') {
    // Preserve inline overrides on the nested ref so downstream resolution
    // honors the same odds/pick semantics regardless of nesting depth.
    const out: any = { type: 'bundle_ref', bundleDefId: entry.bundleDefId };
    if (entry.odds !== undefined) out.odds = entry.odds;
    if (entry.pickMin !== undefined) out.pickMin = entry.pickMin;
    if (entry.pickMax !== undefined) out.pickMax = entry.pickMax;
    return out;
  }
  if (Array.isArray(entry.bundle)) {
    const inner = entry.bundle
      .map(outcomeEntryToRewardSpec)
      .filter((e: any) => e !== null);
    return { type: 'bundle', entries: inner };
  }
  if (entry.type === 'currency') {
    return { type: 'currency', currencyId: entry.key, amount: rollRange(entry.min, entry.max) };
  }
  if (entry.type === 'item') {
    return { type: 'item', itemDefId: entry.key, qty: rollRange(entry.min, entry.max) };
  }
  return null;
}

export async function resolveRewardSpec(
  prisma: any,
  currencyService: any,
  inventoryService: any,
  userId: string,
  spec: any,
  sourceId: string,
  visitedBundles: Set<string> = new Set(),
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
            prisma,
            currencyService,
            inventoryService,
            userId,
            entry,
            sourceId,
            visitedBundles,
          );
          grants.push(...subGrants);
        }
      }
      break;
    }

    case 'bundle_ref': {
      if (!spec.bundleDefId || !prisma?.bundleDef) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing' });
        break;
      }
      // Cycle guard: if this bundle id is already on the recursion stack, abort
      // to prevent infinite recursion / DoS from a cyclic BundleDef graph.
      if (visitedBundles.has(spec.bundleDefId)) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'cycle_detected' });
        break;
      }
      const def: any = await prisma.bundleDef.findUnique({ where: { id: spec.bundleDefId } });
      if (!def || def.enabled === false || !Array.isArray(def.bundle)) {
        grants.push({ type: 'bundle_ref', bundleDefId: spec.bundleDefId, status: 'missing_or_disabled' });
        break;
      }
      // Bundle-level odds: spec.odds (inline override) wins over def.odds.
      const bundleOdds = spec.odds ?? def.odds;
      if (!rollOdds(bundleOdds)) break;

      // Resolve pickMin/pickMax (inline override wins). Undefined means "grant all".
      const pickMin = spec.pickMin ?? def.pickMin;
      const pickMax = spec.pickMax ?? def.pickMax;

      // Convert outcome-shaped entries to RewardSpec entries (filtering nulls).
      const converted: Array<{ outcome: any; reward: any }> = def.bundle
        .map((o: any) => ({ outcome: o, reward: outcomeEntryToRewardSpec(o) }))
        .filter((p: any) => p.reward !== null);

      // Decide which to grant: pick-mode (subset by odds-weighted sampling) or grant-all
      // mode (every entry, each gated by its own odds roll), matching game-rules semantics.
      let selected: any[];
      if (pickMin !== undefined || pickMax !== undefined) {
        const lo = Math.max(0, Number(pickMin ?? 1));
        const hi = Math.max(lo, Number(pickMax ?? pickMin ?? 1));
        const count = Math.min(
          converted.length,
          lo + (hi > lo ? Math.floor(Math.random() * (hi - lo + 1)) : 0),
        );
        selected = pickWeightedFlat(
          converted.map(p => ({ ...p, odds: p.outcome?.odds })),
          count,
        );
      } else {
        // Grant-all mode: gate each entry by its odds, EXCEPT bundle_ref entries
        // whose odds are consumed once inside the recursive bundle-level roll.
        // This avoids double-application of odds across nesting levels and matches
        // game-rules' single-roll semantics.
        selected = converted.filter(p =>
          p.outcome?.type === 'bundle_ref' ? true : rollOdds(p.outcome?.odds),
        );
      }

      // Mark this bundle id as visited for the recursive sub-calls (only along this
      // branch — Set is shared but we remove on the way out so siblings aren't blocked).
      visitedBundles.add(spec.bundleDefId);
      try {
        for (const pair of selected) {
          const subGrants = await resolveRewardSpec(
            prisma,
            currencyService,
            inventoryService,
            userId,
            pair.reward,
            sourceId,
            visitedBundles,
          );
          grants.push(...subGrants);
        }
      } finally {
        visitedBundles.delete(spec.bundleDefId);
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

    case 'cosmetic':
    default:
      grants.push({ type: spec.type, status: 'not_implemented' });
      break;
  }

  return grants;
}
