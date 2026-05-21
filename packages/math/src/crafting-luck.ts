import { EntityStats } from '@derp/shared';
import { SeededRng } from './rng';

export interface CraftingBonuses {
  relic: number;
  worker: number;
  room: number;
}

export const calculateCraftingLuck = (
  stats: EntityStats,
  bonuses: CraftingBonuses = { relic: 0, worker: 0, room: 0 },
): number => {
  return (
    stats.FOC * 0.5 +
    stats.LCK * 0.3 +
    bonuses.relic +
    bonuses.worker +
    bonuses.room
  );
};

export const effectiveCL = (...clValues: number[]): number => {
  if (clValues.length === 0) return 0;
  return Math.sqrt(clValues.reduce((sum, v) => sum + v * v, 0));
};

const SIGMA = 22;
const EPSILON = 0.005;

export const QUALITY_TIERS: Array<{ key: string; label: string; center: number }> = [
  { key: 'common',    label: 'Common',    center: 15  },
  { key: 'uncommon',  label: 'Uncommon',  center: 45  },
  { key: 'scare',     label: 'Scare',     center: 75  },
  { key: 'rare',      label: 'Rare',      center: 105 },
  { key: 'epic',      label: 'Epic',      center: 135 },
  { key: 'mythic',    label: 'Mythic',    center: 165 },
  { key: 'legendary', label: 'Legendary', center: 195 },
];

export interface QualityProbability {
  key: string;
  label: string;
  probability: number;
}

export const rollPassFail = (power: number, difficulty: number, rng: SeededRng): boolean => {
  if (difficulty <= 0) return true;
  const passRate = power / (power + difficulty);
  return rng.next() < passRate;
};

export const qualityProbabilities = (
  cl: number,
  centerOverrides: Partial<Record<string, number>> = {},
  sigma: number = SIGMA,
): QualityProbability[] => {
  const weights = QUALITY_TIERS.map((t) => {
    const center = centerOverrides[t.key] ?? t.center;
    return Math.exp(-Math.pow(center - cl, 2) / (2 * sigma * sigma)) + EPSILON;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return QUALITY_TIERS.map((t, i) => ({
    key: t.key,
    label: t.label,
    probability: weights[i] / sum,
  }));
};

/**
 * Collapses raw quality probabilities so that tiers with no rewards fold their
 * probability into the nearest preceding tier that does have rewards.
 * If no prior tier has rewards yet, the probability is deferred and folded into
 * the first tier that does. Tiers with no rewards are omitted from the result.
 */
export const collapseQualityProbabilities = (
  probs: QualityProbability[],
  tierHasRewards: (key: string) => boolean,
): QualityProbability[] => {
  const accumulated: Record<string, number> = {};
  let lastDefinedKey: string | null = null;
  let deferred = 0;

  for (const prob of probs) {
    if (tierHasRewards(prob.key)) {
      accumulated[prob.key] = (accumulated[prob.key] ?? 0) + prob.probability + deferred;
      deferred = 0;
      lastDefinedKey = prob.key;
    } else if (lastDefinedKey !== null) {
      accumulated[lastDefinedKey] = (accumulated[lastDefinedKey] ?? 0) + prob.probability;
    } else {
      deferred += prob.probability;
    }
  }

  if (deferred > 0) {
    const firstWithRewards = probs.find((p) => tierHasRewards(p.key));
    if (firstWithRewards) {
      accumulated[firstWithRewards.key] = (accumulated[firstWithRewards.key] ?? 0) + deferred;
    }
  }

  return probs
    .filter((p) => tierHasRewards(p.key))
    .map((p) => ({ ...p, probability: accumulated[p.key] ?? 0 }));
};

export const rollQualityFromCl = (
  cl: number,
  rng: SeededRng,
  centerOverrides: Partial<Record<string, number>> = {},
  sigma: number = SIGMA,
): { key: string; label: string; probabilities: QualityProbability[] } => {
  const probs = qualityProbabilities(cl, centerOverrides, sigma);
  const r = rng.next();
  let acc = 0;
  for (const p of probs) {
    acc += p.probability;
    if (r <= acc) return { key: p.key, label: p.label, probabilities: probs };
  }
  const last = probs[probs.length - 1];
  return { key: last.key, label: last.label, probabilities: probs };
};

export interface WorkshopTierPerks {
  tier: number;
  slots: number;
  timerMultiplier: number;
  luckFloor: number;
  recipeTierCap: number;
}

export const WORKSHOP_TIER_PERKS: readonly WorkshopTierPerks[] = [
  { tier: 1, slots: 1, timerMultiplier: 1.0, luckFloor: 0, recipeTierCap: 1 },
  { tier: 2, slots: 2, timerMultiplier: 0.9, luckFloor: 10, recipeTierCap: 2 },
  { tier: 3, slots: 3, timerMultiplier: 0.8, luckFloor: 25, recipeTierCap: 3 },
] as const;

export const workshopTierPerks = (workshopLevel: number): WorkshopTierPerks => {
  const clamped = Math.max(1, Math.min(WORKSHOP_TIER_PERKS.length, Math.floor(workshopLevel || 1)));
  return WORKSHOP_TIER_PERKS[clamped - 1];
};

export const workshopLuckFloor = (workshopLevel: number): number =>
  workshopTierPerks(workshopLevel).luckFloor;

export const workshopParallelSlots = (workshopLevel: number): number =>
  workshopTierPerks(workshopLevel).slots;

export const workshopTimerMultiplier = (workshopLevel: number): number =>
  workshopTierPerks(workshopLevel).timerMultiplier;

export const workshopRecipeTierCap = (workshopLevel: number): number =>
  workshopTierPerks(workshopLevel).recipeTierCap;
