import {
  EffectCategory,
  EffectValueMode,
  ResolvedModifier,
  EffectStatMap,
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

const VISIBLE_STAT_KEYS: (keyof EffectStatMap)[] = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];

function applyStatAdd(target: EffectStatMap, source: EffectStatMap, stacks: number) {
  for (const key of VISIBLE_STAT_KEYS) {
    if (source[key] !== undefined) {
      target[key] = (target[key] ?? 0) + source[key]! * stacks;
    }
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
    if (source[key] !== undefined) {
      const base = target[key] ?? 1;
      target[key] = base * Math.pow(source[key]!, stacks);
    }
  }
}
