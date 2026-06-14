/**
 * Resolves human-readable labels and structured reward blocks for a batch of
 * reward grants.
 *
 * Grants produced by reward-resolver.util.ts only carry IDs; these helpers
 * batch-fetch definition data from the DB so callers don't have to.
 *
 * Handles all three grant types:
 *   - currency: { type:'currency', key: currencyId, amount }
 *   - item:     { type:'item',     key: itemDefId,  amount }
 *   - entity:   { type:'entity',   definitionId,    entityId }
 *
 * Falls back to the raw ID when a definition record cannot be found.
 */

export async function formatGrantSummary(tx: any, grants: any[]): Promise<string> {
  if (!grants.length) return '';

  const itemKeys = [...new Set(grants.filter((g) => g.type === 'item').map((g) => g.key).filter(Boolean))];
  const currencyKeys = [...new Set(grants.filter((g) => g.type === 'currency').map((g) => g.key).filter(Boolean))];
  const entityDefIds = [...new Set(grants.filter((g) => g.type === 'entity').map((g) => g.definitionId).filter(Boolean))];

  const [itemDefs, currencies, entityDefs] = await Promise.all([
    itemKeys.length
      ? tx.itemDefinition.findMany({ where: { key: { in: itemKeys } }, select: { key: true, name: true } })
      : [],
    currencyKeys.length
      ? tx.currency.findMany({ where: { key: { in: currencyKeys } }, select: { key: true, name: true } })
      : [],
    entityDefIds.length
      ? tx.entityDefinition.findMany({ where: { key: { in: entityDefIds } }, select: { key: true, name: true } })
      : [],
  ]);

  const itemNameMap = new Map<string, string>((itemDefs as any[]).map((d) => [d.key, d.name]));
  const currencyNameMap = new Map<string, string>((currencies as any[]).map((d) => [d.key, d.name]));
  const entityNameMap = new Map<string, string>((entityDefs as any[]).map((d) => [d.key, d.name]));

  return grants
    .map((g: any) => {
      if (g.type === 'item') {
        const name = itemNameMap.get(g.key) ?? g.key;
        const qty = g.amount ?? g.qty ?? 1;
        return `${qty}x ${name}`;
      }
      if (g.type === 'currency') {
        const name = currencyNameMap.get(g.key) ?? g.key;
        const qty = g.amount ?? g.qty ?? 1;
        return `${qty}x ${name}`;
      }
      if (g.type === 'entity') {
        const name = entityNameMap.get(g.definitionId) ?? g.definitionId ?? 'Entity';
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
export async function buildGrantsRewardsBlock(
  tx: any,
  grants: any[],
  title = 'Rewards',
): Promise<{ type: 'rewardsList'; title: string; items: any[] } | null> {
  if (!grants.length) return null;

  const itemKeys = [...new Set(grants.filter((g) => g.type === 'item').map((g) => g.key).filter(Boolean))];
  const currencyKeys = [...new Set(grants.filter((g) => g.type === 'currency').map((g) => g.key).filter(Boolean))];
  const entityDefIds = [...new Set(grants.filter((g) => g.type === 'entity').map((g) => g.definitionId).filter(Boolean))];

  const [itemDefs, currencies, entityDefs] = await Promise.all([
    itemKeys.length
      ? tx.itemDefinition.findMany({
          where: { key: { in: itemKeys } },
          select: { key: true, name: true, iconKey: true, rarity: true },
        })
      : [],
    currencyKeys.length
      ? tx.currency.findMany({
          where: { key: { in: currencyKeys } },
          select: { key: true, name: true, iconKey: true },
        })
      : [],
    entityDefIds.length
      ? tx.entityDefinition.findMany({
          where: { key: { in: entityDefIds } },
          select: { key: true, name: true },
        })
      : [],
  ]);

  const itemDefMap = new Map<string, { name: string; iconKey: string | null; rarity: string | null }>(
    (itemDefs as any[]).map((d) => [d.key, { name: d.name, iconKey: d.iconKey ?? null, rarity: d.rarity ?? null }]),
  );
  const currencyMap = new Map<string, { name: string; iconKey: string | null }>(
    (currencies as any[]).map((d) => [d.key, { name: d.name, iconKey: d.iconKey ?? null }]),
  );
  const entityDefMap = new Map<string, string>(
    (entityDefs as any[]).map((d) => [d.key, d.name]),
  );

  const items = grants.map((g: any) => {
    if (g.type === 'item') {
      const def = itemDefMap.get(g.key);
      return {
        name: def?.name ?? g.key ?? 'Item',
        qty: g.amount ?? g.qty ?? 1,
        assetKey: def?.iconKey ?? g.key ?? undefined,
        rarity: def?.rarity ?? undefined,
      };
    }
    if (g.type === 'currency') {
      const def = currencyMap.get(g.key);
      return {
        name: def?.name ?? g.key ?? 'Currency',
        qty: g.amount ?? g.qty ?? 1,
        assetKey: def?.iconKey ?? g.key ?? undefined,
      };
    }
    if (g.type === 'entity') {
      const name = entityDefMap.get(g.definitionId) ?? g.definitionId ?? 'Entity';
      return { name, qty: 1 };
    }
    const qty = g.amount ?? g.qty ?? 1;
    const label = g.key ?? g.type ?? 'Reward';
    return { name: label, qty };
  });

  return { type: 'rewardsList', title, items };
}
