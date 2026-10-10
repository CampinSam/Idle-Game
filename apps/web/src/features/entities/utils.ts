/**
 * Stat helpers used by entity views. Only presentation-layer math lives here
 * (already mirrored from server formulas in the @derp/math package).
 */
import { getPowerScore, HIDDEN_STATS } from '@derp/math';
import type { TraitPrimitive } from '@derp/shared';

export function normalizeStats(stats: any): Record<string, number> {
  const s = stats || {};
  const result: Record<string, number> = {
    ATK: s.ATK ?? s.atk ?? 0,
    DEF: s.DEF ?? s.def ?? 0,
    SPD: s.SPD ?? s.spd ?? 0,
    FOC: s.FOC ?? s.foc ?? 0,
    LCK: s.LCK ?? s.lck ?? 0,
    VIT: s.VIT ?? s.vit ?? 0,
  };
  // Defensively strip any hidden stat keys that should never reach the UI.
  for (const hidden of HIDDEN_STATS) {
    delete result[hidden];
  }
  return result;
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

/** Friendly capitalized label for an entity status (e.g. "working" → "Crafting"). */
export function getEntityStatusLabel(status: string | undefined): string {
  switch ((status || 'idle').toLowerCase()) {
    case 'idle':    return 'Idle';
    case 'mission': return 'Mission';
    case 'working': return 'Crafting';
    case 'injured': return 'Injured';
    default:        return (status || 'Idle').charAt(0).toUpperCase() + (status || 'Idle').slice(1).toLowerCase();
  }
}

export function getStarRating(entity: any): number {
  const power = getEntityPower(entity);
  if (power >= 800) return 5;
  if (power >= 500) return 4;
  if (power >= 300) return 3.5;
  if (power >= 200) return 3;
  return 2.5;
}

/**
 * Derive up to 3 short label pills for the entity header:
 *  1. Hybrid vs single-archetype spread
 *  2. "[Archetype]-leaning" when one archetype appears most (≥2 times) in a mixed set
 *  3. Role based on the highest stat (Support, Attacker, etc.)
 */
export function getTraitCategoryTags(entity: any): string[] {
  const traits: Record<string, TraitPrimitive> = entity?.traits || {};

  const counts: Record<string, number> = {};
  for (const val of Object.values(traits)) {
    if (val !== null && val !== undefined && typeof val === 'string') {
      counts[val] = (counts[val] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const distinctCount = sorted.length;
  const tags: string[] = [];

  if (distinctCount >= 3) {
    tags.push('Hybrid');
  }

  if (sorted.length > 0) {
    const [topName, topCount] = sorted[0];
    if (topCount >= 2) {
      tags.push(`${topName}-leaning`);
    }
  }

  const stats = normalizeStats(entity?.stats);
  const statEntries = Object.entries(stats) as [string, number][];
  if (statEntries.length > 0) {
    const maxStat = statEntries.reduce((a, b) => b[1] > a[1] ? b : a);
    const roleMap: Record<string, string> = {
      ATK: 'Attacker',
      DEF: 'Defender',
      SPD: 'Scout',
      FOC: 'Support',
      LCK: 'Gambler',
      VIT: 'Tank',
    };
    if (roleMap[maxStat[0]]) tags.push(roleMap[maxStat[0]]);
  }

  return tags;
}
