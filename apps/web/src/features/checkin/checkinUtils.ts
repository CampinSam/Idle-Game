export function getWindowDurationMs(frequency: any): number {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;
  if (type === 'daily') return 24 * 60 * 60 * 1000;
  if (type === 'every_x_days') return interval * 24 * 60 * 60 * 1000;
  if (type === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  if (type === 'monthly') return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function getWindowStart(frequency: any, now: Date): Date {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;
  if (type === 'daily') {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
  }
  if (type === 'every_x_days') {
    const windowMs = interval * 24 * 60 * 60 * 1000;
    return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  }
  if (type === 'weekly') {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d;
  }
  if (type === 'monthly') {
    const d = new Date(now); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d;
  }
  const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
}

export function formatCountdown(ms: number): string | null {
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function isInstanceCheckInAvailable(instance: any, nowMs: number): boolean {
  if (!instance) return false;
  const frequency = instance.checkInDef?.frequency ?? { type: 'daily' };
  if (!instance.lastClaimedAt) return true;
  const lastClaimed = new Date(instance.lastClaimedAt);
  const windowStart = getWindowStart(frequency, new Date(nowMs));
  return lastClaimed < windowStart;
}
