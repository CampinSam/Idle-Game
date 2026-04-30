export type ConsumableTargetType = 'player' | 'entity' | 'location' | 'unknown';

function readConsumableData(item: any): any | null {
  return item?.consumableData ?? item?.definition?.consumableData ?? null;
}

/**
 * Classify a consumable item by the kind of target it needs.
 *
 * Reads the canonical `consumableData.effects[]` shape produced by the seed
 * + bootstrap backfill: every effect carries a lowercase `targetType` enum
 * value. If the consumable has effects with mixed target types we return
 * the most specific one in priority order entity > location > player.
 * Returns 'unknown' when the shape can't be parsed — callers should treat
 * that as "don't try to use this potion".
 */
export function getConsumableTargetType(item: any): ConsumableTargetType {
  const cd = readConsumableData(item);
  if (!cd || !Array.isArray(cd.effects)) return 'unknown';

  const seen = new Set<string>();
  for (const e of cd.effects) {
    const tt = typeof e?.targetType === 'string' ? e.targetType : '';
    if (tt) seen.add(tt);
  }

  if (seen.has('entity')) return 'entity';
  if (seen.has('location')) return 'location';
  if (seen.has('player')) return 'player';
  return 'unknown';
}
