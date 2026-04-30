import { EntityStats } from '@derp/shared';
import { ANTI_WHALE_CAPS } from '@derp/shared';
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
  const cl =
    stats.FOC * 0.5 +
    stats.LCK * 0.3 +
    bonuses.relic +
    bonuses.worker +
    bonuses.room;

  return Math.min(cl, ANTI_WHALE_CAPS.craftingLuckCap);
};

export const QUALITY_TIERS: Array<{ key: string; label: string; minCl: number; center: number }> = [
  { key: 'common', label: 'Common', minCl: 0, center: 15 },
  { key: 'uncommon', label: 'Uncommon', minCl: 30, center: 45 },
  { key: 'rare', label: 'Rare', minCl: 60, center: 80 },
  { key: 'epic', label: 'Epic', minCl: 100, center: 125 },
];

export interface QualityProbability {
  key: string;
  label: string;
  probability: number;
}

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

export const qualityProbabilities = (cl: number): QualityProbability[] => {
  const sigma = 22;
  const weights = QUALITY_TIERS.map((t) => Math.exp(-Math.pow(t.center - cl, 2) / (2 * sigma * sigma)));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return QUALITY_TIERS.map((t, i) => ({
    key: t.key,
    label: t.label,
    probability: weights[i] / sum,
  }));
};

export const rollQualityFromCl = (cl: number, rng: SeededRng): { key: string; label: string; probabilities: QualityProbability[] } => {
  const probs = qualityProbabilities(cl);
  const r = rng.next();
  let acc = 0;
  for (const p of probs) {
    acc += p.probability;
    if (r <= acc) return { key: p.key, label: p.label, probabilities: probs };
  }
  const last = probs[probs.length - 1];
  return { key: last.key, label: last.label, probabilities: probs };
};
