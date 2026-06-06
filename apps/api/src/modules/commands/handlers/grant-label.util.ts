/**
 * Resolves human-readable labels for a batch of reward grants.
 *
 * Grants produced by reward-resolver.util.ts only carry IDs; this helper
 * batch-fetches definition names from the DB and returns a formatted string
 * like "2x Iron Ore, 1x Gold Coin" suitable for use in modal body text.
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
      ? tx.itemDefinition.findMany({ where: { id: { in: itemKeys } }, select: { id: true, name: true } })
      : [],
    currencyKeys.length
      ? tx.currency.findMany({ where: { id: { in: currencyKeys } }, select: { id: true, name: true } })
      : [],
    entityDefIds.length
      ? tx.entityDefinition.findMany({ where: { id: { in: entityDefIds } }, select: { id: true, name: true } })
      : [],
  ]);

  const itemNameMap = new Map<string, string>((itemDefs as any[]).map((d) => [d.id, d.name]));
  const currencyNameMap = new Map<string, string>((currencies as any[]).map((d) => [d.id, d.name]));
  const entityNameMap = new Map<string, string>((entityDefs as any[]).map((d) => [d.id, d.name]));

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
