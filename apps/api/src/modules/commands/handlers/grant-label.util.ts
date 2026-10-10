/**
 * Resolves human-readable labels and structured reward blocks for a batch of
 * reward grants.
 *
 * Grants produced by reward-resolver.util.ts only carry IDs; these helpers
 * resolve definition data from the in-memory DefinitionCacheService so
 * no DB round-trips are needed at grant-display time.
 *
 * Handles all three grant types:
 *   - currency: { type:'currency', key: currencyId, amount }
 *   - item:     { type:'item',     key: itemDefId,  amount }
 *   - entity:   { type:'entity',   definitionId,    entityId }
 *
 * Falls back to the raw ID when a definition record cannot be found.
 */

import { DefinitionCacheService } from '../../definition-cache/definition-cache.service';

export function formatGrantSummary(grants: any[], cache: DefinitionCacheService): string {
  if (!grants.length) return '';

  return grants
    .map((g: any) => {
      if (g.type === 'item') {
        const def = g.key ? cache.get('itemDef', g.key) : null;
        const name = def?.name ?? g.key;
        const qty = g.amount ?? g.qty ?? 1;
        return `${qty}x ${name}`;
      }
      if (g.type === 'currency') {
        const def = g.key ? cache.get('currency', g.key) : null;
        const name = def?.name ?? g.key;
        const qty = g.amount ?? g.qty ?? 1;
        return `${qty}x ${name}`;
      }
      if (g.type === 'entity') {
        const def = g.definitionId ? cache.get('entityDefinition', g.definitionId) : null;
        const name = def?.name ?? g.definitionId ?? 'Entity';
        return `1x ${name}`;
      }
      const qty = g.amount ?? g.qty ?? 1;
      const label = g.key ?? g.currencyId ?? g.itemDefId ?? g.type;
      return `${qty}x ${label}`;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Converts a grants array into a `rewardsList` modal body block, matching the
 * same visual format used by mission/crafting/building result modals.
 *
 * Returns `null` when grants is empty so callers can substitute a fallback
 * plain-text block.
 */
export function buildGrantsRewardsBlock(
  grants: any[],
  cache: DefinitionCacheService,
  title = 'Rewards',
): { type: 'rewardsList'; title: string; items: any[] } | null {
  if (!grants.length) return null;

  const items = grants.map((g: any) => {
    if (g.type === 'item') {
      const def = g.key ? cache.get('itemDef', g.key) : null;
      return {
        name: def?.name ?? g.key ?? 'Item',
        qty: g.amount ?? g.qty ?? 1,
        assetKey: def?.iconKey ?? g.key ?? undefined,
        rarity: def?.rarity ?? undefined,
      };
    }
    if (g.type === 'currency') {
      const def = g.key ? cache.get('currency', g.key) : null;
      return {
        name: def?.name ?? g.key ?? 'Currency',
        qty: g.amount ?? g.qty ?? 1,
        assetKey: def?.iconKey ?? g.key ?? undefined,
      };
    }
    if (g.type === 'entity') {
      const def = g.definitionId ? cache.get('entityDefinition', g.definitionId) : null;
      const name = def?.name ?? g.definitionId ?? 'Entity';
      return { name, qty: 1 };
    }
    const qty = g.amount ?? g.qty ?? 1;
    const label = g.key ?? g.type ?? 'Reward';
    return { name: label, qty };
  });

  return { type: 'rewardsList', title, items };
}
