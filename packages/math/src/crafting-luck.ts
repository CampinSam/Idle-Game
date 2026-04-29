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

export const workshopLuckFloor = (workshopLevel: number): number => {
  if (workshopLevel >= 3) return 25;
  if (workshopLevel >= 2) return 10;
  return 0;
};

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
