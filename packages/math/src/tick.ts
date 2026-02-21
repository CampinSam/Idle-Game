export interface TickRateInterval {
  effectiveFromTime: Date | string;
  effectiveFromTick: number;
  ticksPerSecond: number;
}

export function getCurrentTick(
  now: Date,
  rateHistory: TickRateInterval[],
): number {
  if (rateHistory.length === 0) {
    return 0;
  }

  const sorted = [...rateHistory].sort(
    (a, b) =>
      new Date(a.effectiveFromTime).getTime() -
      new Date(b.effectiveFromTime).getTime(),
  );

  const nowMs = now.getTime();
  let currentTick = 0;

  for (let i = 0; i < sorted.length; i++) {
    const interval = sorted[i];
    const intervalStartMs = new Date(interval.effectiveFromTime).getTime();

    if (intervalStartMs > nowMs) {
      break;
    }

    const nextIntervalStartMs =
      i + 1 < sorted.length
        ? new Date(sorted[i + 1].effectiveFromTime).getTime()
        : Infinity;

    const effectiveEndMs = Math.min(nowMs, nextIntervalStartMs);
    const durationSec = (effectiveEndMs - intervalStartMs) / 1000;

    currentTick = interval.effectiveFromTick + durationSec * interval.ticksPerSecond;
  }

  return currentTick;
}

export function ticksToMs(ticks: number, ticksPerSecond: number): number {
  if (ticksPerSecond <= 0) return Infinity;
  return (ticks / ticksPerSecond) * 1000;
}

export function msToTicks(ms: number, ticksPerSecond: number): number {
  return (ms / 1000) * ticksPerSecond;
}

export function getRemainingTicks(
  startTick: number,
  durationTicks: number,
  currentTick: number,
): number {
  const remaining = startTick + durationTicks - currentTick;
  return Math.max(0, remaining);
}

export function getRemainingMs(
  startTick: number,
  durationTicks: number,
  currentTick: number,
  currentRate: number,
): number {
  const remainingTicks = getRemainingTicks(startTick, durationTicks, currentTick);
  return ticksToMs(remainingTicks, currentRate);
}

export function isComplete(
  startTick: number,
  durationTicks: number,
  currentTick: number,
): boolean {
  return currentTick >= startTick + durationTicks;
}

export function durationMinutesToTicks(
  durationMinutes: number,
  baseRate: number = 1.0,
): number {
  return durationMinutes * 60 * baseRate;
}

export function durationSecondsToTicks(
  durationSeconds: number,
  baseRate: number = 1.0,
): number {
  return durationSeconds * baseRate;
}
