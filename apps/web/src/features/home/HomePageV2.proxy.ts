/**
 * HomePageV2 — PROXY DATA ONLY
 * ---------------------------------------------------------------
 * Every constant in this file is a frontend placeholder used to
 * scaffold the new homescreen layout. None of these values come
 * from the server. This file is the ONLY place proxy values for
 * the new home screen are allowed to live. Each constant is
 * tagged with the future system that should replace it.
 */

export const HOME_V2_PROXY = {
  // PROXY: replace when the Season service ships (server-driven
  // current season name + ends-at, delivered via bootstrap snapshot).
  season: {
    name: 'Season of the Void',
    endsAtMs: Date.now() + 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 60 * 14,
  },
  // PROXY: replace when the Battle Pass system ships (tier, xp,
  // xpToNext, next reward label sourced from a player-owned model).
  battlePass: {
    tier: 12,
    tierMax: 50,
    xp: 340,
    xpToNext: 500,
    nextRewardLabel: 'Tier 13 · Crystal Cache',
  },
  // PROXY: replace when the Seasonal Boss system ships (server-tracked
  // global HP, threat percentage, and the per-defeat reward bundle).
  boss: {
    name: 'THE VOID DEVOURER',
    subtitle: 'Global raid · all keepers chip damage',
    hpPercent: 67,
    threatPercent: 42,
    rewardLabel: 'Defeat for Void Shards',
  },
  // PROXY: replace when region-level boost / threat tags ship
  // (data-driven badges sourced from the active region or a future
  // region-event service). Real `useActiveBoosts()` is already
  // preferred for the boost slot when a global boost is live.
  region: {
    boostLabel: '2× WEEKEND',
    threatLabel: 'CORRUPTION RISING',
  },
  // PROXY: replace when a real roster cap signal exists on the
  // player profile (`profile.entitySlots` / similar). Used purely to
  // render an x/y denominator on the Birds quick-link tile.
  birdRosterCap: 50,
} as const;

export function formatProxyCountdown(targetMs: number): string {
  const remaining = targetMs - Date.now();
  if (remaining <= 0) return 'ENDED';
  const totalMin = Math.floor(remaining / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
