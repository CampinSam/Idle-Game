// Human-readable summaries for consumable / active effects.
// Used by the Use-Potion confirmation and result modals so wording stays consistent.
import { serverNow } from '../../../services/clockSync';

export interface EffectDefLite {
  id: string;
  name?: string;
  description?: string | null;
  category?: string;
  valueMode?: string;
  durationModel?: string;
  targetType?: string;
  value?: number | null;
  stats?: Record<string, number> | null;
  trait?: string | null;
  durationSec?: number | null;
  resourceId?: string | null;
}

const STAT_LABELS: Record<string, string> = {
  ATK: 'ATK',
  DEF: 'DEF',
  SPD: 'SPD',
  FOC: 'FOC',
  LCK: 'LCK',
  VIT: 'VIT',
};

const CATEGORY_LABELS: Record<string, string> = {
  stat_boost: 'Stat Boost',
  mission_power: 'Mission Power',
  success_chance: 'Success Chance',
  reward_multiplier: 'Reward Multiplier',
  xp_multiplier: 'XP',
  keeper_xp_multiplier: 'Keeper XP',
  production_rate: 'Production',
  storage_capacity: 'Storage',
  timer_speed: 'Speed',
  trait_grant: 'Trait',
  currency_multiplier: 'Currency',
  cost_discount: 'Discount',
  slot_unlock: 'Slot',
  protection: 'Protection',
  reveal: 'Reveal',
  threat_reduction: 'Threat Reduction',
  craft_luck: 'Crafting Luck',
  worker_efficiency: 'Worker Efficiency',
  cooldown_reduction: 'Cooldown',
  level_up_bonus: 'Level Up Bonus',
};

export function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return `${Math.round(sec)}s`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

function formatStatDelta(key: string, value: number, valueMode?: string): string {
  const label = STAT_LABELS[key] ?? key;
  if (valueMode === 'multiplier') {
    return `×${value} ${label}`;
  }
  if (valueMode === 'percent_add') {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value}% ${label}`;
  }
  // flat_add / flat_set / default
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value} ${label}`;
}

function formatScalarValue(value: number, valueMode?: string): string {
  if (valueMode === 'multiplier') return `×${value}`;
  if (valueMode === 'percent_add') {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value}%`;
  }
  if (valueMode === 'flat_grant') {
    return `+${value}`;
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value}`;
}

/**
 * Returns a short human string for a consumable's effect, e.g.
 *   "+5 ATK to entity for 10 min"
 *   "+500 Player XP"
 *   "×2 XP for 5 min"
 */
export function summarizeEffect(def: EffectDefLite | null | undefined): string {
  if (!def) return 'Unknown effect';
  const parts: string[] = [];

  const stats = def.stats && typeof def.stats === 'object' ? def.stats : null;
  const statEntries = stats
    ? Object.entries(stats).filter(([, v]) => typeof v === 'number' && v !== 0)
    : [];

  if (statEntries.length > 0) {
    parts.push(statEntries.map(([k, v]) => formatStatDelta(k, v as number, def.valueMode)).join(', '));
  } else if (typeof def.value === 'number' && def.value !== 0) {
    const categoryLabel = CATEGORY_LABELS[def.category ?? ''] ?? def.name ?? '';
    parts.push(`${formatScalarValue(def.value, def.valueMode)} ${categoryLabel}`.trim());
  } else if (def.trait) {
    parts.push(`Grants trait: ${def.trait}`);
  } else if (def.name) {
    parts.push(def.name);
  }

  const durationStr = formatDuration(def.durationSec ?? undefined);
  if (durationStr && def.durationModel !== 'instant' && def.durationModel !== 'permanent') {
    parts.push(`for ${durationStr}`);
  } else if (def.durationModel === 'permanent') {
    parts.push('(permanent)');
  }

  return parts.join(' ').trim() || (def.name ?? 'Effect');
}

/**
 * Turn an active-effect record (returned via patches after UseConsumable)
 * into a result-modal line, using the EffectDef for naming/duration context
 * and the active effect's own value/stats/expiresAt for actuals.
 */
export function summarizeActiveEffect(
  active: any,
  def: EffectDefLite | null | undefined,
): string {
  const merged: EffectDefLite = {
    id: active?.effectDefId ?? def?.id ?? '',
    name: def?.name,
    description: def?.description,
    category: active?.category ?? def?.category,
    valueMode: active?.valueMode ?? def?.valueMode,
    durationModel: def?.durationModel,
    targetType: active?.targetType ?? def?.targetType,
    value: typeof active?.value === 'number' ? active.value : def?.value,
    stats: active?.stats ?? def?.stats,
    trait: active?.trait ?? def?.trait,
    durationSec: def?.durationSec ?? null,
    resourceId: def?.resourceId,
  };

  // Prefer expiresAt from the active record for accurate countdown.
  if (active?.expiresAt) {
    const ms = new Date(active.expiresAt).getTime() - serverNow();
    const remainingSec = Math.max(0, Math.round(ms / 1000));
    merged.durationSec = remainingSec;
  }

  return summarizeEffect(merged);
}
