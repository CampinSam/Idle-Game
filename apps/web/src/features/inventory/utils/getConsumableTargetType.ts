export type ConsumableTargetType = 'player' | 'entity' | 'location' | 'unknown';

function readConsumableData(item: any): any | null {
  return item?.consumableData ?? item?.definition?.consumableData ?? null;
}

function normalize(tt: unknown): string {
  return (tt ?? '').toString().toLowerCase().trim();
}

/**
 * Classify a consumable item by the kind of target it needs.
 *
 * Looks at `consumableData.effects[]` (the canonical shape) and falls back to
 * `consumableData.targetType` if present. If the consumable has effects with
 * mixed target types we return the most specific one in priority order
 * entity > location > player. Returns 'unknown' when the shape can't be parsed
 * — callers should treat that as "don't try to use this potion".
 */
export function getConsumableTargetType(item: any): ConsumableTargetType {
  const cd = readConsumableData(item);
  if (!cd) return 'unknown';

  const effects = Array.isArray(cd.effects) ? cd.effects : [];
  const seen = new Set<string>();

  for (const e of effects) {
    const tt = normalize(e?.targetType);
    if (tt) seen.add(tt);
  }

  // Fallback: top-level targetType on the consumable data if no per-effect type.
  if (seen.size === 0) {
    const top = normalize(cd.targetType);
    if (top) seen.add(top);
  }

  if (seen.has('entity')) return 'entity';
  if (seen.has('location')) return 'location';
  if (seen.has('player')) return 'player';
  return 'unknown';
}
