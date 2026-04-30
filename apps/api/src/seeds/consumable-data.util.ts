export type ConsumableEffect = { effectDefId: string; targetType: string };
export type ConsumableData = { effects: ConsumableEffect[] };

const LEGACY_EFFECT_MAP: Record<string, ConsumableEffect> = {
  luck_boost: { effectDefId: 'eff_success_chance', targetType: 'player' },
  xp_boost: { effectDefId: 'eff_xp_scroll', targetType: 'player' },
  speed_boost: { effectDefId: 'eff_speed_boost', targetType: 'player' },
  heal: { effectDefId: 'eff_heal', targetType: 'entity' },
  revive: { effectDefId: 'eff_revival', targetType: 'entity' },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Resolve a stored `consumableData` value to its canonical shape.
 * Seed values win for known item ids — they are the source of truth and
 * unambiguously distinguish e.g. `eff_heal_minor` vs `eff_heal`. For ids
 * with no seed entry, fall back to normalizing the stored shape and
 * mapping legacy `{ effect, ... }` keys onto current EffectDef ids.
 */
export function canonicalConsumableData(
  dbValue: unknown,
  seedValue: ConsumableData | null,
): ConsumableData | null {
  if (seedValue) return seedValue;
  if (!isPlainObject(dbValue)) return null;

  if (Array.isArray(dbValue.effects)) {
    const effects: ConsumableEffect[] = [];
    for (const e of dbValue.effects) {
      if (!isPlainObject(e)) continue;
      const effectDefId = typeof e.effectDefId === 'string' ? e.effectDefId : null;
      if (!effectDefId) continue;
      const tt = typeof e.targetType === 'string' ? e.targetType.toLowerCase() : '';
      if (!tt) continue;
      effects.push({ effectDefId, targetType: tt });
    }
    return { effects };
  }

  if (typeof dbValue.effect === 'string') {
    const mapped = LEGACY_EFFECT_MAP[dbValue.effect];
    if (mapped) return { effects: [{ ...mapped }] };
  }

  return null;
}

export function consumableDataEqual(
  a: ConsumableData | null,
  b: ConsumableData | null,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const aKeys = Object.keys(a);
  if (aKeys.some((k) => k !== 'effects')) return false;
  if (a.effects.length !== b.effects.length) return false;
  for (let i = 0; i < a.effects.length; i++) {
    const ae = a.effects[i];
    const be = b.effects[i];
    if (!ae || !be) return false;
    if (ae.effectDefId !== be.effectDefId) return false;
    if (ae.targetType !== be.targetType) return false;
    const aeKeys = Object.keys(ae);
    if (aeKeys.some((k) => k !== 'effectDefId' && k !== 'targetType')) return false;
  }
  return true;
}

type ItemDefSeed = {
  id: string;
  type: string;
  consumableData?: ConsumableData | null;
};

export function buildSeedConsumableMap(
  seedItemDefs: ItemDefSeed[],
): Map<string, ConsumableData | null> {
  return new Map(
    seedItemDefs
      .filter((d) => d?.type === 'CONSUMABLE')
      .map((d) => [d.id, d.consumableData ?? null]),
  );
}
