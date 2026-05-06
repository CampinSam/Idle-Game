/**
 * HomePageV2 — PROXY DATA ONLY
 * ---------------------------------------------------------------
 * Every constant in this file is a frontend placeholder used to
 * scaffold the new homescreen layout. None of these values come
 * from the server. When real systems land (season service, battle
 * pass, world boss), delete the corresponding constant here and
 * route the page to a real `useSync*` hook instead. This file is
 * the ONLY place proxy values for the new home screen are allowed
 * to live.
 */

export const HOME_V2_PROXY = {
  season: {
    name: 'Season of the Void',
    endsAtMs: Date.now() + 1000 * 60 * 60 * 24 * 6 + 1000 * 60 * 60 * 14,
  },
  battlePass: {
    tier: 12,
    tierMax: 50,
    xp: 340,
    xpToNext: 500,
    nextRewardLabel: 'Tier 13 · Crystal Cache',
  },
  boss: {
    name: 'THE VOID DEVOURER',
    subtitle: 'Global raid · all keepers chip damage',
    hpPercent: 67,
    threatPercent: 42,
    rewardLabel: 'Defeat for Void Shards',
  },
  region: {
    boostLabel: '2× WEEKEND',
    threatLabel: 'CORRUPTION RISING',
  },
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
