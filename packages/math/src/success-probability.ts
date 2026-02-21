/**
 * Calculate success chance for a mission.
 * minChance / maxChance are integers 0–100.
 * Returns a float 0–1 for use with rng.chance().
 */
export const calculateSuccessChance = (
  mp: number,
  difficulty: number,
  minChance = 0,
  maxChance = 100,
): number => {
  const raw = mp / (mp + difficulty);
  return Math.min(Math.max(raw, minChance / 100), maxChance / 100);
};
