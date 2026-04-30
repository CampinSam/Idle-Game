/**
 * Stat helpers used by entity views. Only presentation-layer math lives here
 * (already mirrored from server formulas in the @derp/math package).
 */
import { getPowerScore } from '@derp/math';

export function normalizeStats(stats: any): Record<string, number> {
  const s = stats || {};
  return {
    ATK: s.ATK ?? s.atk ?? 0,
    DEF: s.DEF ?? s.def ?? 0,
    SPD: s.SPD ?? s.spd ?? 0,
    FOC: s.FOC ?? s.foc ?? 0,
    LCK: s.LCK ?? s.lck ?? 0,
    VIT: s.VIT ?? s.vit ?? 0,
  };
}

export function getEntityPower(entity: any): number {
  return getPowerScore(normalizeStats(entity?.stats));
}

/** Mission Power. Equivalent to power score using normalised stat keys. */
export function getEntityMP(entity: any): number {
  return getEntityPower(entity);
}

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}

export function getStarRating(entity: any): number {
  const power = getEntityPower(entity);
  if (power >= 800) return 5;
  if (power >= 500) return 4;
  if (power >= 300) return 3.5;
  if (power >= 200) return 3;
  return 2.5;
}
