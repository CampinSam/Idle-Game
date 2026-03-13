import {
  EffectCategory,
  EffectValueMode,
  ResolvedModifier,
  EffectStatMap,
  emptyResolvedModifier,
} from '@derp/shared';

export interface ActiveEffectRow {
  id: string;
  effectDefId: string;
  category: string;
  valueMode: string;
  value: number;
  stats?: any;
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
    const effectiveValue = effect.value * effect.currentStacks;
    const statMap: EffectStatMap = (effect.stats && typeof effect.stats === 'object') ? effect.stats : {};

    mod.sources.push({ effectDefId: effect.effectDefId, activeEffectId: effect.id });

    switch (effect.valueMode) {
      case EffectValueMode.FLAT_ADD:
        mod.flatAdd += effectiveValue;
        applyStatAdd(mod.statFlatAdds, statMap, effect.currentStacks);
        break;
      case EffectValueMode.PERCENT_ADD:
        mod.percentAdd += effectiveValue;
        applyStatAdd(mod.statPercentAdds, statMap, effect.currentStacks);
        break;
      case EffectValueMode.MULTIPLIER:
        mod.multiplier *= effectiveValue || 1;
        applyStatMultiply(mod.statMultipliers, statMap, effect.currentStacks);
        break;
      case EffectValueMode.FLAT_SET:
        mod.flatAdd = effectiveValue;
        break;
      case EffectValueMode.BPS:
        mod.percentAdd += effectiveValue / 100;
        break;
      case EffectValueMode.FLAT_GRANT:
        mod.grants.push({ type: category, id: effect.effectDefId, amount: effectiveValue });
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

function applyStatAdd(target: EffectStatMap, source: EffectStatMap, stacks: number) {
  const keys: (keyof EffectStatMap)[] = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];
  for (const key of keys) {
    if (source[key] !== undefined) {
      target[key] = (target[key] ?? 0) + source[key]! * stacks;
    }
  }
}

function applyStatMultiply(target: EffectStatMap, source: EffectStatMap, stacks: number) {
  const keys: (keyof EffectStatMap)[] = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'];
  for (const key of keys) {
    if (source[key] !== undefined) {
      const base = target[key] ?? 1;
      target[key] = base * Math.pow(source[key]!, stacks);
    }
  }
}
