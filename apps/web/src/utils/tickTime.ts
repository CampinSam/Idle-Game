import { createCountdownTimer } from '../tick/TickTimer';

export function getTickRemainingMs(item: { startTick: number; durationTicks: number }, currentTick: number, tickRate: number): number {
  if (item.startTick == null || item.durationTicks == null || tickRate <= 0) return Infinity;
  const timer = createCountdownTimer({ startTick: item.startTick, durationTicks: item.durationTicks });
  return timer.getRemainingMs(currentTick, tickRate);
}

export function getTickTotalDurationMs(item: { durationTicks: number }, tickRate: number): number {
  if (!item.durationTicks || !tickRate) return 1;
  return (item.durationTicks / tickRate) * 1000;
}

export function getTickProgress(item: { startTick: number; durationTicks: number }, currentTick: number, tickRate: number): number {
  const total = getTickTotalDurationMs(item, tickRate);
  const remaining = getTickRemainingMs(item, currentTick, tickRate);
  if (total <= 0 || remaining === Infinity) return 2;
  return Math.min(100, Math.max(2, ((total - remaining) / total) * 100));
}
