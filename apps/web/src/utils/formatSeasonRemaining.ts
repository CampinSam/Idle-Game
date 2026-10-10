import { serverNow } from '../services/clockSync';

/**
 * Format the remaining time for an active season as a short human label.
 * Returns 'ENDED' for past or invalid timestamps.
 *
 * Pure function so it can be unit-tested without rendering React.
 * Pass an explicit `now` (ms) to override the server-synced clock — useful in tests.
 */
export function formatSeasonRemaining(endsAtIso: string, now: number = serverNow()): string {
  const end = new Date(endsAtIso).getTime();
  const ms = end - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'ENDED';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
