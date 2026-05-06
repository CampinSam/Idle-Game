/**
 * HomePageV2 — PROXY DATA ONLY
 * ---------------------------------------------------------------
 * Every constant in this file is a frontend placeholder used to
 * scaffold the redesigned `/home/v2`. None of these values come
 * from the server. This file is the ONLY place proxy values for
 * the new home screen are allowed to live. Each constant is
 * tagged with the future system that should replace it.
 */

export interface BuildingPlateProxy {
  /** Display name shown on the plate. */
  name: string;
  /** Building level. Will be looked up from real `buildings` later. */
  level: number;
  /** % from the left edge of the scene image. */
  xPct: number;
  /** % from the top edge of the scene image. */
  yPct: number;
}

export const HOME_V2_PROXY = {
  // PROXY: replace when the Season service ships (server-driven
  // current season name + ends-at + sigil, delivered via the
  // bootstrap snapshot — see Task #191).
  season: {
    name: 'SEASON 1 · COSMIC JAMBOREE',
    endsAtMs: Date.now() + 1000 * 60 * 60 * 24 * 32 + 1000 * 60 * 60 * 14,
    sigil: '🪐',
  },
  // PROXY: replace when the Battle Pass system ships (tier, xp,
  // xpToNext, next reward sourced from a player-owned BP record —
  // see Task #191).
  battlePass: {
    tier: 27,
    tierMax: 50,
    xp: 4200,
    xpToNext: 6000,
    rewardLabel: 'Tier 28 · Cosmic Crate',
  },
  // PROXY: replace when the Seasonal Boss system ships (server-tracked
  // global HP and per-defeat reward bundle — see Task #191).
  boss: {
    name: 'THE VOID DEVOURER',
    subtitle: 'Seasonal raid',
    hpPercent: 73,
    sigil: '👁️',
  },
  // PROXY: replace when region-level boost / threat tags ship
  // (data-driven badges sourced from the active region or a future
  // region-event service). Real `useActiveBoosts()` is already
  // preferred for the boost slot when a global boost is live.
  region: {
    name: 'DERPSHIRE VALLEY',
    safetyLabel: 'SAFE REGION',
    boostLabel: 'x2 · 1H 32M',
    threatLabel: '28%',
    sceneImagePath: '/media/images/regions/derpshire-valley.png',
    // PROXY: building plate positions are decorative overlays. Names
    // and levels will be replaced by real `buildings[]` data once a
    // region→outpost map exists; positions stay frontend-only.
    buildingPlates: [
      { name: 'KEEPER HQ',  level: 12, xPct: 18, yPct: 28 },
      { name: 'WORKSHOP',   level: 10, xPct: 62, yPct: 22 },
      { name: 'ARCANE LAB', level:  9, xPct: 78, yPct: 50 },
      { name: 'BARRACKS',   level: 10, xPct: 30, yPct: 64 },
      { name: 'MINE',       level: 11, xPct: 70, yPct: 78 },
    ] as BuildingPlateProxy[],
  },
  // PROXY: replace when a real roster cap signal exists on the
  // player profile (`profile.entitySlots` / similar). Used purely to
  // render an x/y denominator on the Birds quick-link tile.
  birdRosterCap: 50,
  // PROXY: replace when seasonal events ship as a real list on the
  // server. Rendered when no real `useHomeBanners()` payload exists
  // so the Events card is never empty for design review.
  fallbackEvents: [
    { id: 'evt_double_xp',   icon: '⚡', title: 'Double XP Weekend',   subtitle: '+100% mission XP',  remaining: '1d 14h' },
    { id: 'evt_lucky_pulls', icon: '🎁', title: 'Lucky Pulls',          subtitle: 'Boosted lootboxes', remaining: '2d 6h'  },
  ],
} as const;

export function formatProxyCountdown(targetMs: number): string {
  const remaining = targetMs - Date.now();
  if (remaining <= 0) return 'ENDED';
  const totalMin = Math.floor(remaining / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${mins}M`;
  return `${mins}M`;
}
