import { describe, it, expect } from 'vitest';
import { formatSeasonRemaining } from './formatSeasonRemaining';

describe('formatSeasonRemaining', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it('returns ENDED for past timestamps', () => {
    const past = new Date(now - 60_000).toISOString();
    expect(formatSeasonRemaining(past, now)).toBe('ENDED');
  });

  it('returns ENDED for the exact same instant', () => {
    const sameInstant = new Date(now).toISOString();
    expect(formatSeasonRemaining(sameInstant, now)).toBe('ENDED');
  });

  it('returns ENDED for invalid date strings', () => {
    expect(formatSeasonRemaining('not-a-date', now)).toBe('ENDED');
  });

  it('formats days and hours when more than a day remains', () => {
    const endsAt = new Date(now + (3 * 24 + 7) * 60 * 60 * 1000).toISOString();
    expect(formatSeasonRemaining(endsAt, now)).toBe('3d 7h');
  });

  it('formats hours and minutes when less than a day remains', () => {
    const endsAt = new Date(now + (5 * 60 + 23) * 60 * 1000).toISOString();
    expect(formatSeasonRemaining(endsAt, now)).toBe('5h 23m');
  });

  it('shows 0d when exactly less than 24h remains and uses h/m form', () => {
    const endsAt = new Date(now + 23 * 60 * 60 * 1000).toISOString();
    expect(formatSeasonRemaining(endsAt, now)).toBe('23h 0m');
  });
});
