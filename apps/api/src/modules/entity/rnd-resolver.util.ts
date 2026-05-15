import { VISIBLE_STATS } from '@derp/math';

/**
 * Resolves the `RND` key in a stat map into a randomly chosen visible stat.
 *
 * Resolution semantics:
 * - A single `RND: N` entry picks ONE random visible stat and adds N to it
 *   (all N points land on the same stat).
 * - If the caller passes a stat map built from multiple separate sources
 *   that each had an RND entry, they should call resolveRnd independently
 *   for each source so each picks separately.
 *
 * Always returns a new map with no `RND` key, even when RND is 0 or absent.
 * The input stat map is not mutated.
 *
 * @param statMap   A stat map that may contain an `RND` key.
 * @param picker    Optional override for the random-stat picker (for tests).
 */
export function resolveRnd(
  statMap: Record<string, number>,
  picker?: (visibleStats: readonly string[]) => string,
): Record<string, number> {
  // Build result without the RND key — always strip it regardless of value.
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(statMap)) {
    if (key !== 'RND') {
      result[key] = value;
    }
  }

  const rndValue = statMap['RND'];
  if (typeof rndValue === 'number' && rndValue !== 0) {
    const chooseStat = picker ?? defaultPicker;
    const chosen = chooseStat(VISIBLE_STATS);
    result[chosen] = (result[chosen] ?? 0) + rndValue;
  }

  return result;
}

function defaultPicker(visibleStats: readonly string[]): string {
  return visibleStats[Math.floor(Math.random() * visibleStats.length)];
}
