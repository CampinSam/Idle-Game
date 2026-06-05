import {
  EffectCategory,
  EffectValueMode,
  ResolvedModifier,
  EffectStatMap,
  EffectSelection,
  EffectTargetContext,
  emptyResolvedModifier,
} from '@derp/shared';

export interface ActiveEffectRow {
  id?: string;
  effectDefId: string;
  category: string;
  valueMode: string;
  value: number;
  stats?: EffectStatMap | Record<string, number> | null;
  trait?: string | null;
  currentStacks: number;
  /** Present on global power rows; used by matchesSelection() to filter scope/agg/filter. */
  selection?: EffectSelection | null;
  /** Player who activated the power; used for agg: 'self' checks. */
  triggeredByUserId?: string | null;
}

/**
 * Evaluates whether a global power's selection matches the current resolution context.
 *
 * Rules:
 * - `null` selection → always matches (backward compat for records without selection).
 * - `scope` → gates which target domain the power applies to:
 *   - `global`   → applies to all target types (default, always passes scope check)
 *   - `player`   → applies only when resolving for a player target
 *   - `entity`   → applies only when resolving for an entity target
 *   - `location` → applies only when resolving for a location target
 *   When `targetType` is not provided, scope is not checked (safe default).
 * - `agg: 'self'` → only matches when userId equals triggeredByUserId.
 *   If triggeredByUserId is null the check is skipped (admin-created powers with no trigger owner).
 * - `filter` predicates → evaluated against `context` when present;
 *   skipped (treated as matching) when context is absent (safe default).
 */
export function matchesSelection(
  selection: EffectSelection | null | undefined,
  userId: string,
  triggeredByUserId: string | null | undefined,
  context?: EffectTargetContext,
  targetType?: string,
): boolean {
  if (!selection) return true;

  const { scope, agg, filter } = selection;

  // Scope check: if scope is not 'global', it must match the resolution targetType.
  // When targetType is absent (caller hasn't provided it), scope check is skipped.
  if (scope && scope !== 'global' && targetType) {
    if (scope !== targetType) return false;
  }

  if (agg === 'self' && triggeredByUserId != null && triggeredByUserId !== userId) {
    return false;
  }

  // Identity filter: filter.userId is checked against the resolution userId (always available).
  // filter.entityId / filter.locationId are checked against context.targetId when context is present;
  // when context is absent the check is skipped (safe default — effect applies).
  if (filter) {
    if (filter.userId && filter.userId !== userId) return false;

    if (context) {
      if (filter.entityId && context.targetId !== filter.entityId) return false;
      if (filter.locationId && context.targetId !== filter.locationId) return false;
    }

    if (context) {
      if (filter.archetype && context.archetype !== filter.archetype) return false;

      if (filter.rarity && context.rarity != null) {
        const rarities = Array.isArray(filter.rarity) ? filter.rarity : [filter.rarity];
        if (!rarities.includes(context.rarity)) return false;
      }

      if (filter.traits && filter.traits.length > 0 && context.traits) {
        if (!filter.traits.every((t) => context.traits!.includes(t))) return false;
      }

      if (filter.minLevel !== undefined && context.level !== undefined && context.level < filter.minLevel) {
        return false;
      }

      if (filter.maxLevel !== undefined && context.level !== undefined && context.level > filter.maxLevel) {
        return false;
      }
    }
  }

  return true;
}

export function resolveEffects(
  effects: ActiveEffectRow[],
  category: EffectCategory,
  cap?: number,
): ResolvedModifier {
  const mod = emptyResolvedModifier();

  const matching = effects.filter((e) => e.category === category);
  if (matching.length === 0) return mod;

  for (const effect of matching) {
    const stacks = effect.currentStacks;
    const statMap: EffectStatMap = (effect.stats && typeof effect.stats === 'object') ? effect.stats : {};

    if (effect.id) {
      mod.sources.push({ effectDefId: effect.effectDefId, activeEffectId: effect.id });
    }

    switch (effect.valueMode) {
      case EffectValueMode.FLAT_ADD:
        mod.flatAdd += effect.value * stacks;
        applyStatAdd(mod.statFlatAdds, statMap, stacks);
        break;
      case EffectValueMode.PERCENT_ADD:
        mod.percentAdd += effect.value * stacks;
        applyStatAdd(mod.statPercentAdds, statMap, stacks);
        break;
      case EffectValueMode.MULTIPLIER:
        mod.multiplier *= Math.pow(effect.value || 1, stacks);
        applyStatMultiply(mod.statMultipliers, statMap, stacks);
        break;
      case EffectValueMode.FLAT_SET:
        mod.flatAdd = effect.value * stacks;
        break;
      case EffectValueMode.BPS:
        mod.percentAdd += (effect.value * stacks) / 100;
        break;
      case EffectValueMode.FLAT_GRANT:
        mod.grants.push({ type: category, id: effect.effectDefId, amount: effect.value * stacks });
        break;
      case EffectValueMode.RANDOM_RANGE:
        mod.flatAdd += effect.value * stacks;
        break;
    }

    if (effect.trait) {
      mod.traits.push(effect.trait);
    }
  }

  if (cap !== undefined) {
    mod.flatAdd = Math.min(mod.flatAdd, cap);
    mod.percentAdd = Math.min(mod.percentAdd, cap);
  }

  return mod;
}

type VisibleStatKey = Exclude<keyof EffectStatMap, 'RND'>;
const VISIBLE_STAT_KEYS: VisibleStatKey[] = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

function applyStatAdd(target: EffectStatMap, source: EffectStatMap, stacks: number) {
  for (const key of VISIBLE_STAT_KEYS) {
    const s = source[key];
    if (typeof s !== 'number') continue;
    const t = target[key] ?? 0;
    target[key] = t + s * stacks;
  }
  // Safety net: RND must be resolved before effects are stored or applied.
  // If it still appears here something went wrong upstream — log and drop it
  // rather than re-randomizing (which would produce non-deterministic reads).
  if (source.RND !== undefined && source.RND !== 0) {
    console.warn('[EffectResolver] Unresolved RND stat encountered in applyStatAdd — dropping value. Ensure resolveRnd() is called before effect application.');
  }
}

function applyStatMultiply(target: EffectStatMap, source: EffectStatMap, stacks: number) {
  for (const key of VISIBLE_STAT_KEYS) {
    const s = source[key];
    if (typeof s !== 'number') continue;
    const base = target[key] ?? 1;
    target[key] = base * Math.pow(s, stacks);
  }
}
