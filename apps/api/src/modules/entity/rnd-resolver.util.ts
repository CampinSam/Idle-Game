import { VISIBLE_STATS } from '@derp/math';

/**
 * Resolves the `RND` key in a stat map into randomly chosen visible stats.
 *
 * Resolution semantics:
 * - `RND: N` (number) — picks ONE random visible stat and adds N to it.
 * - `RND: [A, B, ...]` (array) — each element independently picks a random
 *   visible stat and adds its value. The same stat may be chosen more than
 *   once by chance (picks are independent). Zero entries are skipped.
 *
 * Always returns a new map with no `RND` key, even when RND is 0, empty, or
 * absent. The input stat map is not mutated.
 *
 * @param statMap   A stat map that may contain an `RND` key.
 * @param picker    Optional override for the random-stat picker (for tests).
 */
export function resolveRnd(
  statMap: Record<string, number | number[]>,
  picker?: (visibleStats: readonly string[]) => string,
): Record<string, number> {
  // Build result without the RND key — always strip it regardless of value.
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(statMap)) {
    if (key !== 'RND') {
      result[key] = value as number;
    }
  }

  const rndValue = statMap['RND'];
  if (rndValue !== undefined) {
    const chooseStat = picker ?? defaultPicker;
    const entries = Array.isArray(rndValue) ? rndValue : [rndValue];
    for (const n of entries) {
      if (typeof n === 'number' && n !== 0) {
        const chosen = chooseStat(VISIBLE_STATS);
        result[chosen] = (result[chosen] ?? 0) + n;
      }
    }
  }

  return result;
}

function defaultPicker(visibleStats: readonly string[]): string {
  return visibleStats[Math.floor(Math.random() * visibleStats.length)];
}
