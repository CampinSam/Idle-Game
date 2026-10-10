// Shared cadence-window math used by both the daily check-in track
// (`CheckInService`) and the daily/weekly quest reset logic
// (`QuestService`). Centralizing here keeps the two systems in lockstep:
// "today" must mean the same UTC window everywhere, otherwise a player
// would see their daily check-in roll over at one moment and their daily
// quest at another.

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'every_x_days' | 'oneoff';

export interface FrequencyShape {
  type?: Cadence | string;
  interval?: number;
}

/**
 * Returns the start of the current window (in UTC) that `now` falls into,
 * given a frequency descriptor. UTC is used everywhere because we have no
 * per-user timezone and a single global rollover is the only way to keep
 * leaderboards / event timing fair.
 *
 * - `daily`         → today at 00:00:00 UTC
 * - `weekly`        → Monday of this week at 00:00:00 UTC (ISO week)
 * - `monthly`       → the 1st of this month at 00:00:00 UTC
 * - `every_x_days`  → epoch-aligned window of `interval` days
 * - anything else   → falls back to daily, so a malformed config can't
 *                     accidentally produce a multi-year window.
 */
export function getWindowStart(frequency: FrequencyShape | Cadence | undefined, now: Date): Date {
  const freq: FrequencyShape =
    typeof frequency === 'string' ? { type: frequency } : (frequency ?? {});
  const type = freq.type ?? 'daily';
  const interval = freq.interval ?? 1;

  if (type === 'daily') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  if (type === 'every_x_days') {
    const epochMs = now.getTime();
    const windowMs = interval * 24 * 60 * 60 * 1000;
    return new Date(Math.floor(epochMs / windowMs) * windowMs);
  }

  if (type === 'weekly') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    // ISO week: Monday = 0, Sunday = 6
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d;
  }

  if (type === 'monthly') {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  // 'oneoff' or anything unknown — no window. Caller should treat
  // `oneoff` as "never resets" rather than relying on this return value.
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getWindowDurationMs(frequency: FrequencyShape | Cadence | undefined): number {
  const freq: FrequencyShape =
    typeof frequency === 'string' ? { type: frequency } : (frequency ?? {});
  const type = freq.type ?? 'daily';
  const interval = freq.interval ?? 1;

  if (type === 'daily') return 24 * 60 * 60 * 1000;
  if (type === 'every_x_days') return interval * 24 * 60 * 60 * 1000;
  if (type === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  if (type === 'monthly') return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/**
 * How many complete windows have elapsed between `lastClaimedAt` and `now`.
 * Returns 1 if `lastClaimedAt` is null (i.e. the player has never claimed —
 * one window is "available"). Returns 0 if both fall in the same window.
 */
export function windowsMissed(
  lastClaimedAt: Date | null,
  frequency: FrequencyShape | Cadence | undefined,
  now: Date,
): number {
  if (!lastClaimedAt) return 1;
  const lastWindowStart = getWindowStart(frequency, lastClaimedAt);
  const currentWindowStart = getWindowStart(frequency, now);
  const durationMs = getWindowDurationMs(frequency);
  const diff = currentWindowStart.getTime() - lastWindowStart.getTime();
  return Math.floor(diff / durationMs);
}
